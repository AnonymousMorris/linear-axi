import { collapseHome } from "../config.js";
import { renderToon } from "../format.js";
import { paginationInfo } from "../lib/linear-format.js";
import { asArray, callAvailableTool, extractData } from "../lib/mcp-tools.js";
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
    workspace: await linearWorkspaceName(runtime),
  };

  if (!repoProject) {
    output.project = "not initialized";
    output.repo = await workspaceName(runtime.cwd);
    output.status = "No default Linear project is configured for this repository";
    output.help = [
      "Run `linear-axi projects list` to find Linear projects",
      'Run `linear-axi init --project "<project>"` to bind this repo',
      "Run `linear-axi issues list --assignee me --all-projects` to list your assigned issues across Linear",
      "Run `linear-axi <command> <subcommand>` — commands: auth, issues, projects, teams, users, comments, documents",
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
  output.repo = await workspaceName(runtime.cwd);

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

async function linearWorkspaceName(runtime) {
  try {
    const result = await callAvailableTool(runtime, ["get_organization", "get_workspace", "list_projects", "list_teams"], (toolName) => (
      ["list_projects", "list_teams"].includes(toolName) ? { limit: 1 } : {}
    ));
    return extractWorkspaceName(extractData(result)) ?? "unknown";
  } catch {
    return "unknown";
  }
}

function extractWorkspaceName(data) {
  if (!data || typeof data !== "object") return null;
  for (const key of ["workspace", "organization"]) {
    const nested = extractWorkspaceName(data[key]);
    if (nested) return nested;
  }
  if (typeof data.url === "string") {
    const workspace = workspaceFromLinearUrl(data.url);
    if (workspace) return workspace;
  }
  if (typeof data.name === "string" && data.name.trim()) return data.name.trim();
  for (const key of ["projects", "teams", "nodes", "items", "data"]) {
    if (!Array.isArray(data[key])) continue;
    for (const item of data[key]) {
      const nested = extractWorkspaceName(item);
      if (nested) return nested;
    }
  }
  return null;
}

function workspaceFromLinearUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "linear.app") return null;
    const workspace = parsed.pathname.split("/").filter(Boolean)[0];
    return workspace || null;
  } catch {
    return null;
  }
}
