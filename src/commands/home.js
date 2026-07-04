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
  try {
    const result = await runtime.client.callTool("list_issues", withRepoProject({ assignee: "me", limit: 10, orderBy: "updatedAt" }, repoProject));
    const data = extractData(result);
    issueCount = asArray(data).length;
    issueMore = Boolean(paginationInfo(data, issueCount).cursor);
  } catch (caught) {
    error = mcpErrorMessage(caught);
  }

  const output = {
    bin: collapseHome(runtime.binPath),
    description: "AXI wrapper around the configured Linear MCP server",
    project: repoProject?.project ?? await workspaceName(runtime.cwd),
  };

  if (error) {
    output.status = "Linear MCP connection unavailable";
    output.error = error;
  } else {
    output.issues = `${issueCount}${issueMore ? "+" : ""} assigned to me`;
  }

  output.help = [
    "Run `linear-axi <command> <subcommand>` — commands: auth, issues, projects, teams, users, comments, documents",
  ];

  return renderToon(output);
}
