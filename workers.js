// Cloudflare Worker — SELF-HOST TEMPLATE for Crypto Portfolio Analyzer.
//
// This is a copy of worker.js with placeholder values for forking / self-hosting.
// 1. Copy/rename this file to `worker.js`
// 2. Edit ALLOWED_ORIGIN below to your GitHub Pages / custom domain origin.
// 3. Set secrets: `wrangler secret put MEGANODE_KEY` (BNB, free MegaNode) and
//    `wrangler secret put BLOCKFROST_KEY` (Cardano, free Blockfrost).
// 4. Edit index.html `PROXY_BASE` to your `https://<your-worker>.<subdomain>.workers.dev/api`
//    then `wrangler deploy`. See README.md Self-hosting for full steps.
//
// GitHub Pages (or any static host) serves index.html. This Worker only proxies
// on-chain data so the browser never needs an API key or hits CORS:
//   /api/cardano/* -> Blockfrost (Cardano, via BLOCKFROST_KEY secret)
//   /api/evm/*     -> Blockscout per chain (keyless) or MegaNode BSCTrace for BNB 56 (via MEGANODE_KEY)
//
// Hardening: allowlist for upstream hosts / query params / Blockfrost paths,
// per-IP sliding-window rate limit + 429 retry with backoff, MAX_BODY_SIZE cap,
// CORS Allow-Headers restricted. Not an open proxy.

const EXPLORERS = {
  '1': { host: 'https://eth.blockscout.com', keyless: true },
  '10': { host: 'https://explorer.optimism.io', keyless: true },
  '137': { host: 'https://polygon.blockscout.com', keyless: true },
  '42161': { host: 'https://arbitrum.blockscout.com', keyless: true },
  '8453': { host: 'https://base.blockscout.com', keyless: true },
  '43114': { host: 'https://subnets.avax.network', keyless: true }
};

const BLOCKFROST = 'https://cardano-mainnet.blockfrost.io/api/v0';

// TODO: Replace with your deployed site origin, e.g. https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO/
// This origin lock returns 403 for any site not on your allowlist, so the public Worker URL cannot be abused.
const ALLOWED_ORIGIN = 'https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPO/';

function isAllowedOrigin(request) {
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  const allowedHost = new URL(ALLOWED_ORIGIN).host;
  try { if (origin && new URL(origin).host === allowedHost) return true; } catch (e) {}
  try { if (referer && new URL(referer).host === allowedHost) return true; } catch (e) {}
  return false;
}

const BLOCKFROST_ALLOWED_PREFIXES = ['/addresses/', '/txs/', '/assets/'];
const BLOCKFROST_ALLOWED_PARAMS = new Set(['order', 'page', 'count', 'from', 'to']);
const EVM_ALLOWED_PARAMS = new Set([
  'module', 'action', 'address', 'page', 'offset', 'sort', 'startblock', 'endblock'
]);

const MAX_BODY_SIZE = 2 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 120;
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
  if (!arr) { arr = []; buckets.set(ip, arr); }
  while (arr.length && arr[0] <= now - RATE_LIMIT_WINDOW_MS) arr.shift();
  if (buckets.size > 10000) buckets.clear();
  if (arr.length >= RATE_LIMIT_MAX) return false;
  arr.push(now);
  return true;
}

async function proxyUpstream(target, cors, ip) {
  if (!rateLimitOk(ip)) return jsonError(429, 'Rate limit exceeded. Please slow down.');
  const MAX_RETRIES = 3;
  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 1200 * Math.pow(2, attempt - 1)));
    try {
      const upstream = await fetch(target, { method: 'GET', headers: { 'user-agent': 'crypto-portfolio-proxy' } });
      if (upstream.status === 429) { lastErr = 'upstream returned HTTP 429'; continue; }
      const reader = upstream.body.getReader();
      const chunks = []; let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > MAX_BODY_SIZE) { reader.cancel().catch(() => {}); return jsonError(502, 'Upstream response too large.'); }
        chunks.push(value);
      }
      const body = new Uint8Array(received); let pos = 0;
      for (const c of chunks) { body.set(c, pos); pos += c.length; }
      return new Response(body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', ...cors } });
    } catch (err) { lastErr = err; }
  }
  return jsonError(502, 'Upstream request failed after retries: ' + (lastErr && lastErr.message ? lastErr.message : String(lastErr)));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = clientIp(request);
    if (!isAllowedOrigin(request)) {
      return new Response('Forbidden: proxy is restricted to the deployed GitHub Pages site.', { status: 403, headers: corsHeaders() });
    }
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });

    if (url.pathname.startsWith('/api/cardano/')) {
      if (!env.BLOCKFROST_KEY) return jsonError(500, 'Cardano proxy is missing the BLOCKFROST_KEY secret. Set it with: wrangler secret put BLOCKFROST_KEY');
      const rest = url.pathname.slice('/api/cardano'.length);
      if (!BLOCKFROST_ALLOWED_PREFIXES.some(p => rest.startsWith(p))) return jsonError(403, 'Blockfrost endpoint not allowed: ' + rest);
      for (const [k] of url.searchParams.entries()) if (!BLOCKFROST_ALLOWED_PARAMS.has(k)) return jsonError(403, 'Query parameter not allowed: ' + k);
      const target = BLOCKFROST + rest + url.search;
      if (!rateLimitOk(ip)) return jsonError(429, 'Rate limit exceeded. Please slow down.');
      const MAX_RETRIES = 3; let lastErr = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 900 * Math.pow(2, attempt - 1)));
        try {
          const upstream = await fetch(target, { method: 'GET', headers: { 'project_id': env.BLOCKFROST_KEY, 'user-agent': 'crypto-portfolio-proxy' } });
          if (upstream.status === 429) { lastErr = 'Blockfrost 429'; continue; }
          const reader = upstream.body.getReader(); const chunks = []; let received = 0;
          while (true) { const { done, value } = await reader.read(); if (done) break; received += value.length; if (received > MAX_BODY_SIZE) { reader.cancel().catch(() => {}); return jsonError(502, 'Upstream response too large.'); } chunks.push(value); }
          const body = new Uint8Array(received); let pos = 0; for (const c of chunks) { body.set(c, pos); pos += c.length; }
          return new Response(body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', ...corsHeaders() } });
        } catch (err) { lastErr = err; }
      }
      return jsonError(502, 'Blockfrost request failed after retries: ' + (lastErr && lastErr.message ? lastErr.message : String(lastErr)));
    }

    if (url.pathname.startsWith('/api/evm/')) {
      const chainid = url.searchParams.get('chainid');
      if (chainid === '56') {
        if (!env.MEGANODE_KEY) return jsonError(500, 'BNB Chain proxy is missing the MEGANODE_KEY secret. Set it with: wrangler secret put MEGANODE_KEY');
        const address = (url.searchParams.get('address') || '').trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return jsonError(400, 'Missing or invalid address for BNB Chain');
        const action = url.searchParams.get('action');
        const sort = (url.searchParams.get('sort') || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
        const offset = Math.min(10000, Math.max(1, parseInt(url.searchParams.get('offset') || '10000', 10) || 10000));
        let categories;
        if (action === 'txlist') categories = ['external'];
        else if (action === 'txlistinternal') categories = ['internal'];
        else if (action === 'tokentx') categories = ['20', '721', '1155'];
        else return jsonError(400, 'Unsupported action for BNB Chain: ' + action);
        function megaToEtherscanRow(t) {
          const cat = t.category; const ts = t.blockTimeStamp ?? t.blockTimestamp ?? 0;
          const blockNumber = String(parseInt(t.blockNum || '0x0', 16)); const hash = t.hash || ''; const from = t.from || ''; const to = t.to || '';
          let valueDec = '0'; try { valueDec = BigInt(t.value || '0x0').toString(); } catch (e) {}
          const isToken = (cat === '20' || cat === '721' || cat === '1155');
          if (!isToken) return { blockNumber, timeStamp: String(ts), hash, from, to, value: valueDec, gas: t.gasUsed != null ? String(t.gasUsed) : '0', gasPrice: t.gasPrice != null ? String(t.gasPrice) : '0', gasUsed: t.gasUsed != null ? String(t.gasUsed) : '0', isError: '0', txreceipt_status: String(t.receiptsStatus ?? '1'), input: '0x', contractAddress: t.contractAddress || '' };
          let decStr = '18'; if (t.decimal != null) { const raw = String(t.decimal); decStr = raw.startsWith('0x') ? String(parseInt(raw, 16)) : raw; } else if (cat === '721' || cat === '1155') decStr = '0';
          const row = { blockNumber, timeStamp: String(ts), hash, from, to, value: valueDec, contractAddress: t.contractAddress || '', tokenName: t.asset || '', tokenSymbol: t.asset || '', tokenDecimal: decStr };
          if (t.erc721TokenId) { try { row.tokenID = BigInt(t.erc721TokenId).toString(); } catch (e) { row.tokenID = t.erc721TokenId; } }
          if (t.erc1155Metadata) row.erc1155Metadata = t.erc1155Metadata;
          return row;
        }
        if (!rateLimitOk(ip)) return jsonError(429, 'Rate limit exceeded. Please slow down.');
        async function fetchMegaDirection(directionKey) {
          let pageKey; let collected = []; const maxTotal = page * offset; const batchSize = Math.min(offset, 1000); const batchHex = '0x' + batchSize.toString(16); let loops = 0;
          while (collected.length < maxTotal && loops < 12) {
            const payload = { jsonrpc: '2.0', method: 'nr_getAssetTransfers', params: [{ category: categories, [directionKey]: address, order: sort, maxCount: batchHex, ...(pageKey ? { pageKey } : {}) }], id: 1 };
            let data = null;
            for (let r = 0; r <= 3; r++) {
              if (r > 0) await new Promise(rr => setTimeout(rr, 1200 * Math.pow(2, r - 1)));
              if (!rateLimitOk(ip)) return collected;
              const resp = await fetch('https://bsc-mainnet.nodereal.io/v1/' + env.MEGANODE_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json', 'user-agent': 'crypto-portfolio-proxy' }, body: JSON.stringify(payload) });
              if (resp.status === 429) continue;
              const text = await resp.text();
              try { data = JSON.parse(text); } catch (e) { data = null; }
              if (!resp.ok) { if (resp.status === 429) continue; throw new Error('MegaNode HTTP ' + resp.status + ': ' + text.slice(0, 200)); }
              if (data && data.error) { if (String(data.error.message || '').includes('429') || String(data.error.code || '') === '-32005') continue; throw new Error(data.error.message || 'MegaNode error'); }
              break;
            }
            if (!data || !data.result) break;
            const transfers = Array.isArray(data.result.transfers) ? data.result.transfers : [];
            for (const t of transfers) collected.push(megaToEtherscanRow(t));
            pageKey = data.result.pageKey;
            if (!pageKey || transfers.length < batchSize) break;
            loops++; await new Promise(r => setTimeout(r, 150));
          }
          return collected;
        }
        const [fromRows, toRows] = await Promise.all([fetchMegaDirection('fromAddress'), fetchMegaDirection('toAddress')]);
        const merged = new Map();
        for (const r of [...fromRows, ...toRows]) { const key = r.hash + '|' + (r.contractAddress || '') + '|' + r.from + '|' + r.to + '|' + r.value + '|' + r.blockNumber + '|' + (r.tokenID || ''); if (!merged.has(key)) merged.set(key, r); }
        let deduped = Array.from(merged.values());
        deduped.sort((a, b) => sort === 'asc' ? (parseInt(a.timeStamp) - parseInt(b.timeStamp)) : (parseInt(b.timeStamp) - parseInt(a.timeStamp)));
        const start = (page - 1) * offset; const slice = deduped.slice(start, start + offset);
        return new Response(JSON.stringify({ status: '1', message: 'OK', result: slice }), { headers: { 'content-type': 'application/json', ...corsHeaders() } });
      }
      const cfg = EXPLORERS[chainid];
      if (!cfg) return jsonError(404, 'Unsupported or unavailable EVM chain (chainid ' + chainid + ').');
      const filtered = new URLSearchParams();
      for (const [k, v] of url.searchParams.entries()) { if (k === 'chainid') continue; if (!EVM_ALLOWED_PARAMS.has(k)) return jsonError(403, 'Query parameter not allowed: ' + k); filtered.set(k, v); }
      filtered.delete('apikey');
      const target = cfg.host + '/api?' + filtered.toString();
      return proxyUpstream(target, corsHeaders(), ip);
    }

    return new Response(JSON.stringify({ ok: true, service: 'crypto-portfolio-proxy', note: 'This worker only proxies /api/*. Serve index.html from your static host.' }), { status: 200, headers: { 'content-type': 'application/json', ...corsHeaders() } });
  }
};
