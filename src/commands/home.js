import { collapseHome } from "../config.js";
import { renderToon } from "../format.js";
import { paginationInfo } from "../lib/linear-format.js";
import { asArray, extractData } from "../lib/mcp-tools.js";
import { readRepoProject, withRepoProject } from "../lib/repo-project.js";
import { mcpErrorMessage, workspaceName } from "./shared.js";

export async function homeCommand(runtime) {
  let issueCount = 0;
  let issueMore = false;
  let error;
  const repoProject = await readRepoProject(runtime.cwd);

  const output = {
    bin: collapseHome(runtime.binPath),
    description: "Linear project dashboard",
  };

  if (!repoProject) {
    output.repo = await workspaceName(runtime.cwd);
    output.project = "not initialized";
    output.status = "No default Linear project is configured for this repository";
    output.help = [
      "Run `linear-axi projects list` to find Linear projects",
      'Run `linear-axi init --project "<project>"` to bind this repo',
      "Run `linear-axi issues list --assignee me` to list your assigned issues across Linear",
    ];
    return renderToon(output);
  }

  try {
    const result = await runtime.client.callTool("list_issues", withRepoProject({ assignee: "me", limit: 10, orderBy: "updatedAt" }, repoProject));
    const data = extractData(result);
    issueCount = asArray(data).length;
    issueMore = Boolean(paginationInfo(data, issueCount).cursor);
  } catch (caught) {
    error = mcpErrorMessage(caught);
  }

  output.project = repoProject.project;

  if (error) {
    output.status = "Linear MCP connection unavailable";
    output.error = error;
  } else {
    output.issues = `${issueCount}${issueMore ? "+" : ""} assigned to me in project`;
  }

  output.help = [
    "Run `linear-axi <command> <subcommand>` — commands: auth, issues, projects, teams, users, comments, documents",
  ];

  return renderToon(output);
}
