import * as fs from "node:fs/promises";

const LEETCODE_API_ENDPOINT = "https://leetcode.com/graphql";
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
  "swift": "Swift",
  "golang": "Go",
  "scala": "Scala",
  "kotlin": {
    "name": "Kotlin",
    "extension": "kt"
  },
  "rust": "Rust",
  "php": {
    "name": "PHP",
    "extension": "php"
  },
  "typescript": {
    "name": "TypeScript",
    "extension": "ts"
  },
  "racket": "Racket",
  "erlang": "Erlang",
  "elixir": "Elixir"
}

let config;

async function fetch_leetcode(query, variables) {
  const response = await fetch(LEETCODE_API_ENDPOINT, {
    method: "post",
    headers: {
      'Content-Type': 'application/json',
      cookie: `csrftoken=${config.csrftoken}; LEETCODE_SESSION=${config['LEETCODE_SESSION']}`
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await response.json();
  return data;
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

async function main() {
  config = JSON.parse(await fs.readFile("./config.json", { encoding: "utf8" }));

  const userQuery = await fs.readFile("./query/user.graphql", { encoding: "utf8" });
  const problemQuery = await fs.readFile("./query/problem.graphql", { encoding: "utf8" });
  const submissionQuery = await fs.readFile("./query/submission.graphql", { encoding: "utf8" });
  const submissionDetailQuery = await fs.readFile("./query/submissionDetail.graphql", { encoding: "utf8" });

  const user = (await fetch_leetcode(userQuery, { username: config.username })).data;
  user.submission = user.matchedUser.submitStats.acSubmissionNum;
  for (let [i, v] of configVars.entries()) {
    config[`all_${v}`] = user.allQuestionsCount[i].count;
    config[`cur_${v}`] = user.submission[i].count;
  }

  let header = await fs.readFile("./template/header.md", { encoding: "utf8" });
  for (let v of headerVars)
    header = header.replace(`{{ ${v} }}`, config[v]);

  const body = await fs.readFile("./template/body.md", { encoding: "utf8" });

  const problems = (await fetch_leetcode(problemQuery, { categorySlug: "", skip: 0, limit: config.cur_solved, filters: { status: "AC" } })).data.problemsetQuestionList.questions;

  let bodyResult = "";
  for (let p of problems) {
    let problemObject = {
      id: p.frontendQuestionId,
      title: p.title,
      url: `https://leetcode.com/problems/${p.titleSlug}`,
      acRate: p.acRate.toFixed(1),
      difficulty: `<img src="https://img.shields.io/badge/${difficulty[p.difficulty]}" />`,
    }
    let tags = [];
    for (let tag of p.topicTags)
      tags.push(`[${tag.name}](https://leetcode.com/tag/${tag.slug})`);
    problemObject.tags = tags.join(" &#124; ");

    let answers = [];
    const submissions = (await fetch_leetcode(submissionQuery, { offset: 0, limit: 20, lastKey: null, questionSlug: p.titleSlug })).data.submissionList.submissions.filter(s => s.statusDisplay == "Accepted");

    const lang = new Set();
    for (let s of submissions)
      lang.add(s.lang);
    for (let l in languages) {
      if (lang.has(l)) {
        let submission = submissions.find(s => s.lang == l);
        let code = "";
        do {
          code = await fetch_leetcode(submissionDetailQuery, { submissionId: submission.id });
        } while (code.data.submissionDetails == null);
        code = code.data.submissionDetails.code;
        let id = `${problemObject.id}`.padStart(4, "0");
        const dir = `./result/ProblemSet/${id}.${p.titleSlug}/`;
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(`${dir}/${p.titleSlug}.${languages[l].extension}`, code);
        answers.push(`[${languages[l].name}](ProblemSet/${id}.${p.titleSlug}/${p.titleSlug}.${languages[l].extension})`);
      }
    }
    problemObject.answers = answers.join(" &#124; ");

    let bodyCopy = body;
    for (let v of bodyVars)
      bodyCopy = bodyCopy.replaceAll(`{{ ${v} }}`, problemObject[v]);
    bodyResult += `\n${bodyCopy}`;
    console.log(`Progress: ${problems.indexOf(p) + 1}/${problems.length}`);
    //break; //for test
  }

  // datetime
  header = header.replace(`{{ date }}`, (new Date()).toLocaleString('en-US'));

  await fs.writeFile("./result/ReadMe.md", `${header}${bodyResult}`);
}
main();