# Crypto Portfolio Analyzer

A privacy-first, single-page web app that analyzes your Binance transaction history CSV and reconstructs your portfolio holdings, cost basis, and market value — entirely in your browser.

> [!NOTE]
> No backend, no accounts, no data upload. Your CSV file is parsed and processed 100% client-side. The only network calls made are to the public [CoinGecko](https://www.coingecko.com/en/api) API to fetch live and historical coin prices.

## Why this exists

Exchange-native portfolio views and third-party tax tools (e.g. CoinLedger, Koinly) often misclassify Binance-specific transaction types — Launchpool subscriptions, Small Assets Exchange, Strategy trading rebates, internal transfers — leading to holdings and cost basis figures that don't match your actual wallet balance. This tool recomputes both from the raw transaction ledger using a transparent, auditable method, so you can verify (or correct) what other tools report.

## Features

- **Drag-and-drop CSV import** — accepts the standard Binance transaction history export (`User ID, Time, Account, Operation, Coin, Change, Remark`).
- **Accurate holdings calculation** — sums every recorded change per coin (buys, sells, fees, airdrops, rewards), matching your real exchange balance.
- **Cost basis pairing engine** — matches `Transaction Buy` events to their corresponding `Transaction Spend` events (in USDT/USDC/BUSD/FDUSD) within the same second, and allocates spend proportionally across simultaneous buys.
- **Live pricing** — fetches current market prices via CoinGecko, with manual price override per coin for what-if analysis.
- **Growth chart** — visualizes cumulative cost basis vs. market value over time, with selectable ranges (1D / 1W / 1M / 1Y / ALL).
- **Allocation chart** — doughnut/pie breakdown of portfolio composition by market value.
- **Dark/light theme** and **zh-Hant/English** language toggle, both persisted via `localStorage`.

## Getting started

No build step, no dependencies to install. This is a static HTML file.

1. Download `index.html` from this repository or open the website.
2. Open it directly in any modern browser.
3. Export your transaction history from Binance: **Orders → Assets History → Transaction History → Export Transaction Records → Generate all statements → CSV**.
4. Drag the CSV onto the upload zone, or click to browse.

> [!TIP]
> Large histories (thousands of rows, many distinct coins) may take a few seconds to compute the growth chart, since historical prices are fetched per coin per selected range.

## How the calculations work

| Metric | Method |
|---|---|
| **Holdings (amount)** | Sum of the `Change` column for each coin, across all rows |
| **Cost basis** | For each timestamp group, `Transaction Spend` in stablecoins is allocated proportionally across simultaneous `Transaction Buy` rows |
| **Market value** | Holdings × live price (or historical price, for the growth chart) from CoinGecko |
| **Unrealized P/L** | Market value − cost basis |

> [!IMPORTANT]
> Transactions with no matching `Transaction Spend` in the same second — plain deposits, airdrops, Launchpool rewards — are recorded with a cost basis of `0`. This is expected behavior, not a bug: these coins had no direct purchase cost.

## Tech stack

- Vanilla JavaScript (no framework, no bundler)
- [Chart.js](https://www.chartjs.org/) for the growth and allocation charts
- [CoinGecko API](https://www.coingecko.com/en/api) (public, unauthenticated) for pricing data
- CSS custom properties for theming (dark/light)

## Known limitations

- Supports Binance's standard CSV export format only; other exchanges are not currently supported.
- CoinGecko's free tier is rate-limited; refreshing prices too frequently may temporarily fail (the app falls back to the last known price).
- Transaction types not tied to a recognizable coin trade (e.g. prediction market orders) are counted toward holdings but excluded from cost basis pairing.
- Historical prices from CoinGecko may differ slightly from your actual executed price on Binance.
