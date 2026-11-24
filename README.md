# 台股收益帳本｜TW Invest Ledger

100% **Local-First（純本地儲存）** 的台股與台灣 ETF 個人投資收益帳本，專注解決台灣股市實務帳務——包含**一般買賣移動平均成本**、**同日先賣後買（現股當沖沖銷 / 賣舊買新）**、**部分沖銷拆單**、**配息含息均價**與 **XIRR 年化報酬率**。網站部署於 **Cloudflare Workers Free**，個人帳務完全不上傳雲端。

- 線上版：https://tw-invest-ledger.brianty0901.workers.dev

---

## 核心特色

### 1. 100% Local-First 隱私架構
- **資料全留本機**：所有交易流水、配息、持倉成本與券商折數均存於瀏覽器 **IndexedDB（Dexie.js）**，無須登入、無雲端資料庫。
- **無狀態公開報價代理**：Cloudflare Worker 端點 `GET /api/quotes` 僅接收公開台股代號（如 `2330:TWSE,0050:TWSE`），完全不傳送也不儲存任何持股數量、成本或個人紀錄。
  - 主來源：Yahoo Finance（`.TW` / `.TWO`）
  - 備援來源：TWSE MIS（`tse` / `otc`）
  - 回應附帶 60 秒瀏覽器快取（`Cache-Control: public, max-age=60`），開啟應用自動同步報價並於頂部顯示上次更新時間

### 2. 台股帳務重播引擎（`Decimal.js` 精算）
採 **Event Replay（交易時間序重播）** 設計，支援歷史補單、改單、刪單並即時重算全帳本均價與損益：

- **當日先賣後買雙路徑**
  - **現股當沖沖銷（單筆預設關閉、成對快速單預設開啟）**：有庫存下同日先賣後買，優先配對沖銷當沖，**不修改原庫存移動均價**，普通股適用 **0.15%** 證交稅減半。
  - **賣舊買新（關閉當沖或盤中零股）**：先沖減既有庫存均價認列波段損益（普通股稅 **0.3%**），再以新買價重建庫存成本。
  - **部分沖銷自動拆單**：例如持有 5 張，當日先賣 3 張買回 2 張 → 自動拆為 2 張當沖（稅 0.15%）＋ 1 張波段減倉（稅 0.3%），手續費依股數精準分攤並處理尾差。
  - **盤中先賣待回補追蹤**：標記待回補後暫不沖減庫存，顯示回補損平價與即時現價預估回補損益，支援「一鍵回補買進」或「轉為一般賣出」。
- **台股稅費與 Tick 檔位**
  - **證交稅**：普通股 `0.3%`（當沖 `0.15%`）、股票型 ETF `0.1%`、債券型 ETF `0%`（支援手動覆寫）。
  - **手續費**：支援多券商折數、可指定預設券商帳戶、整股／零股最低手續費分開設定、日退／月退折讓模式，並提供獨立的手續費與證交稅覆寫欄位。
  - **回補損平價試算器**：依台股普通股六區間與 ETF 升降單位（Tick Size）計算最高不虧損回補價、首個獲利檔位與上下檔位損益模擬表。

### 3. 視覺化分析、配息與 XIRR
- **投資收益總覽**：庫存成本與市值、未實現與今日估算損益（Day P&L）、含息已實現總收益（拆波段 / 當沖 / 配息）、月度收益堆疊圖、持倉資產配置甜甜圈圖。
- **當沖分析專區**：勝率、獲利因子（Profit Factor）、平均盈虧、單筆期望值、累計損益面積曲線與標的當沖戰績排行。
- **配息現金流與含息成本**：紀錄除息日、入帳日、跨行匯費、二代健保（含 2.11% 試算按鈕），自動調降持倉「含息均價」與計算個人成本殖利率（Yield on Cost）。
- **投資組合 XIRR**：整合所有買賣交割金流、實領配息與目前持倉估值計算資金時間加權年化報酬率。

### 4. 本地防遺失保護與離線 PWA
- **JSON 全量備份／還原**：匯出含券商、標的、交易與配息的備份檔（`schemaVersion: 2`，向下相容 v1）。
- **本機硬碟自動同步**：Chrome / Edge 桌面版透過 `File System Access API` 綁定本機 `.json` 檔案，異動後自動回寫硬碟。
- **Excel 相容 CSV 匯入／匯出**：UTF-8 BOM 格式匯出交易與配息明細，並提供標準範本與逐列檢核匯入。
- **離線可用（PWA）**：支援安裝至桌面或手機主畫面離線記帳（Service Worker 嚴格略過 `/api/*`）。

### 5. 高效記帳與老花友善閱讀模式
- **同一標的連續輸入**：單筆買賣與先賣後買成對單皆支援「儲存並繼續」，自動保留帳戶、標的、日期、買賣方向、整零股與數量，清空單價與備註並自動聚焦至價格欄位，加速同檔多筆補單。
- **老花／長輩友善顯示模式**：支援標準／放大／特大三段字級、深色／淺色主題與高對比配色，頂部提供一鍵快速切換，顯示偏好儲存在本機 `localStorage`。

---

## 技術棧

- **前端**：React 19, TypeScript, Vite 6, Tailwind CSS v4, Recharts, `@phosphor-icons/react`
- **本地資料庫與精度**：Dexie.js (IndexedDB), Decimal.js
- **邊緣運行與靜態託管**：Cloudflare Workers + Workers Static Assets (`@cloudflare/vite-plugin`, Wrangler)
- **測試**：Vitest

---

## 本機開發與部署

```bash
# 安裝依賴
pnpm install

# 啟動本機開發伺服器 (含 Worker runtime)
pnpm dev

# 執行 TypeScript 型別檢查與單元測試
pnpm typecheck
pnpm test

# 建置正式版產物
pnpm build

# 部署至 Cloudflare Workers Free
pnpm exec wrangler deploy
```

---

## 專案結構

```text
.
├── public/                 # PWA manifest、Service Worker 與圖示
├── worker/
│   ├── index.ts            # Worker 入口 (/api/health, /api/quotes, Static Assets fallback)
│   └── quotes.ts           # 無狀態台股公開報價代理（60s 瀏覽器快取）+ Vitest 測試
├── src/
│   ├── engine/             # 純 TypeScript 台股帳務、分析與 XIRR 引擎 + Vitest 測試
│   ├── db/                 # Dexie IndexedDB schema、JSON 備份、本機檔案同步、CSV 解析匯出 + Vitest 測試
│   ├── data/               # 內建台股與 ETF 字典 (tw-securities.json)
│   ├── components/         # 記帳視窗、損平試算器、Recharts 圖表、持倉詳情抽屜
│   ├── pages/              # 總覽、庫存持倉、交易/當沖、配息現金流、回補損平試算、設定與備份
│   └── lib/                # 台股金額/紅漲綠跌格式化、報價同步 client、閱讀顯示偏好 + Vitest 測試
└── wrangler.jsonc          # Cloudflare Workers 設定
```
