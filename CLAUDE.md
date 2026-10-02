# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案簡介

單檔 Node.js（ES Module）工具：透過 LeetCode GraphQL API 抓取使用者已通過（AC）的題目與程式碼，並產生 `result/` 目錄（含 `ReadMe.md` 與各題解答檔），供使用者推送到自己的 GitHub 儲存庫。

## 常用指令

```shell
npm install                       # 目前沒有任何依賴（使用 Node 原生 fetch，需 Node >= 18）
cp config_default.json config.json  # 然後填入 username、csrftoken、LEETCODE_SESSION
npm start                         # 等同 node index.js
```

- 沒有測試、lint 或 build 設定（`npm test` 只是佔位指令）。
- 必須在專案根目錄執行，因為 `config.json`、`query/`、`template/` 都以相對路徑（`./`）讀取。
- `config.json` 與 `result/` 已被 `.gitignore` 排除（`config.json` 含登入 cookie，勿提交）。
- 除錯時可啟用 `index.js` 迴圈尾端被註解的 `//break; //for test`，只處理第一題。

## 架構

所有邏輯都在 [index.js](index.js) 的 `main()`，流程如下：

1. 讀取 `config.json`，以及 `query/*.graphql` 四個查詢檔（user、problem、submission、submissionDetail）。
2. `fetch_leetcode(query, variables)` 為唯一的 API 封裝，以 `csrftoken` 與 `LEETCODE_SESSION` cookie 向 `https://leetcode.com/graphql` 發送 POST。
3. `user.graphql` 取得各難度的「已解／總題數」，寫入 `config.cur_*` / `config.all_*`（陣列順序依賴 `configVars = solved, easy, medium, hard`），用來填 header 模板，同時 `config.cur_solved` 也作為 problem 查詢的 `limit`。
4. `problem.graphql` 以 `filters: { status: "AC" }` 取得所有已解題目；對每題再用 `submission.graphql` 取最近 20 筆提交並篩出 `Accepted`，每種語言取第一筆，再以 `submissionDetail.graphql` 取得程式碼（回傳 `null` 時會無限重試迴圈，直到成功）。
5. 程式碼寫入 `result/ProblemSet/<4位補零題號>.<titleSlug>/<titleSlug>.<副檔名>`，並在表格列中加入對應連結。
6. 最後把 header + 所有題目列組合寫入 `result/ReadMe.md`。

### 模板機制

`template/header.md`、`template/body.md` 使用 `{{ var }}` 佔位符，以字串 `replace`／`replaceAll` 取代（非模板引擎）。新增佔位符時，必須同步更新 `index.js` 頂部對應的變數清單（`headerVars` 或 `bodyVars`），否則不會被取代。`{{ date }}` 在最後單獨處理。`template/footer.md` 目前為空且未被使用。

### 語言對照表

`languages` 物件決定支援哪些語言及副檔名。注意：部分語言（swift、golang、scala、rust、racket、erlang、elixir）目前僅為字串而非 `{ name, extension }` 物件，因此取 `.extension` 會得到 `undefined`；要支援它們需先改成物件格式。

### 已棄用程式碼

`fetch_leetcode_submission`（`/submissions/latest/` REST 端點）已被註解，改由 `submissionDetail` GraphQL 查詢取代。
