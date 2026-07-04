import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { parseFlags, AxiError, usage } from "./args.js";
import { collapseHome, resolveMcpUrl } from "./config.js";
import { renderToon } from "./format.js";
import { LinearMcpClient } from "./mcp.js";

const DEFAULT_LIMIT = 50;
const LIST_TOOL_ALIASES = {
  issues: ["list_issues"],
  issue: ["list_issues"],
  projects: ["list_projects"],
  project: ["list_projects"],
  teams: ["list_teams"],
  team: ["list_teams"],
  users: ["list_users"],
  user: ["list_users"],
  documents: ["list_documents"],
  document: ["list_documents"],
  labels: ["list_issue_labels"],
  label: ["list_issue_labels"],
  releases: ["list_releases", "list_release_pipelines"],
  release: ["list_releases", "list_release_pipelines"],
};

export async function main(args, context) {
  const runtime = await makeRuntime(context);
  try {
    const output = await run(args, runtime);
    context.stdout.write(output);
  } catch (error) {
    const axiError = normalizeError(error);
    context.stdout.write(renderToon({ error: axiError.message, help: axiError.help }));
    process.exitCode = axiError.exitCode;
  } finally {
    await runtime.client?.close();
  }
}

export async function run(args, runtime) {
  if (args.length === 0) {
    return home(runtime);
  }

  const [command, ...rest] = args;
  if (command === "--help" || command === "-h") return topHelp();
  if (command === "auth") return authCommand(rest, runtime);
  if (command === "issues" || command === "issue") return issueCommand(rest, runtime);
  if (command === "comments" || command === "comment") return commentCommand(rest, runtime);
  if (command === "milestones" || command === "milestone") return milestoneCommand(rest, runtime);
  if (command === "cycles" || command === "cycle") return cycleCommand(rest, runtime);
  if (command === "statuses" || command === "status") return statusCommand(rest, runtime);
  if (command === "documents" || command === "document") return documentCommand(rest, runtime);
  if (command in LIST_TOOL_ALIASES) return listResourceCommand(command, rest, runtime);

  throw usage(`unknown command: ${command}`, [
    "Run `linear-axi`",
    "Run `linear-axi issues list`",
    "Run `linear-axi projects list`",
    "Run `linear-axi teams list`",
  ]);
}

async function makeRuntime(context) {
  const url = await resolveMcpUrl(context.env);
  return {
    cwd: context.cwd,
    env: context.env,
    binPath: executablePath(),
    mcpUrl: url,
    client: context.client ?? new LinearMcpClient({
      url,
      token: context.env.LINEAR_AXI_MCP_TOKEN ?? context.env.LINEAR_MCP_TOKEN,
      authStorePath: context.env.LINEAR_AXI_AUTH_FILE,
    }),
  };
}

async function home(runtime) {
  let issueRows = [];
  let error;
  try {
    const result = await runtime.client.callTool("list_issues", { assignee: "me", limit: 10, orderBy: "updatedAt" });
    issueRows = compactIssues(extractData(result)).slice(0, 10);
  } catch (caught) {
    error = mcpErrorMessage(caught);
  }

  const output = {
    bin: collapseHome(runtime.binPath),
    description: "AXI wrapper around the configured Linear MCP server",
    mcp: { url: runtime.mcpUrl },
  };

  if (error) {
    output.status = "Linear MCP connection unavailable";
    output.error = error;
  } else if (issueRows.length === 0) {
    output.issues = "0 issues assigned to me found";
  } else {
    output.issues = issueRows;
  }

  output.help = [
    "Run `linear-axi issues list --assignee me --limit 50` to list issues",
    "Run `linear-axi projects list --limit 50` to list projects",
    "Run `linear-axi comments list --issue LIN-123` to list issue comments",
  ];

  return renderToon(output);
}

async function issueCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "list") {
    return aliasListCommand("issues", rest, runtime);
  }
  if (subcommand === "view") {
    const parsed = parseFlags(rest, { boolean: ["help", "full"], example: "issues view LIN-123" });
    if (parsed.help) return issueViewHelp();
    const id = parsed.positionals[0];
    if (!id) throw usage("issue id is required", ["Run `linear-axi issues view <id>`"]);
    const detail = await getIssueDetail(id, runtime);
    if (!detail) return renderToon({ issues: `0 issues found for ${id}` });
    return renderToon({ issue: parsed.full ? detail : compactIssues(detail)[0] });
  }
  if (subcommand === "save") {
    return saveIssueCommand(rest, runtime);
  }
  throw usage(`unknown issues command: ${subcommand}`, [
    "Run `linear-axi issues list`",
    "Run `linear-axi issues view <id>`",
    "Run `linear-axi issues save --id <id> --state done`",
  ]);
}

async function saveIssueCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], array: ["label"], example: 'issues save --title "Bug" --team ENG' });
  if (parsed.help) return issueSaveHelp();
  const toolArgs = collectKnownArgs(parsed, [
    "id",
    "title",
    "team",
    "description",
    "state",
    "assignee",
    "project",
    "cycle",
    "parentId",
    "dueDate",
    "estimate",
    "priority",
  ]);
  if (parsed.label) toolArgs.labels = parsed.label;
  if (parsed["description-file"]) toolArgs.description = await readTextFlag(parsed["description-file"], runtime.cwd);
  if (!toolArgs.id && (!toolArgs.title || !toolArgs.team)) {
    throw usage("creating an issue requires --title and --team", [
      'Run `linear-axi issues save --title "Title" --team "<team>"`',
      'Run `linear-axi issues save --id LIN-123 --state "Done"`',
    ]);
  }
  const result = await runtime.client.callTool("save_issue", toolArgs);
  return renderToon({ issue: extractData(result) });
}

async function listResourceCommand(alias, args, runtime) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "list") {
    return aliasListCommand(alias, rest, runtime);
  }
  throw usage(`unknown ${pluralName(alias)} command: ${subcommand}`, [
    `Run \`linear-axi ${pluralName(alias)} list\``,
  ]);
}

async function aliasListCommand(alias, args, runtime) {
  const publicName = pluralName(alias);
  const toolNames = LIST_TOOL_ALIASES[alias];
  const parsed = parseFlags(args, { boolean: ["help", "full", "includeArchived", "includeMembers", "includeMilestones", "includeStages", "includeTeams"], example: `${publicName} list --limit ${DEFAULT_LIMIT}` });
  if (parsed.help) return listAliasHelp(publicName);
  const toolArgs = collectKnownArgs(parsed, [
    "assignee",
    "createdAt",
    "cursor",
    "cycle",
    "delegate",
    "label",
    "limit",
    "member",
    "name",
    "orderBy",
    "parentId",
    "priority",
    "project",
    "query",
    "release",
    "state",
    "team",
    "teamId",
    "updatedAt",
    "includeArchived",
    "includeMembers",
    "includeMilestones",
    "includeStages",
    "includeTeams",
  ]);
  if (!("limit" in toolArgs)) toolArgs.limit = DEFAULT_LIMIT;

  const result = await callAvailableTool(runtime, toolNames, toolArgs);
  const data = extractData(result);
  const rows = parsed.full ? data : compactRows(alias, data);
  const count = Array.isArray(rows) ? `${rows.length} returned` : "1 returned";
  return renderToon({
    count,
    [publicName]: rows.length === 0 ? `0 ${publicName} found` : rows,
    help: [
      `Run \`linear-axi ${publicName} list --full\` to show the full response`,
      `Run \`linear-axi ${publicName} list --query "<text>"\` to search`,
    ],
  });
}

async function documentCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "list") return aliasListCommand("documents", rest, runtime);
  if (subcommand === "save") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: 'documents save --title "Spec" --team ENG' });
    if (parsed.help) return documentSaveHelp();
    const toolArgs = collectKnownArgs(parsed, ["id", "title", "team", "project", "issue", "initiative", "cycle", "color", "icon", "content"]);
    if (parsed["content-file"]) toolArgs.content = await readTextFlag(parsed["content-file"], runtime.cwd);
    if (!toolArgs.id && !toolArgs.title) {
      throw usage("creating a document requires --title", ['Run `linear-axi documents save --title "Spec" --team "<team>"`']);
    }
    const result = toolArgs.id
      ? await callAvailableTool(runtime, ["update_document", "save_document"], toolArgs)
      : await callAvailableTool(runtime, ["create_document", "save_document"], toolArgs);
    return renderToon({ document: extractData(result) });
  }
  throw usage(`unknown documents command: ${subcommand}`, ["Run `linear-axi documents list`", "Run `linear-axi documents save --title \"Spec\" --team ENG`"]);
}

async function commentCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "list") {
    const parsed = parseFlags(rest, { boolean: ["help", "full"], example: "comments list --issue LIN-123" });
    if (parsed.help) return commentListHelp();
    const toolArgs = parentArgs(parsed);
    toolArgs.limit = Number(parsed.limit ?? DEFAULT_LIMIT);
    if (parsed.cursor) toolArgs.cursor = parsed.cursor;
    if (parsed.orderBy) toolArgs.orderBy = parsed.orderBy;
    requireOneParent(toolArgs, "comments list");
    const result = await runtime.client.callTool("list_comments", toolArgs);
    return renderToon({ comments: parsed.full ? extractData(result) : compactComments(extractData(result)) });
  }
  if (subcommand === "save") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: 'comments save --issue LIN-123 --body "Ready"' });
    if (parsed.help) return commentSaveHelp();
    const toolArgs = parentArgs(parsed);
    if (parsed.id) toolArgs.id = parsed.id;
    if (parsed.parentId) toolArgs.parentId = parsed.parentId;
    toolArgs.body = parsed.body ?? (parsed["body-file"] ? await readTextFlag(parsed["body-file"], runtime.cwd) : undefined);
    if (!toolArgs.body) {
      throw usage("--body or --body-file is required", ['Run `linear-axi comments save --issue LIN-123 --body "Ready"`']);
    }
    if (!toolArgs.id && !toolArgs.parentId) requireOneParent(toolArgs, "comments save");
    const result = await runtime.client.callTool("save_comment", toolArgs);
    return renderToon({ comment: extractData(result) });
  }
  throw usage(`unknown comments command: ${subcommand}`, ["Run `linear-axi comments list --issue LIN-123`", "Run `linear-axi comments save --issue LIN-123 --body \"...\"`"]);
}

async function milestoneCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "list") {
    const parsed = parseFlags(rest, { boolean: ["help", "full"], example: 'milestones list --project "Roadmap"' });
    if (parsed.help) return milestoneListHelp();
    if (!parsed.project) throw usage("--project is required", ['Run `linear-axi milestones list --project "<project>"`']);
    const result = await runtime.client.callTool("list_milestones", { project: parsed.project });
    return renderToon({ milestones: parsed.full ? extractData(result) : compactRows("milestones", extractData(result)) });
  }
  if (subcommand === "view") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: 'milestones view --project "Roadmap" "Beta"' });
    if (parsed.help) return milestoneViewHelp();
    const query = parsed.positionals[0] ?? parsed.query;
    if (!parsed.project || !query) throw usage("--project and milestone query are required", ['Run `linear-axi milestones view --project "<project>" "<milestone>"`']);
    const result = await runtime.client.callTool("get_milestone", { project: parsed.project, query });
    return renderToon({ milestone: extractData(result) });
  }
  if (subcommand === "save") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: 'milestones save --project "Roadmap" --name "Beta"' });
    if (parsed.help) return milestoneSaveHelp();
    if (!parsed.project) throw usage("--project is required", ['Run `linear-axi milestones save --project "<project>" --name "<name>"`']);
    const result = await runtime.client.callTool("save_milestone", collectKnownArgs(parsed, ["id", "name", "project", "description", "targetDate"]));
    return renderToon({ milestone: extractData(result) });
  }
  throw usage(`unknown milestones command: ${subcommand}`, ["Run `linear-axi milestones list --project <project>`"]);
}

async function cycleCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "list") {
    const parsed = parseFlags(rest, { boolean: ["help", "full"], example: "cycles list --team ENG" });
    if (parsed.help) return cycleListHelp();
    const teamId = parsed.teamId ?? parsed.team;
    if (!teamId) throw usage("--team is required", ["Run `linear-axi cycles list --team <team-id>`"]);
    const result = await runtime.client.callTool("list_cycles", { teamId, type: parsed.type });
    return renderToon({ cycles: parsed.full ? extractData(result) : compactRows("cycles", extractData(result)) });
  }
  throw usage(`unknown cycles command: ${subcommand}`, ["Run `linear-axi cycles list --team <team-id>`"]);
}

async function statusCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "list") {
    const parsed = parseFlags(rest, { boolean: ["help", "full", "includeArchived"], example: "statuses list --team ENG" });
    if (parsed.help) return statusListHelp();
    const team = parsed.teamId ?? parsed.team;
    if (!team) throw usage("--team is required", ["Run `linear-axi statuses list --team <team>`"]);
    const result = await callAvailableTool(runtime, ["list_issue_statuses", "get_status_updates"], collectKnownArgs(parsed, ["team", "teamId", "type", "project", "initiative", "user", "limit", "cursor", "orderBy", "createdAt", "updatedAt", "includeArchived"]));
    return renderToon({ statuses: parsed.full ? extractData(result) : compactRows("statuses", extractData(result)) });
  }
  if (subcommand === "save") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: 'statuses save --type project --project Roadmap --health onTrack --body "Update"' });
    if (parsed.help) return statusSaveHelp();
    if (!parsed.type) throw usage("--type is required", ["Run `linear-axi statuses save --type project --project <project> --body \"...\"`"]);
    const result = await callAvailableTool(runtime, ["save_status_update"], collectKnownArgs(parsed, ["id", "type", "project", "initiative", "health", "body"]));
    return renderToon({ status: extractData(result) });
  }
  if (subcommand === "delete") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: "statuses delete --type project --id <id>" });
    if (parsed.help) return statusDeleteHelp();
    if (!parsed.id || !parsed.type) throw usage("--id and --type are required", ["Run `linear-axi statuses delete --type project --id <id>`"]);
    const result = await callAvailableTool(runtime, ["delete_status_update"], { id: parsed.id, type: parsed.type });
    return renderToon({ status: extractData(result) });
  }
  throw usage(`unknown statuses command: ${subcommand}`, ["Run `linear-axi statuses list --type project`"]);
}

async function authCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "login") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: "auth login" });
    if (parsed.help) return authLoginHelp();
    try {
      await runtime.client.listTools();
      return renderToon({ auth: "Linear MCP OAuth already authorized" });
    } catch (error) {
      if (error.authorizationUrl) {
        return renderToon({
          auth: "Linear MCP OAuth authorization required",
          url: error.authorizationUrl,
          help: ["Open the URL, copy the redirected code, then run `linear-axi auth finish --code <code>`"],
        });
      }
      throw error;
    }
  }
  if (subcommand === "finish") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: "auth finish --code <code>" });
    if (parsed.help) return authFinishHelp();
    if (!parsed.code) throw usage("--code is required", ["Run `linear-axi auth finish --code <code>`"]);
    await runtime.client.finishAuth(parsed.code);
    return renderToon({ auth: "Linear MCP OAuth authorized" });
  }
  throw usage(`unknown auth command: ${subcommand ?? ""}`.trim(), [
    "Run `linear-axi auth login`",
    "Run `linear-axi auth finish --code <code>`",
  ]);
}

async function getIssueDetail(id, runtime) {
  const listed = await runtime.client.callTool("list_issues", { query: id, limit: 10 });
  const rawMatches = asArray(extractData(listed)).filter((issue) => issue.id === id || issue.identifier === id);
  if (rawMatches.length === 0) return null;
  try {
    const detailed = await callAvailableTool(runtime, ["get_issue"], { id });
    return extractData(detailed);
  } catch (error) {
    if (!isUnknownToolError(error)) throw error;
    return rawMatches[0];
  }
}

async function callAvailableTool(runtime, candidates, args) {
  const tools = typeof runtime.client.listTools === "function" ? await runtime.client.listTools() : [];
  const names = new Set(tools.map((tool) => tool.name));
  if (names.size > 0 && !candidates.some((candidate) => names.has(candidate))) {
    throw new ToolUnavailableError(candidates);
  }
  const preferred = candidates.find((candidate) => names.has(candidate)) ?? candidates[0];
  try {
    return await runtime.client.callTool(preferred, args);
  } catch (error) {
    if (!isUnknownToolError(error)) throw error;
    for (const candidate of candidates) {
      if (candidate === preferred) continue;
      try {
        return await runtime.client.callTool(candidate, args);
      } catch (candidateError) {
        if (!isUnknownToolError(candidateError)) throw candidateError;
      }
    }
    throw error;
  }
}

function isUnknownToolError(error) {
  if (error?.toolUnavailable) return true;
  const message = error && typeof error.message === "string" ? error.message : String(error);
  return /unknown tool|tool .*not found|method not found|not found.*tool/i.test(message);
}

class ToolUnavailableError extends Error {
  constructor(candidates) {
    super(`Linear MCP server does not expose ${candidates.join(" or ")}`);
    this.toolUnavailable = true;
  }
}

function compactRows(alias, data) {
  if (alias === "issues") return compactIssues(data);
  return asArray(data).map((item) => ({
    id: item.id ?? item.identifier ?? item.key ?? item.slug ?? item.name ?? "",
    name: item.name ?? item.title ?? item.displayName ?? item.email ?? "",
    state: item.state?.name ?? item.status?.name ?? item.state ?? item.status ?? "",
  }));
}

function compactComments(data) {
  return asArray(data).map((comment) => ({
    id: comment.id ?? "",
    author: comment.user?.name ?? comment.author?.name ?? "",
    created: comment.createdAt ?? "",
    body: truncate(String(comment.body ?? ""), 120).text,
  }));
}

function compactStatusUpdates(data) {
  return asArray(data).map((status) => ({
    id: status.id ?? "",
    health: status.health ?? "",
    user: status.user?.name ?? "",
    updated: status.updatedAt ?? status.createdAt ?? "",
  }));
}

function compactIssues(data) {
  return asArray(data).map((issue) => ({
    id: issue.identifier ?? issue.id ?? "",
    title: issue.title ?? "",
    state: issue.state?.name ?? issue.state ?? "",
    assignee: issue.assignee?.name ?? issue.assignee?.displayName ?? issue.assignee ?? "",
  }));
}

function extractData(result) {
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const text = result?.content?.find?.((item) => item.type === "text")?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
  return result ?? {};
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  for (const key of ["issues", "projects", "teams", "users", "documents", "comments", "milestones", "cycles", "statuses", "labels", "releases", "nodes", "items", "data"]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  if (data && typeof data === "object") return [data];
  return [];
}

function parentArgs(parsed) {
  return {
    ...(parsed.issue ? { issueId: parsed.issue } : {}),
    ...(parsed.issueId ? { issueId: parsed.issueId } : {}),
    ...(parsed.project ? { projectId: parsed.project } : {}),
    ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
    ...(parsed.initiative ? { initiativeId: parsed.initiative } : {}),
    ...(parsed.initiativeId ? { initiativeId: parsed.initiativeId } : {}),
    ...(parsed.document ? { documentId: parsed.document } : {}),
    ...(parsed.documentId ? { documentId: parsed.documentId } : {}),
    ...(parsed.milestone ? { milestoneId: parsed.milestone } : {}),
    ...(parsed.milestoneId ? { milestoneId: parsed.milestoneId } : {}),
  };
}

function requireOneParent(toolArgs, command) {
  const count = ["issueId", "projectId", "initiativeId", "documentId", "milestoneId"].filter((key) => toolArgs[key]).length;
  if (count !== 1) {
    throw usage(`${command} requires exactly one parent`, [
      `Run \`linear-axi ${command} --issue LIN-123\``,
      `Run \`linear-axi ${command} --project "<project>"\``,
    ]);
  }
}

function collectKnownArgs(parsed, names) {
  const collected = {};
  for (const name of names) {
    if (parsed[name] !== undefined) collected[name] = coerceArg(name, parsed[name]);
  }
  return collected;
}

function coerceArg(name, value) {
  if (["limit", "estimate", "priority"].includes(name)) return Number(value);
  if (["includeArchived", "includeMembers", "includeMilestones"].includes(name)) return value === true || value === "true";
  return value;
}

async function readTextFlag(path, cwd) {
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);
  try {
    return await readFile(absolute, "utf8");
  } catch {
    throw usage(`file could not be read: ${path}`, ["Rerun with a readable file path"]);
  }
}

function truncate(text, limit) {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit), truncated: true };
}

function executablePath() {
  try {
    return realpathSync(process.argv[1]);
  } catch {
    return process.argv[1] ?? "linear-axi";
  }
}

function normalizeError(error) {
  if (error instanceof AxiError) return error;
  if (error?.authorizationUrl) {
    return new AxiError("operational", "Linear MCP OAuth authorization required", [
      "Run `linear-axi auth login`",
      "Open the authorization URL and finish with `linear-axi auth finish --code <code>`",
    ]);
  }
  return new AxiError("operational", mcpErrorMessage(error), [
    "Run `linear-axi issues list --assignee me` to verify Linear access",
    "Run `linear-axi auth login` to authorize the default Linear MCP endpoint",
  ]);
}

function mcpErrorMessage(error) {
  const message = error && typeof error.message === "string" ? error.message : String(error);
  if (/unauthorized|401|invalid_token|access token/i.test(message)) {
    return "Linear MCP authentication failed";
  }
  return message;
}

function topHelp() {
  return `usage: linear-axi <command>
commands[11]:
  auth, issues, projects, teams, users, comments, documents, milestones, cycles, statuses, labels
examples:
  linear-axi
  linear-axi auth login
  linear-axi issues list --assignee me --limit 25
  linear-axi issues save --id LIN-123 --state Done
  linear-axi comments save --issue LIN-123 --body "Ready for review."
env[3]:
  LINEAR_AXI_MCP_URL, LINEAR_AXI_MCP_TOKEN, LINEAR_MCP_TOKEN, LINEAR_AXI_AUTH_FILE
`;
}

function listAliasHelp(alias) {
  return `usage: linear-axi ${alias} list [filters] [--full]
flags:
  --limit <n> default ${DEFAULT_LIMIT}
  --query <text>
  --team <name-or-id>
  --state <name-or-type>
  --orderBy createdAt|updatedAt
examples:
  linear-axi ${alias} list --limit 25
  linear-axi ${alias} list --query "auth" --full
`;
}

function commentListHelp() {
  return `usage: linear-axi comments list (--issue <id> | --project <id> | --initiative <id> | --document <id> | --milestone <id>)
flags:
  --limit <n> default ${DEFAULT_LIMIT}
  --orderBy createdAt|updatedAt
examples:
  linear-axi comments list --issue LIN-123
  linear-axi comments list --project "Roadmap" --limit 100
`;
}

function commentSaveHelp() {
  return `usage: linear-axi comments save (--issue <id> | --project <id> | --parentId <id>) (--body <text> | --body-file <path>)
examples:
  linear-axi comments save --issue LIN-123 --body "Ready for review."
  linear-axi comments save --parentId <comment-id> --body-file reply.md
`;
}

function documentSaveHelp() {
  return `usage: linear-axi documents save (--id <id> | --title <title>) [parent] [--content <markdown> | --content-file <path>]
examples:
  linear-axi documents save --title "Spec" --team ENG --content-file spec.md
  linear-axi documents save --id <id> --content "Updated"
`;
}

function milestoneListHelp() {
  return `usage: linear-axi milestones list --project <project>
examples:
  linear-axi milestones list --project "Roadmap"
`;
}

function milestoneViewHelp() {
  return `usage: linear-axi milestones view --project <project> <milestone>
examples:
  linear-axi milestones view --project "Roadmap" "Beta"
`;
}

function milestoneSaveHelp() {
  return `usage: linear-axi milestones save --project <project> (--id <id> | --name <name>)
examples:
  linear-axi milestones save --project "Roadmap" --name "Beta"
`;
}

function cycleListHelp() {
  return `usage: linear-axi cycles list --team <team-id> [--type current|previous|next|all]
examples:
  linear-axi cycles list --team ENG --type current
`;
}

function statusListHelp() {
  return `usage: linear-axi statuses list --team <team> [--full]
examples:
  linear-axi statuses list --team ENG
`;
}

function statusSaveHelp() {
  return `usage: linear-axi statuses save --type project|initiative [--project <project> | --initiative <initiative>] [--health onTrack|atRisk|offTrack] [--body <markdown>]
examples:
  linear-axi statuses save --type project --project "Roadmap" --health onTrack --body "Shipped."
`;
}

function statusDeleteHelp() {
  return `usage: linear-axi statuses delete --type project|initiative --id <id>
examples:
  linear-axi statuses delete --type project --id <id>
`;
}

function issueViewHelp() {
  return `usage: linear-axi issues view <id> [--full]
examples:
  linear-axi issues view LIN-123
  linear-axi issues view LIN-123 --full
`;
}

function issueSaveHelp() {
  return `usage: linear-axi issues save (--id <id> | --title <title> --team <team>) [fields]
flags:
  --id <id>
  --title <title>
  --team <team>
  --state <state>
  --assignee <user>
  --description <markdown>
  --description-file <path>
examples:
  linear-axi issues save --title "Fix auth" --team ENG
  linear-axi issues save --id LIN-123 --state Done
`;
}

function authLoginHelp() {
  return `usage: linear-axi auth login
examples:
  linear-axi auth login
`;
}

function authFinishHelp() {
  return `usage: linear-axi auth finish --code <code>
examples:
  linear-axi auth finish --code <code>
`;
}

function pluralName(name) {
  const names = {
    issue: "issues",
    project: "projects",
    team: "teams",
    user: "users",
    document: "documents",
    label: "labels",
    release: "releases",
  };
  return names[name] ?? name;
}
