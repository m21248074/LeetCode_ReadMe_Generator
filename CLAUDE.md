# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案簡介

單檔 Node.js（ES Module）工具：透過 LeetCode GraphQL API 抓取使用者已通過（AC）的題目與程式碼，並產生 `result/` 目錄（含 `ReadMe.md` 與各題解答檔），供使用者推送到自己的 GitHub 儲存庫。

## 常用指令

```shell
cp config_default.json config.json  # 然後填入 username、csrftoken、LEETCODE_SESSION
npm start                           # 增量模式：已有解答檔的題目直接跳過
npm start -- --full                 # 完整重抓所有題目
```

- 零依賴（使用 Node 原生 `fetch`），需要 Node >= 18，不需要 `npm install`。
- 沒有測試、lint 或 build 設定（`npm test` 只是佔位指令）。
- 必須在專案根目錄執行，因為 `config.json`、`query/`、`template/` 都以相對路徑（`./`）讀取。
- `config.json` 與 `result/` 已被 `.gitignore` 排除（`config.json` 含登入 cookie，勿提交）。
- 要快速測試，可暫時複製一份 `index.js`，在 `problems` 後面加 `.filter(...)` 只處理少數題目；完整爬取上千題會很久。

## 架構

所有邏輯都在 [index.js](index.js)：`main()` 負責取得資料與組合 ReadMe，`process_problem()` 負責單一題目。

1. 讀取 `config.json`，以及 `query/*.graphql` 四個查詢檔（user、problem、submission、submissionDetail）。
2. `fetch_leetcode(query, variables)` 為唯一的 API 封裝，以 `csrftoken` 與 `LEETCODE_SESSION` cookie 向 `https://leetcode.com/graphql` 發送 POST；HTTP 非 2xx 時最多重試 `MAX_RETRIES` 次（線性退避）。每次呼叫前都會經過全域節流 `throttle()`，請求開始時間至少間隔 `REQUEST_INTERVAL_MS`。

   **限流的坑**：請求太密時 LeetCode 不會回 429，而是對 `submissionDetails` 回 HTTP 200 加 `{"data":{"submissionDetails":null}}`，看起來像「這筆提交取不到」，但稍後單獨請求就取得到。曾以 `REQUEST_INTERVAL_MS = 300`、`CONCURRENCY = 4` 跑，約每 100 題有 10 題以上失敗；目前的 `500`／`3` 完整跑 1474 題零失敗。若又出現大量 `failed to fetch the code of submission`，先調大間隔，不要當成提交本身壞掉。
3. `user.graphql` 取得各難度的「已解／總題數」，寫入 `config.cur_*` / `config.all_*`（陣列順序依賴 `configVars = solved, easy, medium, hard`），填入 header 模板。
4. `problem.graphql` 以 `filters: { status: "AC" }` 取得所有已解題目。伺服器單次最多回 100 筆，所以用 `skip` 分頁；**頁與頁之間會重疊**，因此依 `questionId` 去重，並以「空頁」而非筆數判斷結束。
5. 最多 `CONCURRENCY` 題同時由 `process_problem()` 處理（簡易 worker pool），每題回傳 `{ id, row }`，最後依題號每 `PAGE_SIZE`（500）題分頁：**第一頁直接是 `result/ReadMe.md`**（徽章 + 第一頁表格），其餘頁面寫入 `result/ProblemList/0501-1000.md` 等，每頁底部都有分頁器（range 連結 + Prev/Next）。分頁的原因是 GitHub 對過大的 README（約 500 KiB）會截斷，單一 ReadMe 在 1474 題時已達約 630 KiB。每次執行會先清空並重建 `ProblemList/`。
6. `process_problem()`：
   - **增量**：若 `result/ProblemSet/<4位補零題號>.<titleSlug>/` 已有解答檔就直接用檔案推回連結、不打 API（`--full` 則忽略）。副作用：已抓過的題目之後新增的語言或較新的提交不會被補上，需用 `--full`。
   - 否則用 `submission.graphql` 分頁（`hasNext`/`lastKey`）翻完所有提交，**每種語言只保留最新一筆 Accepted**（提交由新到舊排序，所以第一次看到就是最新）。再用 `submissionDetail.graphql` 取得程式碼（`fetch_code` 回傳 `null` 時重試，超過上限就丟錯）。
   - 任何錯誤會被捕捉、記入 `failed`，並刪除該題資料夾，使下一次增量執行會重抓。

### 模板機制

`template/header.md`（首頁徽章等，不含表格）、`template/page_header.md`（每頁的標題與表格欄位，含 `{{ range }}`；首頁與分頁共用）、`template/body.md`（每題一列）使用 `{{ var }}` 佔位符，以字串 `replace`／`replaceAll` 取代（非模板引擎）。新增佔位符時，必須同步更新 `index.js` 頂部對應的變數清單（`headerVars` 或 `bodyVars`；`{{ range }}` 則在寫分頁時單獨處理），否則不會被取代。`{{ date }}` 在最後單獨處理。解答連結在 `process_problem()` 先以 `ROOT` 標記佔位，寫檔時再換成空字串（首頁）或 `../`（`ProblemList/` 底下的分頁）。`template/footer.md` 目前為空且未被使用。

### 語言對照表

`languages` 物件（key 為 LeetCode 的 `lang` 值）決定顯示名稱、副檔名與連結順序。不在表內的語言仍會被抓，存為 `<lang>.txt`。SQL 方言的副檔名刻意用 `mysql.sql`、`mssql.sql` 等，避免同一題多種方言互相覆蓋。增量模式靠副檔名反查語言，所以**新增或修改副檔名會影響既有資料夾的辨識**。

### 已棄用程式碼

`fetch_leetcode_submission`（`/submissions/latest/` REST 端點）已被註解，改由 `submissionDetail` GraphQL 查詢取代。
