// Octokit.js
// https://github.com/octokit/core.js#readme
import tgpu from "typegpu";

const octokit = new Octokit({
  auth: "YOUR-TOKEN",
});

await octokit.request("GET /repos/{owner}/{repo}/stargazers", {
  owner: "OWNER",
  repo: "REPO",
  headers: {
    "X-GitHub-Api-Version": "2022-11-28",
  },
});
