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

## What's new (compared to the previous deployed version)

| Area | Previous | Current |
|------|----------|---------|
| **Cost-basis methods** | FIFO only | **5 methods**: ACB (default), FIFO, LIFO, HIFO, UK Section 104 shared pool |
| **On-chain wallets** | Not supported | **Full support**: Bitcoin, EVM (7 chains), Solana, Cardano, XRP Ledger — auto-links withdrawals to on-chain receipts and carries cost basis |
| **Cloudflare Worker proxy** | Not present | **Optional proxy** (`workers.js` + `wrangler.toml`) for keyless EVM/Cardano data; self-hosters deploy their own |
| **Landing page** | Basic | **Bilingual** (zh-Hant / EN) hero, feature grid, 3-step guide, privacy section, Home button |
| **Persistence** | localStorage only | **AES-GCM encrypted** (Web Crypto + IndexedDB) + localStorage |
| **Exports** | CSV only | **CSV + PNG** (full report image with charts, tables, disclaimer) |
| **Fee tracking** | Basic sum | **Total fees (USD estimate) + zero-cost asset list** (airdrops / Launchpool rewards) |
| **Growth chart** | Cost vs. value lines | **Buy/sell markers**, per-coin cost-basis lines, zoom/pan, range tabs |
| **Allocation chart** | Not present | **Pie chart** by coin or by category (stablecoins / major / altcoins) |
| **Realized P/L** | FIFO only, by year | **All 5 methods**, grouped by sale year with subtotals & cumulative total |
| **Debug / audit** | None | **Operation-type stats table** |

## Features

- **Bilingual landing page** — zh-Hant / English hero, feature grid, three-step quick-start, and privacy section. First-time visitors click **Start Analyzing**; returning visitors with saved data go straight to the analyzer, and a **Home** button returns to the landing page.
- **Drag-and-drop CSV import (multi-file)** — accepts the standard Binance export (`User ID, Time, Account, Operation, Coin, Change, Remark`). Multiple files are auto-merged, whole-file content hashes de-duplicate repeat uploads, and rows are sorted by time.
- **On-chain wallet tracking** — add public Bitcoin, EVM, Solana, Cardano, and XRP Ledger addresses. Supported EVM networks include Ethereum, BNB Chain, Polygon, Arbitrum One, OP Mainnet, Base, and Avalanche C-Chain. Native transfers, token transfers, swaps, and gas / network fees are converted into the same FIFO ledger as exchange rows. Most EVM data comes from keyless Blockscout, BNB Chain via MegaNode BSCTrace, and Cardano via Koios — all through the optional Cloudflare Worker proxy.
- **Accurate holdings calculation** — sums every recorded change per coin (buys, sells, fees, airdrops, rewards), matching your real exchange balance.
- **Cost-basis ledger (5 methods)** — reconstructs cost with your choice of Average Cost (ACB, default), FIFO, LIFO, HIFO, or the UK HMRC Section 104 shared pool (same-day + 30-day matching). Same-second `Transaction Buy` rows are paired with stablecoin spends, stablecoin fees join the acquisition cost, and remaining cost falls when assets are sold or withdrawn.
- **Realized P/L & annual summary** — realized gains/losses on every sale under the selected cost method, shown per coin and grouped by sale year with yearly subtotals and a cumulative total for tax reference.
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
5. Optional: add a self-custody address under **On-chain wallets** so assets withdrawn from the exchange continue to be tracked. With the optional Cloudflare Worker proxy deployed (see [Self-hosting](#self-hosting)). (Cardano requires the proxy because Koios blocks browser CORS).

To run it locally for testing:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## How the calculations work

| Metric | Method |
|---|---|
| **Holdings (amount)** | Sum of every recorded change per coin across all exchange rows and converted on-chain events |
| **Wallet transfers** | Binance withdrawals / deposits and on-chain receipts / dispatches are auto-linked when the on-chain leg arrives within 24 hours and within a 0.2% quantity tolerance (fully automatic, one-to-one, smallest time gap wins). Both legs are kept and the departure unit cost (under the selected method) is carried into the arrival lot, so later on-chain sales keep the original cost basis for realized P/L. Linked wallets (★) sync first; unlinked external inflows stay zero-cost |
| **Cost basis** | Selected method (card above the yearly P/L table; default ACB). FIFO/LIFO/HIFO consume chronological lots from the front/back/highest-cost-first; ACB keeps one average pool per coin. UK Section 104 keeps a shared pool per token: disposals first match same-day (UTC) acquisitions, then acquisitions within 30 days after the sale (FIFO), and only the remainder uses the pool average. Stablecoin inflows are cash principal at face value. Stablecoin `Transaction Spend` (plus stablecoin fees) is allocated across same-second buys; a buy fee paid in the acquired coin reduces that lot to the retained quantity, while a third-asset buy fee transfers that fee asset's cost (under the same method) into the acquired lot. Sales, withdrawals, and crypto swaps consume lots/pools and reduce remaining cost |
| **Market value** | Holdings × live price (or historical price, for the growth chart) from CoinGecko |
| **Unrealized P/L** | Market value − cost basis |
| **Realized P/L** | Net stablecoin proceeds minus consumed cost under the selected method. A sale fee paid in the sold coin is added to the disposed quantity, lowering its per-unit proceeds; a third-asset sale fee is valued at the fee asset's cost under the selected method and subtracted from realized P/L. Results are grouped by sale year for tax reference |
| **Total fees** | Sum of all `Transaction Fee` rows, converted to USD using current prices (approximate for non-stablecoin fees) |

> [!IMPORTANT]
> Stablecoin deposits are treated as cash principal with a cost basis equal to their USD amount, so idle cash does not create artificial unrealized P/L. Non-stablecoin deposits, airdrops, and Launchpool rewards have no purchase price in the CSV and are recorded with a cost basis of `0`.

### Cost-basis method comparison (quick guide)

| Method | When to use | Tax authority recognition |
|--------|-------------|---------------------------|
| **ACB** (Average Cost Basis) | Default; simple, smooths cost over time. Mandatory in Canada (CRA). | Canada (CRA), some others |
| **FIFO** (First-In, First-Out) | Conservative; sells oldest lots first. Default in US. | US (IRS default), widely accepted |
| **LIFO** (Last-In, First-Out) | Defers gains in rising markets; leaves oldest low-cost lots on books. | Not widely accepted; check jurisdiction |
| **HIFO** (Highest-In, First-Out) | Minimizes realized gains (tax optimization). | Not recognized by UK HMRC, some others |
| **Section 104** (UK Shared Pool) | Mandatory for UK individuals; same-day + 30-day matching + pool average. | UK (HMRC) |

## Tech stack

- Vanilla JavaScript (no framework, no bundler)
- [Chart.js](https://www.chartjs.org/) for the growth and allocation charts
- [Hammer.js](https://hammerjs.github.io/) and [chartjs-plugin-zoom](https://github.com/chartjs/chartjs-plugin-zoom) for touch zoom / pan
- On-chain data: [Blockchain.info](https://www.blockchain.com/explorer), [Blockstream](https://blockstream.info/) (Bitcoin fallback), [Blockscout](https://www.blockscout.com/) (keyless EVM), [MegaNode BSCTrace](https://docs.nodereal.io/) (BNB Chain), [Koios](https://www.koios.rest/) (Cardano via proxy), [Etherscan V2](https://docs.etherscan.io/) (local EVM fallback), Solana RPC, and [Jupiter token metadata](https://lite-api.jup.ag/)
- [CoinGecko API](https://www.coingecko.com/en/api) for pricing data
- CSS custom properties for theming (dark / light)
- Web Crypto API (AES-GCM) + IndexedDB for encrypted persistence

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

1. **`index.html` → `PROXY_BASE` (around line 842)** — point the UI at **your** Worker:

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

- **Cardano** is proxied through [Koios](https://www.koios.rest/) (free, no key required) via the Worker. No extra secret needed.

> [!NOTE]
> The Worker only answers `/api/*` and never serves `index.html`. Serve the static site from GitHub Pages, Cloudflare Pages, Netlify, or any static host, and keep `workers.js` as a separate Worker. The `connect-src` CSP in `index.html` already allows `https://*.workers.dev` and the required explorer / RPC hosts; the Worker itself is an allow-listed, rate-limited proxy (not an open proxy).

## Known limitations

- Exchange CSV import still supports Binance's standard export format only; other exchanges are not currently supported.
- Wallet history depth depends on the provider: Bitcoin uses Blockchain.info pages with a recent Blockstream fallback, EVM uses up to 50,000 normal / internal transactions plus 50,000 token transfers (BNB via MegaNode paginates by `pageKey`), Solana uses its RPC's latest 500 signatures, Cardano uses up to 300 Koios transactions (100 per page × 3 pages), and XRPL uses up to 25 `account_tx` pages. Very large or archived histories may require repeated syncing or future provider support.
- Cardano is proxied through Koios via the Cloudflare Worker. The Worker is required because Koios blocks browser CORS.
- A non-stablecoin on-chain inflow with no matching exchange transfer and no stablecoin / crypto payment leg is treated as zero-cost, because an address alone cannot reveal its original purchase price.
- With the Cloudflare Worker proxy, most EVM networks use keyless Blockscout and need no API key (BNB uses MegaNode via Worker secret, Cardano uses Koios via Worker); without the proxy, EVM falls back to a user-supplied free Etherscan V2 key (Cardano has no local fallback — the proxy is required). Public Bitcoin / Solana endpoints may rate-limit or block browser traffic without notice.
- Realized P/L follows the cost method selected above the yearly table and matches buys / sells within the same second; very unusual multi-leg same-second trades may be approximated.
- HIFO minimizes gains but is not recognized by every tax authority (e.g. UK HMRC mandates Section 104 instead); confirm your jurisdiction's rules before filing.
- Section 104 same-day / 30-day matching uses UTC calendar days. Linked internal transfers (24h / 0.2% auto-link) carry pool-average cost and never enter matching; crypto-to-crypto swaps roll pool-average cost into the received asset with gains deferred, and stablecoin legs stay at face value.
- Third-asset transaction fees (for example BNB) are valued by the cost of the fee asset under the selected method. Buy fees increase the acquired asset's cost; sale fees reduce realized P/L. They also remain in the separate fee summary.
- Crypto-to-crypto swaps roll the disposed lot's cost into the received asset, but their realized market-value gain is deferred until that asset is sold for a stablecoin.
- Persistence uses localStorage plus IndexedDB; if the browser blocks storage (e.g. private mode) or runs in a non-secure context, data simply won't be restored.
- CoinGecko's free tier is rate-limited; refreshing prices too frequently may temporarily fail (the app falls back to the last known price).
- Upload caps: 50 MB per file, 200 MB per batch, 100 files per batch, and 250,000 merged rows; larger histories must be split into multiple files.
- Coin symbols are normalized to trimmed uppercase (`btc`, `BTC`, and padded ` ETH ` collapse into one holding) before aggregation.
- Tokens with no CoinGecko listing remain marked as N/A and are valued at $0 until a price is entered or cached.
- Transaction types not tied to a recognizable coin trade (e.g. prediction market orders) are counted toward holdings but excluded from cost-basis pairing.
- Historical prices from CoinGecko may differ slightly from your actual executed price on Binance.