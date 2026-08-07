# Crypto Portfolio Analyzer

A privacy-first, single-page web app that parses your Binance transaction history CSV and reconstructs portfolio holdings, cost basis, market value, and realized/unrealized P/L entirely in your browser.

> [!NOTE]
> No backend, no accounts. Your CSV is parsed and processed 100% client-side. The only network calls are to the public [CoinGecko](https://www.coingecko.com/en/api) API for current and historical prices; those lookups transmit coin symbols only, never amounts or account data.

![screenshot-1786129054762.png](..\..\..\timop\Desktop\screenshot-1786129054762.png)
## Why this exists

Exchange-native portfolio views and third-party tax tools (e.g. CoinLedger, Koinly) often misclassify Binance-specific transaction types - Launchpool subscriptions, Small Assets Exchange, Strategy trading rebates, internal transfers - leading to holdings and cost basis figures that do not match your actual wallet balance. This tool recomputes both from the raw transaction ledger using a transparent, auditable method, so you can verify (or correct) what other tools report.

## Features

- **Bilingual landing page** - a zh-Hant/English landing page introduces the tool with a hero, feature grid, 3-step quick-start guide, and privacy section. First-time visitors click **Start Analyzing**; returning visitors with saved data go straight to the analyzer, and a Home button returns to the landing page.
- **Drag-and-drop CSV import (multi-file)** - accepts the standard Binance transaction history export (`User ID, Time, Account, Operation, Coin, Change, Remark`). Multiple files are auto-merged, whole-file content hashes de-duplicate repeat uploads, and rows are sorted by time.
- **Accurate holdings calculation** - sums every recorded change per coin (buys, sells, fees, airdrops, rewards), matching your real exchange balance.
- **Cost basis pairing engine** - matches `Transaction Buy` events to their corresponding `Transaction Spend` events (in USDT/USDC/BUSD/FDUSD) within the same second, and allocates spend proportionally across simultaneous buys.
- **Realized P/L & annual summary** - FIFO realized gains/losses on every sale, shown per coin and grouped by sale year with yearly subtotals and a cumulative total for tax reference.
- **Fee & zero-cost tracking** - total transaction-fee spend (estimated in USD at current prices) and a dedicated zero-cost assets list (airdrops / Launchpool rewards).
- **Live pricing** - fetches current market prices via CoinGecko, resolves uncommon Binance symbols automatically (with a cached local lookup), batches large portfolios, and supports manual price override per coin for what-if analysis. Coins with no price data are flagged and valued at $0.
- **Growth chart** - visualizes cumulative cost basis vs. market value over time, with selectable ranges (1D / 1W / 1M / 1Y / ALL), buy/sell event markers (with trade details on hover), per-coin cost basis lines, and scroll/pinch zoom with pan and reset.
- **Allocation chart** - pie breakdown of portfolio composition by market value, with a by-category grouping mode (stablecoins / major coins / other altcoins).
- **Exports** - download the computed holdings detail as CSV (including the yearly realized P/L breakdown), or export the whole overview as a PNG report image (summary metrics, both charts, holdings table, yearly realized P/L, and disclaimer).
- **Local persistence** - the merged analysis is AES-GCM encrypted with Web Crypto and automatically restored on the next visit, with a saved-data banner and a clear-data confirmation dialog.
- **Dark/light theme** and **zh-Hant/English** language toggle, both persisted via `localStorage`.

## Getting started

No build step, no dependencies to install. This is a static HTML file.

1. Download `index.html` from this repository or open the website.
2. Open it directly in any modern browser - a landing page introduces the tool; click **Start Analyzing** to open the analyzer.
3. Export your transaction history from Binance: **Orders -> Assets History -> Transaction History -> Export Transaction Records -> Generate all statements -> CSV**.
4. Drag one or more CSVs onto the upload zone, or click to browse.

> [!TIP]
> Large histories (thousands of rows, many distinct coins) may take a few seconds to compute the growth chart, since historical prices are fetched per coin per selected range.

## How the calculations work

| Metric | Method |
|---|---|
| **Holdings (amount)** | Sum of the `Change` column for each coin, across all rows |
| **Cost basis** | For each timestamp group, `Transaction Spend` in stablecoins is allocated proportionally across simultaneous `Transaction Buy` rows |
| **Market value** | Holdings x live price (or historical price, for the growth chart) from CoinGecko |
| **Unrealized P/L** | Market value - cost basis |
| **Realized P/L** | FIFO: on each sale (non-stablecoin `Transaction Sold` / `Transaction Revenue` with negative Change, matched with stablecoin `Transaction Revenue` in the same second), proceeds - cost of the oldest lots consumed (first-in-first-out); results are also grouped by sale year for tax reference |
| **Total fees** | Sum of all `Transaction Fee` rows, converted to USD using current prices (approximate for non-stablecoin fees) |

> [!IMPORTANT]
> Transactions with no matching `Transaction Spend` in the same second - plain deposits, airdrops, Launchpool rewards - are recorded with a cost basis of `0`. This is expected behavior, not a bug: these coins had no direct purchase cost.

## Tech stack

- Vanilla JavaScript (no framework, no bundler)
- [Chart.js](https://www.chartjs.org/) for the growth and allocation charts
- [Hammer.js](https://hammerjs.github.io/) and [chartjs-plugin-zoom](https://github.com/chartjs/chartjs-plugin-zoom) for touch zoom/pan
- [CoinGecko API](https://www.coingecko.com/en/api) (public, unauthenticated) for pricing data
- CSS custom properties for theming (dark/light)

## Known limitations

- Supports Binance's standard CSV export format only; other exchanges are not currently supported.
- Realized P/L uses FIFO and matches buys/sells within the same second; very unusual multi-leg same-second trades may be approximated.
- Persistence uses localStorage plus IndexedDB; if the browser blocks storage (e.g. private mode) or runs in a non-secure context, data simply won't be restored.
- CoinGecko's free tier is rate-limited; refreshing prices too frequently may temporarily fail (the app falls back to the last known price).
- Upload caps: 50 MB per file, 200 MB per batch, 100 files per batch, and 250,000 merged rows; larger histories must be split into multiple files.
- Coin symbols are normalized to trimmed uppercase (`btc`, `BTC`, and padded ` ETH ` collapse into one holding) before aggregation.
- Tokens with no CoinGecko listing remain marked as N/A and are valued at $0 until a price is entered or cached.
- Transaction types not tied to a recognizable coin trade (e.g. prediction market orders) are counted toward holdings but excluded from cost basis pairing.
- Historical prices from CoinGecko may differ slightly from your actual executed price on Binance.
