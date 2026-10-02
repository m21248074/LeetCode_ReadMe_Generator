# LeetCode ReadMe Generator

<p>
	<img src="https://badgen.net/badge/Coder/m21248074/red?icon=github" />
	<img src="https://badgen.net/badge/Node.js/24.18.0/green?" />
</p>

Which Programmer😁 doesn't want to download the code written in LeetCode with one click, and also generate a beautiful ReadMe file?

Give me a ⭐ if it is useful, thank you!

## Overview
A tool for crawling the description and accepted submitted code of problems on the [LeetCode](https://leetcode.com/) website. The tool supports to generate ReadMe.md files to beautify your ReadMe of LeetCode repository.

This project is inspired by:

- [ZhaoxiZhang / LeetCodeCrawler](https://github.com/ZhaoxiZhang/LeetCodeCrawler)
- [zhantong / leetcode-spider](https://github.com/zhantong/leetcode-spider)
- [Liuyang0001 / Leetcode-Helper](https://github.com/Liuyang0001/Leetcode-Helper)
- [Liuyang0001 / Leetcode-Helper](https://github.com/KivenCkl/LeetCode_Helper)
- [Ma63d / leetcode-spider](https://github.com/Ma63d/leetcode-spider)

## Quick Start

### Step 1. Clone the repository and Initialize Node.js

```shell
git clone https://github.com/m21248074/LeetCode_ReadMe_Generator.git
cd ./LeetCode_ReadMe_Generator
npm install
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
- `outputDir` (optional, default `./result`) is where `ReadMe.md`, `ProblemList/` and `ProblemSet/` are written. Point it at a local clone of your solution repository (e.g. `../LeetCode_Solution`) to update that repository in place: problems that already have solutions there are skipped, so only new ones are crawled.

### Step 3. Run the script

```shell
node index.js
```

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

You can see the result for crawling in my repository：[LeetCode Solution](https://github.com/m21248074/LeetCode_Solution).