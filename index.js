import * as fs from "node:fs/promises";
import * as path from "node:path";

const LEETCODE_API_ENDPOINT = "https://leetcode.com/graphql";
const PROBLEM_PAGE_SIZE = 100;
const SUBMISSION_PAGE_SIZE = 20;
const CONCURRENCY = 3;
// Problems are split into one page per PAGE_SIZE problem ids, because GitHub truncates a ReadMe over ~500 KiB.
const PAGE_SIZE = 500;
// Solution links are written relative to a marker, because the first page is the ReadMe at the root and the others are in ProblemList/.
const ROOT = "@@ROOT@@";
const MAX_RETRIES = 5;
// Bursts make LeetCode answer submissionDetails with null, so space out request starts globally.
const REQUEST_INTERVAL_MS = 500;
// By default problems whose output folder already has solutions are skipped; pass --full to re-crawl everything.
const FULL = process.argv.includes("--full");
// --recent also re-crawls the latest accepted submissions of the profile, which picks up new languages and newer solutions of problems that were already crawled.
const RECENT = process.argv.includes("--recent");
// LeetCode returns at most 20 recent accepted submissions, however large the limit is.
const RECENT_AC_LIMIT = 20;
const LEETCODE_API_SUBMISSION = "https://leetcode.com/submissions/latest/";

const configVars = [
  "solved", "easy", "medium", "hard"
]
const headerVars = [
  "username",
  "cur_solved", "all_solved",
  "cur_easy", "all_easy",
  "cur_medium", "all_medium",
  "cur_hard", "all_hard"
]
const bodyVars = [
  "id", "title", "url", "acRate", "difficulty", "tags", "answers"
]

const difficulty = {
  "Easy": "-Easy-00af9b",
  "Medium": "-Medium-ffb700",
  "Hard": "-Hard-ff2d55"
}

const languages = {
  "cpp": {
    "name": "C++",
    "extension": "cpp"
  },
  "java": {
    "name": "Java",
    "extension": "java"
  },
  "python": {
    "name": "Python",
    "extension": "py"
  },
  "python3": {
    "name": "Python3",
    "extension": "py3"
  },
  "c": {
    "name": "C",
    "extension": "c"
  },
  "csharp": {
    "name": "C#",
    "extension": "cs"
  },
  "javascript": {
    "name": "JavaScript",
    "extension": "js"
  },
  "ruby": {
    "name": "Ruby",
    "extension": "rb"
  },
  "swift": {
    "name": "Swift",
    "extension": "swift"
  },
  "golang": {
    "name": "Go",
    "extension": "go"
  },
  "scala": {
    "name": "Scala",
    "extension": "scala"
  },
  "kotlin": {
    "name": "Kotlin",
    "extension": "kt"
  },
  "rust": {
    "name": "Rust",
    "extension": "rs"
  },
  "php": {
    "name": "PHP",
    "extension": "php"
  },
  "typescript": {
    "name": "TypeScript",
    "extension": "ts"
  },
  "racket": {
    "name": "Racket",
    "extension": "rkt"
  },
  "erlang": {
    "name": "Erlang",
    "extension": "erl"
  },
  "elixir": {
    "name": "Elixir",
    "extension": "ex"
  },
  "dart": {
    "name": "Dart",
    "extension": "dart"
  },
  "bash": {
    "name": "Bash",
    "extension": "sh"
  },
  "mysql": {
    "name": "MySQL",
    "extension": "mysql.sql"
  },
  "mssql": {
    "name": "MS SQL Server",
    "extension": "mssql.sql"
  },
  "oraclesql": {
    "name": "Oracle",
    "extension": "oraclesql.sql"
  },
  "postgresql": {
    "name": "PostgreSQL",
    "extension": "postgresql.sql"
  },
  "pythondata": {
    "name": "Pandas",
    "extension": "pythondata.py"
  }
}

let config;
// Where ReadMe.md, ProblemList/ and ProblemSet/ are written; set by config.outputDir (e.g. a clone of your solution repo).
let outputDir = "./result";
// problem slug -> (language -> latest recent accepted submission); only filled with --recent.
let recentAc = new Map();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let nextRequestAt = 0;
async function throttle() {
  const wait = nextRequestAt - Date.now();
  nextRequestAt = Math.max(nextRequestAt, Date.now()) + REQUEST_INTERVAL_MS;
  if (wait > 0)
    await sleep(wait);
}

async function fetch_leetcode(query, variables) {
  for (let attempt = 1; ; attempt++) {
    await throttle();
    const response = await fetch(LEETCODE_API_ENDPOINT, {
      method: "post",
      headers: {
        'Content-Type': 'application/json',
        cookie: `csrftoken=${config.csrftoken}; LEETCODE_SESSION=${config['LEETCODE_SESSION']}`
      },
      body: JSON.stringify({ query, variables }),
    });
    if (response.ok)
      return await response.json();
    if (attempt >= MAX_RETRIES)
      throw new Error(`LeetCode API responded with ${response.status}`);
    await sleep(1000 * attempt);
  }
}

async function fetch_code(query, submissionId) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await fetch_leetcode(query, { submissionId });
    if (result.data?.submissionDetails)
      return result.data.submissionDetails.code;
    await sleep(2000 * attempt);
  }
  throw new Error(`failed to fetch the code of submission ${submissionId}`);
}

// Rebuild the answer list of an already crawled problem from the files in its folder.
async function read_existing_answers(dir, slug) {
  let files;
  try {
    files = await fs.readdir(dir);
  } catch {
    return null;
  }
  const prefix = `${slug}.`;
  const known = Object.values(languages).filter(l => files.includes(`${prefix}${l.extension}`));
  const unknown = files.filter(f => f.startsWith(prefix) && f.endsWith(".txt")).map(f => f.slice(prefix.length, -4)).map(l => ({ name: l, extension: `${l}.txt` }));
  const found = [...known, ...unknown];
  return found.length ? found : null;
}

// async function fetch_leetcode_submission(qid, lang) {
//   const response = await fetch(`${LEETCODE_API_SUBMISSION}?qid=${qid}&lang=${lang}`, {
//     method: "get",
//     headers: {
//       'Content-Type': 'application/json',
//       cookie: `csrftoken=${config.csrftoken}; LEETCODE_SESSION=${config['LEETCODE_SESSION']}`
//     }
//   });
//   const json = await response.json();
//   return json.code;
// }

function language_of(lang, langName) {
  return languages[lang] ?? { name: langName ?? lang, extension: `${lang}.txt` };
}

async function fetch_recent_ac(query) {
  const list = (await fetch_leetcode(query, { username: config.username, limit: RECENT_AC_LIMIT })).data.recentAcSubmissionList;
  if (!list)
    throw new Error("LeetCode returned no recent accepted submissions.");
  const bySlug = new Map();
  // Newest first, so the first submission seen per problem and language is the latest.
  for (const s of list) {
    if (!bySlug.has(s.titleSlug))
      bySlug.set(s.titleSlug, new Map());
    const languagesOfProblem = bySlug.get(s.titleSlug);
    if (!languagesOfProblem.has(s.lang))
      languagesOfProblem.set(s.lang, s);
  }
  return bySlug;
}

async function main() {
  config = JSON.parse(await fs.readFile("./config.json", { encoding: "utf8" }));
  outputDir = config.outputDir || outputDir;
  if (!config.username || !config.csrftoken || !config.LEETCODE_SESSION)
    throw new Error("config.json needs username, csrftoken and LEETCODE_SESSION.");
  console.log(`Output directory: ${path.resolve(outputDir)}`);

  const userQuery = await fs.readFile("./query/user.graphql", { encoding: "utf8" });
  const problemQuery = await fs.readFile("./query/problem.graphql", { encoding: "utf8" });
  const submissionQuery = await fs.readFile("./query/submission.graphql", { encoding: "utf8" });
  const submissionDetailQuery = await fs.readFile("./query/submissionDetail.graphql", { encoding: "utf8" });
  const recentAcQuery = await fs.readFile("./query/recentAc.graphql", { encoding: "utf8" });

  const user = (await fetch_leetcode(userQuery, { username: config.username })).data;
  if (!user.matchedUser)
    throw new Error(`LeetCode user "${config.username}" was not found, check username in config.json.`);
  user.submission = user.matchedUser.submitStats.acSubmissionNum;
  for (let [i, v] of configVars.entries()) {
    config[`all_${v}`] = user.allQuestionsCount[i].count;
    config[`cur_${v}`] = user.submission[i].count;
  }

  let header = await fs.readFile("./template/header.md", { encoding: "utf8" });
  for (let v of headerVars)
    header = header.replace(`{{ ${v} }}`, config[v]);

  const pageHeader = await fs.readFile("./template/page_header.md", { encoding: "utf8" });
  const body = await fs.readFile("./template/body.md", { encoding: "utf8" });

  // LeetCode caps each response at 100 questions, so page through with skip.
  // Pages can overlap, so de-duplicate by questionId and stop at the first empty page.
  const problemMap = new Map();
  for (let skip = 0; ; skip += PROBLEM_PAGE_SIZE) {
    const page = (await fetch_leetcode(problemQuery, { categorySlug: "", skip, limit: PROBLEM_PAGE_SIZE, filters: { status: "AC" } })).data.problemsetQuestionList.questions;
    if (page.length == 0)
      break;
    for (const p of page)
      problemMap.set(p.questionId, p);
  }
  const problems = [...problemMap.values()];
  if (problems.length == 0 && config.cur_solved > 0)
    throw new Error("Could not list your solved problems. csrftoken / LEETCODE_SESSION in config.json are probably expired, copy fresh values from the leetcode.com cookies in your browser. Nothing was written.");
  if (problems.length != config.cur_solved)
    console.warn(`Warning: expected ${config.cur_solved} problems but fetched ${problems.length}`);

  if (RECENT && !FULL) {
    recentAc = await fetch_recent_ac(recentAcQuery);
    console.log(`Recent AC: ${[...recentAc.values()].reduce((n, m) => n + m.size, 0)} language(s) in ${recentAc.size} problem(s) to refresh`);
  }

  const queries = { submissionQuery, submissionDetailQuery };
  const rows = new Array(problems.length);
  const failed = [];
  let next = 0, done = 0;
  async function worker() {
    while (next < problems.length) {
      const i = next++;
      rows[i] = await process_problem(problems[i], body, queries, failed);
      console.log(`Progress: ${++done}/${problems.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, problems.length) }, worker));

  if (failed.length)
    console.warn(`Failed (will be retried on the next run): ${failed.join(", ")}`);

  // datetime
  header = header.replace(`{{ date }}`, (new Date()).toLocaleString('en-US'));

  // Group rows into pages by problem id, so adding a problem only touches one page.
  const pages = new Map();
  for (const r of rows) {
    const page = Math.floor((r.id - 1) / PAGE_SIZE);
    if (!pages.has(page))
      pages.set(page, []);
    pages.get(page).push(r);
  }
  const pageNumbers = [...pages.keys()].sort((x, y) => x - y);
  const rangeOf = page => `${String(page * PAGE_SIZE + 1).padStart(4, "0")}-${String((page + 1) * PAGE_SIZE).padStart(4, "0")}`;
  // The first page is the ReadMe itself, the others live in ProblemList/.
  const pathOf = (page, from) => {
    const fromRoot = from == pageNumbers[0];
    if (page == pageNumbers[0])
      return fromRoot ? "ReadMe.md" : "../ReadMe.md";
    return `${fromRoot ? "ProblemList/" : ""}${rangeOf(page)}.md`;
  };

  await fs.mkdir(outputDir, { recursive: true });
  await fs.rm(path.join(outputDir, "ProblemList"), { recursive: true, force: true });
  await fs.mkdir(path.join(outputDir, "ProblemList"), { recursive: true });

  for (const [n, page] of pageNumbers.entries()) {
    const isFirst = n == 0;
    const root = isFirst ? "" : "../";
    const list = pages.get(page).sort((x, y) => x.id - y.id);

    const links = pageNumbers.map(q => q == page ? `**${rangeOf(q)}**` : `[${rangeOf(q)}](${pathOf(q, page)})`);
    const prev = n > 0 ? `[« Prev](${pathOf(pageNumbers[n - 1], page)})  ` : "";
    const nextLink = n < pageNumbers.length - 1 ? `  [Next »](${pathOf(pageNumbers[n + 1], page)})` : "";
    const pager = `\n\n<div align="center">\n\n${prev}${links.join(" · ")}${nextLink}\n\n</div>\n`;

    const table = `${pageHeader.replace("{{ range }}", rangeOf(page))}${list.map(r => `\n${r.row}`).join("")}${pager}`.replaceAll(ROOT, root);
    if (isFirst)
      await fs.writeFile(path.join(outputDir, "ReadMe.md"), `${header}\n${table}`);
    else
      await fs.writeFile(path.join(outputDir, "ProblemList", `${rangeOf(page)}.md`), table);
  }
  if (pageNumbers.length == 0)
    await fs.writeFile(path.join(outputDir, "ReadMe.md"), header);
}

async function process_problem(p, body, { submissionQuery, submissionDetailQuery }, failed) {
  const problemObject = {
    id: p.frontendQuestionId,
    title: p.title,
    url: `https://leetcode.com/problems/${p.titleSlug}`,
    acRate: p.acRate.toFixed(1),
    difficulty: `<img src="https://img.shields.io/badge/${difficulty[p.difficulty]}" />`,
  }
  problemObject.tags = p.topicTags.map(tag => `[${tag.name}](https://leetcode.com/tag/${tag.slug})`).join(" &#124; ");

  const id = `${problemObject.id}`.padStart(4, "0");
  const dir = path.join(outputDir, "ProblemSet", `${id}.${p.titleSlug}`);
  const link = ({ name, extension }) => `[${name}](${ROOT}ProblemSet/${id}.${p.titleSlug}/${p.titleSlug}.${extension})`;
  let answers = [];

  const hadDir = await fs.access(dir).then(() => true, () => false);
  try {
    const existing = FULL ? null : await read_existing_answers(dir, p.titleSlug);
    if (existing) {
      const refresh = recentAc.get(p.titleSlug);
      if (refresh) {
        for (const [l, submission] of refresh) {
          const language = language_of(l, submission.langName);
          const code = await fetch_code(submissionDetailQuery, submission.id);
          await fs.writeFile(`${dir}/${p.titleSlug}.${language.extension}`, code);
        }
        console.log(`Refreshed ${p.titleSlug}: ${[...refresh.keys()].join(", ")}`);
        // A refreshed language may be a new one, so list the folder again.
        answers = ((await read_existing_answers(dir, p.titleSlug)) ?? []).map(link);
      } else {
        answers = existing.map(link);
      }
    } else {
      // Submissions come newest first, so the first Accepted one seen per language is the latest.
      const latest = new Map();
      let lastKey = null;
      for (let offset = 0; ; offset += SUBMISSION_PAGE_SIZE) {
        const list = (await fetch_leetcode(submissionQuery, { offset, limit: SUBMISSION_PAGE_SIZE, lastKey, questionSlug: p.titleSlug })).data.submissionList;
        if (!list.submissions)
          throw new Error("no submission list returned, the session may have expired");
        for (let s of list.submissions)
          if (s.statusDisplay == "Accepted" && !latest.has(s.lang))
            latest.set(s.lang, s);
        if (!list.hasNext)
          break;
        lastKey = list.lastKey;
      }

      // Known languages first (in table order), then any language not in the table.
      const langOrder = [...Object.keys(languages).filter(l => latest.has(l)), ...[...latest.keys()].filter(l => !(l in languages))];
      for (let l of langOrder) {
        const submission = latest.get(l);
        const language = language_of(l, submission.langName);
        const code = await fetch_code(submissionDetailQuery, submission.id);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(`${dir}/${p.titleSlug}.${language.extension}`, code);
        answers.push(link(language));
      }
    }
  } catch (e) {
    console.warn(`Failed on ${p.titleSlug}: ${e.message}`);
    failed.push(p.titleSlug);
    // Drop a folder created by this attempt so the next run crawls the problem again, but never one that was already there (--full).
    if (!hadDir)
      await fs.rm(dir, { recursive: true, force: true });
    answers = ((await read_existing_answers(dir, p.titleSlug)) ?? []).map(link);
  }
  problemObject.answers = answers.join(" &#124; ");

  let bodyCopy = body;
  for (let v of bodyVars)
    bodyCopy = bodyCopy.replaceAll(`{{ ${v} }}`, problemObject[v]);
  return { id: parseInt(problemObject.id), row: bodyCopy };
}
main().catch(e => {
  console.error(`Error: ${e.message}`);
  process.exitCode = 1;
});
