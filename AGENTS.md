# Invest Ledger 專案開發規則

## 快速探索與指令效率（Windows 環境）
- 列檔一律使用 `git ls-files`，搜尋一律使用 `git grep -n`。**禁止**對專案根目錄執行 `Get-ChildItem -Exclude node_modules`（PowerShell 仍會遞迴掃描 `node_modules` 導致逾時）。
- 合併同階段唯讀指令為單次呼叫（例如 `git status -sb; git log -n 5 --oneline`），避免多次啟動 shell 的冷啟動延遲。
- 讀檔前先用 `git grep -n` 定位行號，優先使用 `StartLine`/`EndLine` 局部讀取，避免整檔讀取無關大型檔案。

## 分級驗證策略
- **開發修改階段**：僅執行 `pnpm run typecheck` 與受影響的單一測試檔（`pnpm exec vitest run <test-file>`），不要在尚未準備交付時重複執行完整 `vite build`。
- **交付與部署階段**：執行一次完整 `pnpm test` 與 `pnpm run build`；若僅更新版本號字串且先前測試已過，不重複跑全量單元測試。

## 專案速查
- 架構：React 19 + Vite + Dexie IndexedDB（`src/`）+ Cloudflare Worker（`worker/`，`/api/quotes` 具 60 秒 Edge Cache）。
- 更版固定同步：`package.json`（`version`）與 `public/sw.js`（`CACHE_NAME`）。
- Cloudflare Workers 目標名稱：`tw-invest-ledger`（設定於 `wrangler.jsonc`）。
