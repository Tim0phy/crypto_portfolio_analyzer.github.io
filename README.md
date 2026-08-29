# Crypto Portfolio Analyzer

<div align="center">

<img src="./docs/logo.svg" alt="Crypto Portfolio Analyzer logo" height="72" />

**Privacy-first portfolio tracker for Binance CSV exports and on-chain wallets**

[Overview](#overview) • [Features](#features) • [Getting started](#getting-started) • [How the calculations work](#how-the-calculations-work) • [Self-hosting](#self-hosting) • [Known limitations](#known-limitations)

</div>

A single-page web app that parses your Binance transaction-history CSV and imports public on-chain wallet activity to reconstruct combined portfolio holdings, cost basis, market value, and realized / unrealized P/L — entirely in your browser.

> [!NOTE]
> No backend, no accounts. Your CSV is parsed and processed 100% client-side. Public blockchain explorer / RPC requests transmit only the address you choose to track; price lookups use [CoinGecko](https://www.coingecko.com/en/api). Amounts and account credentials are never sent anywhere, because there is no app server.

## Overview

Exchange-native portfolio views and third-party tax tools (e.g. CoinLedger, Koinly) often misclassify Binance-specific transaction types — Launchpool subscriptions, Small Assets Exchange, Strategy trading rebates, internal transfers — leading to holdings and cost-basis figures that do not match your actual wallet balance. This tool recomputes both from the raw transaction ledger using a transparent, auditable method, so you can verify (or correct) what other tools report.

Everything runs locally:

- The merged analysis is encrypted with Web Crypto (AES-GCM, key stored in IndexedDB) and restored automatically on your next visit.
- The only network calls are to CoinGecko for prices and to public blockchain explorers / RPCs for on-chain activity. Coin symbols (and the address you track) are the only data sent.

## Features

- **Bilingual landing page** — a zh-Hant / English landing page with a hero, feature grid, three-step quick-start, and privacy section. First-time visitors click **Start Analyzing**; returning visitors with saved data go straight to the analyzer, and a Home button returns to the landing page.
- **Drag-and-drop CSV import (multi-file)** — accepts the standard Binance export (`User ID, Time, Account, Operation, Coin, Change, Remark`). Multiple files are auto-merged, whole-file content hashes de-duplicate repeat uploads, and rows are sorted by time.
- **On-chain wallet tracking** — add public Bitcoin, EVM, Solana, Cardano, and XRP Ledger addresses. Supported EVM networks include Ethereum, BNB Chain, Polygon, Arbitrum One, OP Mainnet, Base, and Avalanche C-Chain. Native transfers, token transfers, swaps, and gas / network fees are converted into the same FIFO ledger as exchange rows. Most EVM data comes from keyless Blockscout, BNB Chain via MegaNode BSCTrace, and Cardano via Blockfrost — all through the optional Cloudflare Worker proxy.
- **Accurate holdings calculation** — sums every recorded change per coin (buys, sells, fees, airdrops, rewards), matching your real exchange balance.
- **Cost-basis ledger** — builds chronological FIFO lots, matches `Transaction Buy` rows with stablecoin spends in the same second, includes stablecoin fees in acquisition cost, and reduces remaining cost when assets are sold or withdrawn.
- **Realized P/L & annual summary** — FIFO realized gains/losses on every sale, shown per coin and grouped by sale year with yearly subtotals and a cumulative total for tax reference.
- **Fee & zero-cost tracking** — total transaction-fee spend (estimated in USD at current prices) and a dedicated zero-cost assets list (airdrops / Launchpool rewards).
- **Live pricing** — current market prices via CoinGecko, automatic resolution of uncommon Binance symbols (with a cached local lookup), batched for large portfolios, and manual price override per coin for what-if analysis. Coins with no price data are flagged and valued at $0.
- **Growth chart** — cumulative cost basis vs. market value over time, with selectable ranges (1D / 1W / 1M / 1Y / ALL), buy / sell event markers (with trade details on hover), per-coin cost-basis lines, and scroll / pinch zoom with pan and reset.
- **Allocation chart** — pie breakdown of portfolio composition by market value, with a by-category grouping mode (stablecoins / major coins / other altcoins).
- **Exports** — download the computed holdings detail as CSV (including the yearly realized P/L breakdown), or export the whole overview as a PNG report image (summary metrics, both charts, holdings table, yearly realized P/L, and disclaimer).
- **Local persistence** — the merged analysis is AES-GCM encrypted with Web Crypto and automatically restored on the next visit, with a saved-data banner and a clear-data confirmation dialog.
- **Dark / light theme** and **zh-Hant / English** language toggle, both persisted via `localStorage`.

> [!TIP]
> Large histories (thousands of rows, many distinct coins) may take a few seconds to compute the growth chart, since historical prices are fetched per coin per selected range.

## Getting started

No build step, no dependencies to install — this is a single static HTML file.

1. Download `index.html` from this repository, or open the deployed website.
2. Open it directly in any modern browser. The landing page introduces the tool; click **Start Analyzing** to open the analyzer.
3. Export your transaction history from Binance: **Orders → Assets History → Transaction History → Export Transaction Records → Generate all statements → CSV**.
4. Drag one or more CSVs onto the upload zone, or click to browse.
5. Optional: add a self-custody address under **On-chain wallets** so assets withdrawn from the exchange continue to be tracked. With the optional Cloudflare Worker proxy deployed (see [Self-hosting](#self-hosting)). (Cardano still requires the proxy because Blockfrost blocks browser CORS).

To run it locally for testing:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## How the calculations work

| Metric | Method |
|---|---|
| **Holdings (amount)** | Sum of every recorded change per coin across all exchange rows and converted on-chain events |
| **Wallet transfers** | Matching Binance withdrawals / deposits and on-chain receipts / dispatches within a 72-hour quantity tolerance are paired and removed before analysis, preserving the original cost lot instead of double-counting it |
| **Cost basis** | Chronological FIFO lots. Stablecoin inflows are cash principal at face value. Stablecoin `Transaction Spend` (plus stablecoin fees) is allocated across same-second buys; a buy fee paid in the acquired coin reduces that lot to the retained quantity, while a third-asset buy fee transfers that fee asset's FIFO cost into the acquired lot. Sales, withdrawals, and crypto swaps consume lots and reduce remaining cost |
| **Market value** | Holdings × live price (or historical price, for the growth chart) from CoinGecko |
| **Unrealized P/L** | Market value − cost basis |
| **Realized P/L** | FIFO: net stablecoin proceeds minus the cost of the oldest lots consumed. A sale fee paid in the sold coin is added to the disposed quantity, lowering its per-unit proceeds; a third-asset sale fee is valued at the fee asset's FIFO cost and subtracted from realized P/L. Results are grouped by sale year for tax reference |
| **Total fees** | Sum of all `Transaction Fee` rows, converted to USD using current prices (approximate for non-stablecoin fees) |

> [!IMPORTANT]
> Stablecoin deposits are treated as cash principal with a cost basis equal to their USD amount, so idle cash does not create artificial unrealized P/L. Non-stablecoin deposits, airdrops, and Launchpool rewards have no purchase price in the CSV and are recorded with a cost basis of `0`.

## Tech stack

- Vanilla JavaScript (no framework, no bundler)
- [Chart.js](https://www.chartjs.org/) for the growth and allocation charts
- [Hammer.js](https://hammerjs.github.io/) and [chartjs-plugin-zoom](https://github.com/chartjs/chartjs-plugin-zoom) for touch zoom / pan
- On-chain data: [Blockchain.info](https://www.blockchain.com/explorer), [Blockscout](https://www.blockscout.com/) (keyless EVM), [MegaNode BSCTrace](https://docs.nodereal.io/) (BNB Chain), [Blockfrost](https://blockfrost.io/) (Cardano), [Etherscan V2](https://docs.etherscan.io/) (local EVM fallback), Solana RPC, and [Jupiter token metadata](https://lite-api.jup.ag/)
- [CoinGecko API](https://www.coingecko.com/en/api) for pricing data
- CSS custom properties for theming (dark / light)

## Self-hosting

The app is a static file and works by itself for Binance CSV analysis. The optional Cloudflare Worker (`workers.js`) only proxies on-chain data so end users never paste an API key and the browser never hits CORS. The three files have different destinations:

- **`index.html`** → push to GitHub Pages (or any static host — enable Pages on the `main` branch, root folder). GitHub Pages serves the UI.
- **`workers.js` + `wrangler.toml`** → deploy to **Cloudflare Workers** via Wrangler. They are **not** served by GitHub Pages; `wrangler deploy` uploads the Worker separately. Make sure `wrangler.toml` points at `workers.js` (its `main` field), which it does by default in this repo.

Deploy the Worker once:

1. Install wrangler: `npm install -g wrangler`
2. Log in: `wrangler login`
3. Deploy: `wrangler deploy`

### After deploying the Worker, you MUST edit two values before pushing your fork

Self-hosters who clone / download the repo must change these, or the app will keep calling the maintainer's proxy and be blocked by the origin lock:

1. **`index.html` → `PROXY_BASE` (around line 780)** — point the UI at **your** Worker:

   ```js
   // Change this to your own Cloudflare Workers domain:
   const PROXY_BASE = 'https://crypto-portfolio-proxy.<your-subdomain>.workers.dev/api';
   ```

   > [!WARNING]
   > Leaving the default `timophychanhy.workers.dev` URL means the app will call the maintainer's proxy. For privacy and to avoid the upstream rate limits / origin lock, replace it with your own Worker URL before deploying your fork.

2. **`workers.js` → `ALLOWED_ORIGIN`** — restrict the proxy so only **your** site may use it:

    ```js
    // workers.js — restrict the proxy to your deployed origin (GitHub Pages or custom domain)
   const ALLOWED_ORIGIN = 'https://your-github-username.github.io/your-repo/';
   ```

   Anything not from this origin gets `403 Forbidden`, so the public Worker URL cannot be abused by third parties.

### Optional: enable BNB Chain and Cardano through the proxy

- **BNB Chain (chain id 56)** has no keyless explorer. The Worker uses [MegaNode BSCTrace](https://docs.nodereal.io/) (free tier) via `nr_getAssetTransfers`. Create a free key at https://dashboard.nodereal.io/ and set it:

  ```bash
  wrangler secret put MEGANODE_KEY
  ```

  Without it, every other EVM chain (Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche) remains keyless via Blockscout, and BNB Chain simply returns `500 missing MEGANODE_KEY`.

- **Cardano** is proxied through [Blockfrost](https://blockfrost.io/) (free tier). Create a Cardano Mainnet `project_id` at https://blockfrost.io/ and set it:

  ```bash
  wrangler secret put BLOCKFROST_KEY
  ```

  Without it, Cardano sync returns `500 missing BLOCKFROST_KEY`. The browser stays keyless in both cases — keys live only as Worker secrets.

> [!NOTE]
> The Worker only answers `/api/*` and never serves `index.html`. Serve the static site from GitHub Pages, Cloudflare Pages, Netlify, or any static host, and keep `workers.js` as a separate Worker. The `connect-src` CSP in `index.html` already allows `https://*.workers.dev` and the required explorer / RPC hosts; the Worker itself is an allow-listed, rate-limited proxy (not an open proxy).

## Known limitations

- Exchange CSV import still supports Binance's standard export format only; other exchanges are not currently supported.
- Wallet history depth depends on the provider: Bitcoin uses Blockchain.info pages with a recent Blockstream fallback, EVM uses up to 50,000 normal / internal transactions plus 50,000 token transfers (BNB via MegaNode paginates by `pageKey`), Solana uses its RPC's latest 500 signatures, Cardano uses up to 300 Blockfrost transactions (100 per page × 3 pages), and XRPL uses up to 25 `account_tx` pages. Very large or archived histories may require repeated syncing or future provider support.
- Cardano is proxied through Blockfrost (`BLOCKFROST_KEY` Worker secret) and BNB Chain through MegaNode BSCTrace (`MEGANODE_KEY`). Both have free tiers; keys live only as Worker secrets so the browser stays keyless. Direct browser calls to Blockfrost are blocked by CORS, so the proxy is required for Cardano.
- A non-stablecoin on-chain inflow with no matching exchange transfer and no stablecoin / crypto payment leg is treated as zero-cost, because an address alone cannot reveal its original purchase price.
- With the Cloudflare Worker proxy, most EVM networks use keyless Blockscout and need no API key (BNB uses MegaNode, Cardano uses Blockfrost, both via Worker secrets); without the proxy, EVM falls back to a user-supplied free Etherscan V2 key (Cardano has no local fallback — the proxy is required). Public Bitcoin / Solana endpoints may rate-limit or block browser traffic without notice.
- Realized P/L uses FIFO and matches buys / sells within the same second; very unusual multi-leg same-second trades may be approximated.
- Third-asset transaction fees (for example BNB) are valued by the FIFO cost of the fee asset already reconstructed from the CSV. Buy fees increase the acquired asset's cost; sale fees reduce realized P/L. They also remain in the separate fee summary.
- Crypto-to-crypto swaps roll the disposed lot's cost into the received asset, but their realized market-value gain is deferred until that asset is sold for a stablecoin.
- Persistence uses localStorage plus IndexedDB; if the browser blocks storage (e.g. private mode) or runs in a non-secure context, data simply won't be restored.
- CoinGecko's free tier is rate-limited; refreshing prices too frequently may temporarily fail (the app falls back to the last known price).
- Upload caps: 50 MB per file, 200 MB per batch, 100 files per batch, and 250,000 merged rows; larger histories must be split into multiple files.
- Coin symbols are normalized to trimmed uppercase (`btc`, `BTC`, and padded ` ETH ` collapse into one holding) before aggregation.
- Tokens with no CoinGecko listing remain marked as N/A and are valued at $0 until a price is entered or cached.
- Transaction types not tied to a recognizable coin trade (e.g. prediction market orders) are counted toward holdings but excluded from cost-basis pairing.
- Historical prices from CoinGecko may differ slightly from your actual executed price on Binance.
