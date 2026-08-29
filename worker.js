// Cloudflare Worker — pure on-chain data proxy for Crypto Portfolio Analyzer.
//
// GitHub Pages (or any static host) serves index.html. This Worker only proxies
// on-chain data so the browser never needs an API key or hits CORS:
//   /api/cardano/* -> Koios (Cardano, keyless)
//   /api/evm/*     -> Blockscout per chain (EVM, keyless) or BscScan (56, key injected server-side)
//
// Hardening applied here (see security review):
//   - Upstream hosts are kept on an allowlist so this is not an open proxy.
//   - Cardano forwards ONLY allowlisted Koios read endpoints.
//   - EVM forwards ONLY allowlisted query params.
//   - Per-client-IP rate limiting (sliding window).
//   - Upstream response size is capped to MAX_BODY_SIZE.
//   - CORS Allow-Headers is restricted to a known set.
// For BNB Chain (56) there is no keyless public explorer, so a free BscScan API
// key is injected from the worker secret BSCSCAN_KEY — the browser stays keyless.

const EXPLORERS = {
  '1': { host: 'https://eth.blockscout.com', keyless: true },
  '10': { host: 'https://explorer.optimism.io', keyless: true },
  '137': { host: 'https://polygon.blockscout.com', keyless: true },
  '42161': { host: 'https://arbitrum.blockscout.com', keyless: true },
  '8453': { host: 'https://base.blockscout.com', keyless: true },
  '43114': { host: 'https://subnets.avax.network', keyless: true },
  '56': { host: 'https://api.bscscan.com', keyless: false, keyEnv: 'BSCSCAN_KEY' }
};

const KOIOS = 'https://api.koios.rest';

// Only requests whose Origin/Referer come from this GitHub Pages site may use
// the proxy. Everything else gets 403, so the worker cannot be abused by third
// parties who copy its public URL. Set this to your GitHub Pages origin.
const ALLOWED_ORIGIN = 'https://tim0phy.github.io';

function isAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const allowedHost = new URL(ALLOWED_ORIGIN).host;
  try { if (origin && new URL(origin).host === allowedHost) return true; } catch (e) {}
  try { if (referer && new URL(referer).host === allowedHost) return true; } catch (e) {}
  return false;
}

// Only read-only Koios GET endpoints the app actually uses. Anything else is rejected.
const KOIOS_ALLOWED = new Set([
  '/address_txs',
  '/tx_info',
  '/asset_metadata',
  '/account_info',
  '/account_utxos',
  '/asset_history',
  '/policy_asset_info',
  '/credential_txs',
  '/epoch_info',
  '/tip'
]);

// Only these query params are forwarded to EVM explorers.
const EVM_ALLOWED_PARAMS = new Set([
  'module', 'action', 'address', 'page', 'offset', 'sort', 'startblock', 'endblock'
]);

const MAX_BODY_SIZE = 2 * 1024 * 1024; // 2 MB cap on upstream responses
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120; // requests per window per client IP

const buckets = new Map();

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type'
  };
}

function jsonError(status, message) {
  return new Response(
    JSON.stringify({ status: '0', message: message, result: null }),
    { status: status, headers: { 'content-type': 'application/json', ...corsHeaders() } }
  );
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';
}

function rateLimitOk(ip) {
  const now = Date.now();
  let arr = buckets.get(ip);
  if (!arr) {
    arr = [];
    buckets.set(ip, arr);
  }
  while (arr.length && arr[0] <= now - RATE_LIMIT_WINDOW_MS) {
    arr.shift();
  }
  // Keep the map from growing without bound.
  if (buckets.size > 10000) {
    buckets.clear();
  }
  if (arr.length >= RATE_LIMIT_MAX) {
    return false;
  }
  arr.push(now);
  return true;
}

async function proxyUpstream(target, cors, ip) {
  if (!rateLimitOk(ip)) {
    return jsonError(429, 'Rate limit exceeded. Please slow down.');
  }
  try {
    const upstream = await fetch(target, {
      method: 'GET',
      headers: { 'user-agent': 'crypto-portfolio-proxy' }
    });

    // Stream the body and abort if it exceeds the cap.
    const reader = upstream.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > MAX_BODY_SIZE) {
        reader.cancel().catch(() => {});
        return jsonError(502, 'Upstream response too large.');
      }
      chunks.push(value);
    }

    const body = new Uint8Array(received);
    let pos = 0;
    for (const c of chunks) {
      body.set(c, pos);
      pos += c.length;
    }

    const headers = {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      ...cors
    };
    return new Response(body, { status: upstream.status, headers: headers });
  } catch (err) {
    return jsonError(502, 'Upstream request failed: ' + (err && err.message ? err.message : String(err)));
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = clientIp(request);

    if (!isAllowedOrigin(request)) {
      return new Response('Forbidden: proxy is restricted to the deployed GitHub Pages site.',
        { status: 403, headers: corsHeaders() });
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // Cardano: forward ONLY allowlisted Koios read endpoints, preserving path + query (?_address=...).
    if (url.pathname.startsWith('/api/cardano/')) {
      const rest = url.pathname.slice('/api/cardano'.length); // e.g. /address_txs
      if (!KOIOS_ALLOWED.has(rest)) {
        return jsonError(403, 'Koios endpoint not allowed: ' + rest);
      }
      const target = KOIOS + '/api/v1' + rest + url.search;
      return proxyUpstream(target, corsHeaders(), ip);
    }

    // EVM: map chainid to an explorer. Keyless chains drop the key param;
    // BNB Chain (56) gets the server-side BscScan key injected from a secret.
    if (url.pathname.startsWith('/api/evm/')) {
      const chainid = url.searchParams.get('chainid');
      const cfg = EXPLORERS[chainid];
      if (!cfg) {
        return jsonError(404, 'Unsupported or unavailable EVM chain (chainid ' + chainid + ').');
      }
      if (!cfg.keyless && !env[cfg.keyEnv]) {
        return jsonError(500, 'BNB Chain proxy is missing the ' + cfg.keyEnv + ' secret. Set it with: wrangler secret put ' + cfg.keyEnv);
      }

      // Forward only allowlisted query params; reject anything unexpected.
      const filtered = new URLSearchParams();
      for (const [k, v] of url.searchParams.entries()) {
        if (k === 'chainid') continue;
        if (!EVM_ALLOWED_PARAMS.has(k)) {
          return jsonError(403, 'Query parameter not allowed: ' + k);
        }
        filtered.set(k, v);
      }
      url.searchParams.delete('chainid');
      if (cfg.keyless) {
        filtered.delete('apikey');
      } else {
        filtered.set('apikey', env[cfg.keyEnv]);
      }
      const target = cfg.host + '/api?' + filtered.toString();
      return proxyUpstream(target, corsHeaders(), ip);
    }

    // The static site is hosted elsewhere (e.g. GitHub Pages). This Worker only
    // answers /api/* — anything else just confirms the proxy is alive.
    return new Response(
      JSON.stringify({ ok: true, service: 'crypto-portfolio-proxy', note: 'This worker only proxies /api/*. Serve index.html from your static host.' }),
      { status: 200, headers: { 'content-type': 'application/json', ...corsHeaders() } }
    );
  }
};
