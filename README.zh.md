# Crypto Portfolio Analyzer（加密貨幣持倉分析器）

<div align="center">

<img src="./docs/logo.svg" alt="Crypto Portfolio Analyzer logo" height="72" />

**Binance CSV + 鏈上錢包，私密優先的持倉追蹤工具**

[概述](#概述) • [功能](#功能) • [快速開始](#快速開始) • [計算方法](#計算方法) • [自行部署](#自行部署) • [已知限制](#已知限制)

</div>

一個單頁網頁應用程式，解析你的幣安交易歷史 CSV，並匯入公開鏈上錢包活動，以重建結合持倉、成本基礎、市值，以及已實現／未實現盈虧——全部在你的瀏覽器內完成。

> [!NOTE]
> 無後端、無帳戶。你的 CSV 100% 在客戶端解析處理。公開區塊鏈瀏覽器 / RPC 請求僅傳送你選擇追蹤的地址；價格查詢使用 [CoinGecko](https://www.coingecko.com/en/api)。金額與帳戶憑證絕不會傳送到任何地方，因為根本沒有應用伺服器。

## 概述

交易所原生持倉視圖和第三方稅務工具（如 CoinLedger、Koinly）經常錯誤分類幣安特有的交易類型——Launchpool 認購、小額資產兌換、策略交易回贈、內部轉帳——導致持倉和成本基礎數字與你的實際錢包餘額不符。此工具使用透明、可審核的方法從原始交易帳本重新計算兩者，讓你可以驗證（或糾正）其他工具報告的數字。

一切在本地運行：

- 合併分析結果以 Web Crypto（AES-GCM，金鑰儲存於 IndexedDB）加密，下次訪問時自動還原。
- 唯一的網絡請求是向 CoinGecko 查詢價格，以及向公開區塊鏈瀏覽器 / RPC 查詢鏈上活動。僅傳送幣種代號（以及你追蹤的地址）。

## 新版本變更（相對於上一個部署版本）

| 功能 | 舊版本 | 新版本 |
|------|--------|--------|
| **成本基礎計法** | 僅 FIFO | **5 種**：ACB（預設）、FIFO、LIFO、HIFO、UK Section 104 共享資金池 |
| **鏈上錢包** | 不支援 | **完整支援**：Bitcoin、EVM（7 條鏈）、Solana、Cardano、XRP Ledger——自動連結提幣與鏈上入帳並承接成本 |
| **Cloudflare Worker 代理** | 不存在 | **選用代理**（`workers.js` + `wrangler.toml`），提供免 API Key 的 EVM/Cardano 數據；自行部署者可用自己的 Worker |
| **登陸頁** | 基本 | **雙語**（繁中/英文）Hero、特性網格、三步驟指南、隱私說明、首頁按鈕 |
| **持久化儲存** | 僅 localStorage | **AES-GCM 加密**（Web Crypto + IndexedDB）+ localStorage |
| **匯出功能** | 僅 CSV | **CSV + PNG**（完整報告圖片，含圖表、表格、免責聲明） |
| **手續費追蹤** | 基本總和 | **總手續費（USD 估算）+ 零成本資產清單**（空投 / Launchpool 獎勵） |
| **成長圖表** | 成本與價值線 | **買/賣標記**、單幣成本基礎線、縮放/平移、時間範圍標籤 |
| **持倉分佈圖** | 不存在 | **圓餅圖**，按幣種或類別（穩定幣 / 主流幣 / 小幣） |
| **已實現盈虧** | 僅 FIFO、按年 | **全部 5 種計法**，按賣出年份分組，含小計與累計總額 |
| **除錯 / 審核** | 無 | **操作類型統計表格** |

## 功能

- **雙語登陸頁**——繁中/英文 Hero、特性網格、三步驟快速開始、隱私說明。首次訪問者點擊 **開始分析**；有儲存數據的回訪者直接進入分析器；**首頁**按鈕可返回登陸頁。
- **拖放 CSV 匯入（多檔案）**——接受幣安標準匯出格式（`User ID, Time, Account, Operation, Coin, Change, Remark`）。多個檔案自動合併，整份檔案內容哈希去重複上傳，按時間排序。
- **鏈上錢包追蹤**——加入公開 Bitcoin、EVM、Solana、Cardano、XRP Ledger 地址。支援的 EVM 網絡包括 Ethereum、BNB Chain、Polygon、Arbitrum One、OP Mainnet、Base、Avalanche C-Chain。原生轉帳、代幣轉帳、兌換、Gas / 網絡費用轉換為與交易所交易相同的 FIFO 帳本。大部分 EVM 數據來自免鑰匙的 Blockscout，BNB Chain 經 MegaNode BSCTrace，Cardano 經 Koios——全部通過選用的 Cloudflare Worker 代理。
- **準確持倉計算**——將每幣種所有紀錄變動加總（買入、賣出、手續費、空投、獎勵），與交易所真實餘額對齊。
- **成本基礎帳本（5 種計法）**——使用你選擇的方法重建成本：平均成本法（ACB，預設）、先進先出（FIFO）、後進先出（LIFO）、最高成本優先（HIFO），或英國 HMRC Section 104 共享資金池（同日 + 30 天配對）。同一秒內的 `Transaction Buy` 自動與穩定幣支出配對，穩定幣手續費計入取得成本，賣出或提幣時剩餘成本減少。
- **已實現盈虧與年度總結**——使用所選成本計法計算每次賣出的已實現盈虧，按幣種顯示並按賣出年份分組，含年度小計與累計總額，方便報稅參考。
- **手續費與零成本追蹤**——總交易手續費支出（以現價估算 USD）及專屬零成本資產清單（空投 / Launchpool 獎勵）。
- **實時價格**——透過 CoinGecko 取得當前市價，自動解析幣安不常見幣種代號（含本地快取查找），大型持倉批量查詢，每幣種可手動覆寫價格進行情境分析。無價格數據的幣種標記為 N/A 並以 $0 計價。
- **成長圖表**——累計成本基礎 vs. 市值隨時間變化，可選時間範圍（1日 / 1週 / 1月 / 1年 / 全部），買/賣事件標記（懸停顯示交易詳情），單幣成本基礎線，滾輪縮放/觸控縮放、拖曳平移及重設。
- **持倉分佈圖**——按市值的圓餅圖，支援按類別分組模式（穩定幣 / 主流幣 / 其他小幣）。
- **匯出功能**——下載計算後的持倉明細為 CSV（含年度已實現盈虧明細），或匯出整個概覽為 PNG 報告圖片（摘要指標、兩張圖表、持倉表、年度盈虧、免責聲明）。
- **本地持久化**——合併分析結果以 AES-GCM 加密儲存，下次訪問自動還原，附帶儲存數據橫幅與清除確認對話框。
- **深色 / 淺色主題**與**繁中 / 英文**語言切換，均透過 `localStorage` 持久化。

> [!TIP]
> 大型交易歷史（數萬行、多種幣種）計算成長圖表可能需要數秒，因為需按幣種按選定範圍獲取歷史價格。

## 快速開始

無需建構步驟，無需安裝依賴——這是單一靜態 HTML 檔案。

1. 下載此倉庫的 `index.html`，或開啟已部署的網站。
2. 在任何現代瀏覽器中直接開啟。登陸頁介紹工具；點擊 **開始分析** 進入分析器。
3. 從幣安匯出交易歷史：**訂單 → 資產記錄 → 交易記錄 → 匯出交易紀錄 → 生成所有報表 → CSV**。
4. 將一個或多個 CSV 拖放到上傳區，或點擊瀏覽。
5. 可選：在 **鏈上錢包** 加入自託管地址，讓轉出交易所的資產繼續被追蹤。需部署選用的 Cloudflare Worker 代理（參見[自行部署](#自行部署)）。（Cardano 必須透過代理，因為 Koios 阻擋瀏覽器 CORS）。

本地測試運行：

```bash
python -m http.server 8000
# 然後開啟 http://localhost:8000
```

## 計算方法

| 指標 | 方法 |
|---|---|
| **持倉（數量）** | 所有交易所交易紀錄與轉換後鏈上事件，按幣種變動量加總 |
| **錢包轉帳** | 幣安提幣/充值與鏈上入帳/出帳，當鏈上部分在 24 小時內到達且數量差異在 0.2% 以內時自動連結（全自動、一對一、取最小時間差）。兩邊保留，並將離開時的單位成本（使用所選計法）帶入到達批次，因此後續鏈上賣出可保留原始成本基礎計算已實現盈虧。已連結錢包（★）優先同步；未連結的外部入帳成本基礎為 0 |
| **成本基礎** | 所選計法（年度盈虧表上方的卡片；預設 ACB）。FIFO/LIFO/HIFO 從前/後/最高成本開始消耗批次；ACB 每幣種維持一個平均資金池。UK Section 104 每幣種維持共享資金池：處置先配對同日（UTC）取得，再配對賣出後 30 天內回購（FIFO），剩餘才使用資金池平均。穩定幣流入為面值現金本金。穩定幣 `Transaction Spend`（含穩定幣手續費）按比例分配至同一秒買入；以取得幣種支付的手續費將該批次數量減至保留數量；第三方資產手續費則將該手續費資產的成本（使用相同計法）轉入取得批次。賣出、提幣、幣幣兌換消耗批次/資金池並減少剩餘成本 |
| **市值** | 持倉 × 現價（或成長圖表使用的歷史價格），來自 CoinGecko |
| **未實現盈虧** | 市值 − 成本基礎 |
| **已實現盈虧** | 淨穩定幣收入減去使用所選計法消耗的成本。以賣出幣種支付的手續費加入處置數量，降低單位收入；第三方資產手續費按該手續費資產在所選計法下的成本估值，從已實現盈虧扣除。結果按賣出年份分組，供報稅參考 |
| **總手續費** | 所有 `Transaction Fee` 紀錄加總，以現價換算 USD（非穩定幣手續費為近似值） |

> [!IMPORTANT]
> 穩定幣充值視為面值現金本金，成本基礎等於 USD 金額，因此閒置現金不會產生虛假未實現盈虧。非穩定幣充值、空投、Launchpool 獎勵在 CSV 中無購入價格，成本基礎記為 `0`。

### 成本基礎計法比較（快速指南）

| 計法 | 何時使用 | 稅務機關認可 |
|------|----------|--------------|
| **ACB**（平均成本法） | 預設；簡單，隨時間平滑成本。加拿大（CRA）強制。 | 加拿大（CRA）等 |
| **FIFO**（先進先出） | 保守；先賣最舊批次。美國預設。 | 美國（IRS 預設）、廣泛接受 |
| **LIFO**（後進先出） | 上升市場中遞延收益；帳上保留最舊低成本批次。 | 不廣泛接受；請查詢當地法規 |
| **HIFO**（最高成本優先） | 最小化已實現收益（稅務優化）。 | 英國 HMRC 等部分機關不承認 |
| **Section 104**（英國共享資金池） | 英國個人強制；同日 + 30 天配對 + 資金池平均。 | 英國（HMRC） |

## 技術棧

- Vanilla JavaScript（無框架、無打包工具）
- [Chart.js](https://www.chartjs.org/) 成長圖表與持倉分佈圖
- [Hammer.js](https://hammerjs.github.io/) 與 [chartjs-plugin-zoom](https://github.com/chartjs/chartjs-plugin-zoom) 觸控縮放/平移
- 鏈上數據：[Blockchain.info](https://www.blockchain.com/explorer)、[Blockstream](https://blockstream.info/)（Bitcoin 備援）、[Blockscout](https://www.blockscout.com/)（免鑰匙 EVM）、[MegaNode BSCTrace](https://docs.nodereal.io/)（BNB Chain）、[Koios](https://www.koios.rest/)（Cardano 代理）、[Etherscan V2](https://docs.etherscan.io/)（本地 EVM 備援）、Solana RPC、[Jupiter 代幣元數據](https://lite-api.jup.ag/)
- [CoinGecko API](https://www.coingecko.com/en/api) 價格數據
- CSS 自定義屬性主題（深色 / 淺色）
- Web Crypto API（AES-GCM）+ IndexedDB 加密持久化

## 自行部署

此應用為靜態檔案，單獨即可進行幣安 CSV 分析。選用的 Cloudflare Worker（`workers.js`）僅代理鏈上數據，讓終端使用者無需貼上 API Key，瀏覽器也不會遇到 CORS 問題。三個檔案有不同目的地：

- **`index.html`** → 推送到 GitHub Pages（或任何靜態托管——在 `main` branch、根資料夾啟用 Pages）。GitHub Pages 提供 UI。
- **`workers.js` + `wrangler.toml`** → 透過 Wrangler 部署到 **Cloudflare Workers**。它們**不**由 GitHub Pages 提供；`wrangler deploy` 單獨上傳 Worker。請確認 `wrangler.toml` 的 `main` 欄位指向 `workers.js`，此倉庫預設已如此設定。

部署 Worker 一次：

1. 安裝 wrangler：`npm install -g wrangler`
2. 登入：`wrangler login`
3. 部署：`wrangler deploy`

### 部署 Worker 後，推送你的分支前**必須**修改兩個值

自行部署者若複製/下載此倉庫必須修改這兩處，否則應用將持續呼叫維護者的代理並被來源鎖定阻擋：

1. **`index.html` → `PROXY_BASE`（約第 842 行）**——將 UI 指向**你的** Worker：

   ```js
   // 改為你自己的 Cloudflare Workers 域名：
   const PROXY_BASE = 'https://crypto-portfolio-proxy.<your-subdomain>.workers.dev/api';
   ```

   > [!WARNING]
   > 保留預設 `timophychanhy.workers.dev` URL 代表應用會呼叫維護者的代理。為了隱私並避免上游速率限制/來源鎖定，請在部署你的分支前替換為你自己的 Worker URL。

2. **`workers.js` → `ALLOWED_ORIGIN`**——限制代理僅限**你的**網站使用：

   ```js
   // workers.js — 將代理限制為你的部署來源（GitHub Pages 或自定域名）
   const ALLOWED_ORIGIN = 'https://your-github-username.github.io/your-repo/';
   ```

   非此來源的任何請求將收到 `403 Forbidden`，因此公開 Worker URL 無法被第三方濫用。

### 可選：透過代理啟用 BNB Chain 和 Cardano

- **BNB Chain（chain id 56）**無免鑰匙瀏覽器。Worker 使用 [MegaNode BSCTrace](https://docs.nodereal.io/)（免費版）透過 `nr_getAssetTransfers`。在 https://dashboard.nodereal.io/ 建立免費金鑰並設定：

  ```bash
  wrangler secret put MEGANODE_KEY
  ```

  未設定時，其他所有 EVM 鏈（Ethereum、Polygon、Arbitrum、Optimism、Base、Avalanche）仍透過 Blockscout 免鑰匙運作，BNB Chain 僅返回 `500 missing MEGANODE_KEY`。

- **Cardano** 透過 Worker 代理使用 [Koios](https://www.koios.rest/)（免費，無需金鑰）。無需額外 secret。

> [!NOTE]
> Worker 僅回應 `/api/*`，從不提供 `index.html`。靜態網站可托管於 GitHub Pages、Cloudflare Pages、Netlify 或任何靜態托管，並將 `workers.js` 保持為獨立 Worker。`index.html` 的 `connect-src` CSP 已允許 `https://*.workers.dev` 及所需瀏覽器/RPC 主機；Worker 本身是列入白名單、有速率限制的代理（非開放代理）。

## 已知限制

- 交易所 CSV 匯入目前僅支援幣安標準匯出格式；其他交易所暫不支援。
- 錢包歷史深度取決於提供商：Bitcoin 使用 Blockchain.info 分頁並有 Blockstream 備援，EVM 使用最多 50,000 筆普通/內部交易加 50,000 筆代幣轉帳（BNB 透過 MegaNode 以 `pageKey` 分頁），Solana 使用 RPC 最新 500 筆簽名，Cardano 使用最多 300 筆 Koios 交易（每頁 100 × 3 頁），XRPL 使用最多 25 頁 `account_tx`。非常大或已歸檔的歷史可能需要重複同步或未來提供商支援。
- Cardano 透過 Cloudflare Worker 代理使用 Koios。因 Koios 阻擋瀏覽器 CORS，必須使用 Worker。
- 無對應交易所轉帳、無穩定幣/加密貨幣支付方的非穩定幣鏈上入帳，成本基礎視為 0，因為單獨地址無法揭示其原始購入價格。
- 使用 Cloudflare Worker 代理時，大部分 EVM 網絡使用免鑰匙 Blockscout 無需 API Key（BNB 透過 Worker secret 使用 MegaNode，Cardano 透過 Worker 使用 Koios）；無代理時，EVM 退回使用者提供的免費 Etherscan V2 Key（Cardano 無本地備援——必須使用代理）。公開 Bitcoin / Solana 端點可能無預警地限速或阻擋瀏覽器流量。
- 已實現盈虧遵循年度盈虧表上方所選的成本計法，並配對同一秒內的買/賣；非常特殊的多腿同一秒交易可能會被近似處理。
- HIFO 最小化收益，但並非所有稅務機關均認可（例如英國 HMRC 強制使用 Section 104）；申報前請確認你所在司法管轄區的規定。
- Section 104 同日/30天配對使用 UTC 日曆日。已連結內部轉帳（24小時 / 0.2% 自動連結）帶入資金池平均成本且永不進入配對；幣幣兌換將資金池平均成本滾入取得資產並遞延收益，穩定幣部分保持面值。
- 第三方資產交易手續費（例如 BNB）按所選計法下該手續費資產的成本估值。買入手續費增加取得資產成本；賣出手續費減少已實現盈虧。它們仍保留在單獨的手續費摘要中。
- 幣幣兌換將處置批次的成本滾入取得資產，但其已實現市值收益遞延至該資產兌換為穩定幣時。
- 持久化使用 localStorage 加 IndexedDB；若瀏覽器阻擋儲存（例如無痕模式）或在非安全環境中運行，數據將無法還原。
- CoinGecko 免費版有速率限制；過於頻繁刷新價格可能暫時失敗（應用會退回使用最後已知價格）。
- 上傳上限：每檔案 50 MB、每批次 200 MB、每批次 100 個檔案、合併後最多 250,000 行；更大的歷史必須拆分成多個檔案。
- 幣種代號標準化為去除空白的大寫（`btc`、`BTC`、` ETH ` 合併為同一持倉）後才聚合。
- 無 CoinGecko 上架的代幣保持標記為 N/A 並以 $0 計價，直到輸入或快取價格。
- 與可識別幣種交易無關的交易類型（例如預測市場訂單）計入持倉但不計入成本基礎配對。
- CoinGecko 歷史價格可能與你在幣安的實際成交價略有差異。