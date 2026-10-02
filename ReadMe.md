# LeetCode ReadMe Generator

<p>
	<img src="https://badgen.net/badge/Coder/m21248074/red?icon=github" />
	<img src="https://badgen.net/badge/Node.js/24.18.0/green?" />
</p>

Which Programmer😁 doesn't want to download the code written in LeetCode with one click, and also generate a beautiful ReadMe file?

Give me a ⭐ if it is useful, thank you!

## Overview
A tool for crawling the description and accepted submitted code of problems on the [LeetCode](https://leetcode.com/) website. The tool supports to generate ReadMe.md files to beautify your ReadMe of LeetCode repository.

- Downloads the **latest accepted submission of every language** you used for each problem (languages that are not in the built-in table are saved as `<lang>.txt`).
- **Incremental**: problems that already have solutions in the output folder are skipped, so later runs only crawl new problems.
- **Paged ReadMe**: the problem table is split into pages of 500 problem ids with a pager at the bottom, because GitHub truncates a ReadMe larger than about 500 KiB.
- Requests are throttled, since LeetCode starts returning empty results when they come too fast.

This project is inspired by:

- [ZhaoxiZhang / LeetCodeCrawler](https://github.com/ZhaoxiZhang/LeetCodeCrawler)
- [zhantong / leetcode-spider](https://github.com/zhantong/leetcode-spider)
- [Liuyang0001 / Leetcode-Helper](https://github.com/Liuyang0001/Leetcode-Helper)
- [Liuyang0001 / Leetcode-Helper](https://github.com/KivenCkl/LeetCode_Helper)
- [Ma63d / leetcode-spider](https://github.com/Ma63d/leetcode-spider)

## Quick Start

### Step 1. Clone the repository

Node.js 18 or newer is required (it uses the built-in `fetch`). There are no dependencies, so `npm install` is not needed.

```shell
git clone https://github.com/m21248074/LeetCode_ReadMe_Generator.git
cd ./LeetCode_ReadMe_Generator
```

### Step 2. Edit the config file

Create the `config.json` file as shown below ( you can modify the `config_default.json` in the repo directly and then rename it to `config.json`):

```shell
cp config_default.json config.json
vim config.json
```

```json
{
	"username": "<Your LeetCode Username>",
	"csrftoken": "<Your LeetCode CSRF Token>",
	"LEETCODE_SESSION": "<Your LeetCode Session Code>",
	"outputDir": "./result"
}
```
- `username` correspond to the account on the LeetCode website.
- `csrftoken` and `LEETCODE_SESSION` are the cookies of your logged-in leetcode.com session. Copy them from the browser (DevTools → Application/Storage → Cookies → `https://leetcode.com`). They expire after a while; when the script stops with "Could not list your solved problems", copy fresh values. Never commit `config.json` (it is in `.gitignore`).
- `outputDir` (optional, default `./result`) is where `ReadMe.md`, `ProblemList/` and `ProblemSet/` are written. Point it at a local clone of your solution repository (e.g. `../LeetCode_Solution`) to update that repository in place: problems that already have solutions there are skipped, so only new ones are crawled.

### Step 3. Run the script

```shell
npm start
```

- The first run crawls everything and can take a long time (requests are throttled to avoid being rate limited).
- Later runs are incremental: problems whose folder already has solutions are skipped. A new submission or a new language of a problem that was already crawled is **not** picked up this way; run `npm start -- --full` to crawl every problem again (or delete that problem's folder).
- If some problems fail, they are listed at the end and are retried by the next run.

### Step 4. Push the result to Your Repo

First, create a new Repository on Github.

```shell
cd ./result
git init
git add .
git commit -m <message>
git remote add origin <Your Github Repo's URL>
git branch -M main
git push -u origin main
```

The above commands are only needed at the first time, next time you can directly use `git push -f`.

If `outputDir` points at your solution repository, skip this step and just commit and push from that repository.

## Result

```
ReadMe.md                  badges, statistics and the first page of the problem table
ProblemList/0501-1000.md   the other pages of the problem table (500 problem ids each)
ProblemSet/0001.two-sum/   the solutions of one problem, one file per language
```

`ProblemList/` is rebuilt and `ReadMe.md` is overwritten on every run, so do not put hand written content there. The page size is `PAGE_SIZE` in `index.js`.

You can see the result for crawling in my repository：[LeetCode Solution](https://github.com/m21248074/LeetCode_Solution).