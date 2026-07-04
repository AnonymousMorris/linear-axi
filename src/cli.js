import { realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
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
  if (command === "projects" || command === "project") return projectCommand(rest, runtime);
  if (command === "releases" || command === "release") return removedResourceCommand(command);
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
    stdout: context.stdout,
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
  let authRequired = false;
  try {
    const result = await runtime.client.callTool("list_issues", { assignee: "me", limit: 10, orderBy: "updatedAt" });
    issueRows = compactIssues(extractData(result)).slice(0, 10);
  } catch (caught) {
    error = mcpErrorMessage(caught);
    authRequired = isAuthRequiredError(caught);
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
    ...(authRequired ? ["Run `linear-axi auth login` to authorize Linear MCP access"] : []),
    "Run `linear-axi issues list --assignee me --limit 50` to list issues",
    "Run `linear-axi projects list --limit 50` to list projects",
    "Run `linear-axi comments list --issue LIN-123` to list issue comments",
  ];

  return renderToon(output);
}

async function issueCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("issues", ["list", "view", "save"]);
  if (!subcommand || subcommand === "list") {
    return aliasListCommand("issues", rest, runtime);
  }
  if (subcommand === "view") {
    const parsed = parseFlags(rest, { boolean: ["help", "full"], example: "issues view LIN-123" });
    if (parsed.help) return issueViewHelp();
    const id = parsed.positionals[0];
    if (!id) throw usage("issue id is required", ["Run `linear-axi issues view <id>`"]);
    if (id === "all") throw usage("issues view expects one issue id", [
      "Run `linear-axi issues list --limit 50` to view many issues",
      "Run `linear-axi issues view <id>` to view one issue",
    ]);
    const detail = await getIssueDetail(id, runtime);
    if (!detail) return renderToon({ issues: `0 issues found for ${id}` });
    if (parsed.full) return renderToon({ issue: detail });
    const compact = compactIssueDetail(detail);
    return renderToon({
      issue: compact.issue,
      ...(compact.truncated ? { help: [`Run \`linear-axi issues view ${id} --full\` to show the complete issue`] } : {}),
    });
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
  const issue = mutationData(result, [
    'Run `linear-axi issues save --title "Title" --team "<team>"`',
    "Run `linear-axi projects list --full` to confirm project/team compatibility",
  ]);
  return renderToon({
    issue: compactIssueMutation(issue),
    help: [
      `Run \`linear-axi issues view ${issue.identifier ?? issue.id ?? "<id>"}\` to verify details`,
      `Run \`linear-axi comments save --issue ${issue.identifier ?? issue.id ?? "<id>"} --body "..."\` to add context`,
    ],
  });
}

async function listResourceCommand(alias, args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp(pluralName(alias), ["list"]);
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
  const dataRows = asArray(data);
  const rows = parsed.full
    ? data
    : parsed.fields
      ? selectFields(dataRows, parseFields(parsed.fields))
      : compactRows(alias, data);
  const rowCount = dataRows.length;
  const page = paginationInfo(data, rowCount);
  const listValue = Array.isArray(rows) && rows.length === 0 ? `0 ${publicName} found` : rows;
  const help = [
    `Run \`linear-axi ${publicName} list --full\` to show the full response`,
    `Run \`linear-axi ${publicName} list --fields ${fieldHint(publicName)}\` to choose fields`,
    `Run \`linear-axi ${publicName} list --query "<text>"\` to search`,
  ];
  if (page.cursor) {
    help.push(`Run \`${continuationCommand(`linear-axi ${publicName} list`, parsed, LIST_CONTINUATION_FLAGS, page.cursor)}\` to continue`);
  }
  return renderToon({
    count: page.count,
    ...(page.cursor ? { cursor: page.cursor } : {}),
    [publicName]: listValue,
    help,
  });
}

async function projectCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("projects", ["list", "save"]);
  if (!subcommand || subcommand === "list") return aliasListCommand("projects", rest, runtime);
  if (subcommand === "save") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: 'projects save --name "Roadmap" --team ENG' });
    if (parsed.help) return projectSaveHelp();
    const toolArgs = collectKnownArgs(parsed, ["id", "name", "team", "teamId", "summary", "description", "state", "status", "lead", "startDate", "targetDate"]);
    if (!toolArgs.id && (!toolArgs.name || !(toolArgs.team ?? toolArgs.teamId))) {
      throw usage("creating a project requires --name and --team", [
        'Run `linear-axi projects save --name "Roadmap" --team "<team>"`',
        "Run `linear-axi teams list --fields id,name,key` to choose a team",
      ]);
    }
    const result = toolArgs.id
      ? await callAvailableTool(runtime, ["update_project", "save_project"], (toolName) => projectSaveToolArgs(toolName, toolArgs))
      : await callAvailableTool(runtime, ["create_project", "save_project"], (toolName) => projectSaveToolArgs(toolName, toolArgs));
    const project = mutationData(result, [
      'Run `linear-axi projects save --name "Roadmap" --team "<team>"`',
      "Run `linear-axi teams list --fields id,name,key` to choose a team",
    ]);
    return renderToon({
      project: compactProjectMutation(project),
      help: [
        `Run \`linear-axi projects list --query ${formatCommandArg(project.name ?? "<name>")} --full\` to verify details`,
        `Run \`linear-axi issues save --title "Task" --team "<team>" --project ${formatCommandArg(project.name ?? "<project>")}\` to add an issue`,
      ],
    });
  }
  throw usage(`unknown projects command: ${subcommand}`, [
    "Run `linear-axi projects list`",
    'Run `linear-axi projects save --name "Roadmap" --team "<team>"`',
  ]);
}

async function documentCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("documents", ["list", "view", "save"]);
  if (!subcommand || subcommand === "list") return aliasListCommand("documents", rest, runtime);
  if (subcommand === "view") {
    const parsed = parseFlags(rest, { boolean: ["help", "full"], example: "documents view <id>" });
    if (parsed.help) return documentViewHelp();
    const id = parsed.positionals[0] ?? parsed.id;
    if (!id) throw usage("document id is required", ["Run `linear-axi documents view <id>`"]);
    const detail = await getDocumentDetail(id, runtime);
    if (!detail) return renderToon({ documents: `0 documents found for ${id}` });
    if (parsed.full) return renderToon({ document: detail });
    const compact = compactDocumentDetail(detail, id);
    return renderToon({
      document: compact.document,
      ...(compact.truncated ? { help: [`Run \`linear-axi documents view ${id} --full\` to show the complete document`] } : {}),
    });
  }
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
    const document = mutationData(result, [
      'Run `linear-axi documents save --title "Spec" --team "<team>" --content-file spec.md`',
      "Run `linear-axi documents view <id>` to read a document",
    ]);
    return renderToon({
      document: compactDocumentMutation(document),
      help: [`Run \`linear-axi documents view ${document.id ?? "<id>"}\` to verify details`],
    });
  }
  throw usage(`unknown documents command: ${subcommand}`, ["Run `linear-axi documents list`", "Run `linear-axi documents view <id>`", "Run `linear-axi documents save --title \"Spec\" --team ENG`"]);
}

async function commentCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("comments", ["list", "save"]);
  if (!subcommand || subcommand === "list") {
    const parsed = parseFlags(rest, { boolean: ["help", "full"], example: "comments list --issue LIN-123" });
    if (parsed.help) return commentListHelp();
    rejectUnsupportedCommentFlags(parsed);
    if (!parsed.issue) {
      throw usage("comments list requires --issue", ["Run `linear-axi comments list --issue LIN-123`"]);
    }
    const toolArgs = { issueId: parsed.issue };
    toolArgs.limit = Number(parsed.limit ?? DEFAULT_LIMIT);
    if (parsed.cursor) toolArgs.cursor = parsed.cursor;
    if (parsed.orderBy) toolArgs.orderBy = parsed.orderBy;
    const result = await runtime.client.callTool("list_comments", toolArgs);
    const data = extractData(result);
    const rows = parsed.full ? data : compactComments(data);
    const rowCount = asArray(data).length;
    const page = paginationInfo(data, rowCount);
    const commentsValue = Array.isArray(rows) && rows.length === 0 ? `0 comments found for ${parsed.issue}` : rows;
    const help = [`Run \`linear-axi comments save --issue ${parsed.issue} --body "..."\` to add a comment`];
    if (!parsed.full && Array.isArray(rows) && rows.some((comment) => comment.truncated)) {
      help.push(`Run \`linear-axi comments list --issue ${formatCommandArg(parsed.issue)} --full\` to show complete comment bodies`);
    }
    if (page.cursor) {
      help.push(`Run \`${continuationCommand("linear-axi comments list", parsed, COMMENT_CONTINUATION_FLAGS, page.cursor)}\` to continue`);
    }
    return renderToon({
      count: page.count,
      ...(page.cursor ? { cursor: page.cursor } : {}),
      comments: parsed.full ? commentsValue : commentsValue.map?.(({ truncated, ...comment }) => comment) ?? commentsValue,
      help,
    });
  }
  if (subcommand === "save") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: 'comments save --issue LIN-123 --body "Ready"' });
    if (parsed.help) return commentSaveHelp();
    rejectUnsupportedCommentFlags(parsed);
    if (parsed.id) {
      throw usage("comments save supports issue comments only", ['Run `linear-axi comments save --issue LIN-123 --body "Ready"`']);
    }
    if (!parsed.issue) {
      throw usage("comments save requires --issue", ['Run `linear-axi comments save --issue LIN-123 --body "Ready"`']);
    }
    const toolArgs = { issueId: parsed.issue };
    toolArgs.body = parsed.body ?? (parsed["body-file"] ? await readTextFlag(parsed["body-file"], runtime.cwd) : undefined);
    if (!toolArgs.body) {
      throw usage("--body or --body-file is required", ['Run `linear-axi comments save --issue LIN-123 --body "Ready"`']);
    }
    const result = await runtime.client.callTool("save_comment", toolArgs);
    return renderToon({ comment: extractData(result) });
  }
  throw usage(`unknown comments command: ${subcommand}`, ["Run `linear-axi comments list --issue LIN-123`", "Run `linear-axi comments save --issue LIN-123 --body \"...\"`"]);
}

async function milestoneCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("milestones", ["list", "view", "save"]);
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
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("cycles", ["list"]);
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
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("statuses", ["list"]);
  if (!subcommand || subcommand === "list") {
    const parsed = parseFlags(rest, { boolean: ["help", "full", "includeArchived"], example: "statuses list --team ENG" });
    if (parsed.help) return statusListHelp();
    const team = parsed.teamId ?? parsed.team;
    if (!team) throw usage("--team is required", ["Run `linear-axi statuses list --team <team>`"]);
    const result = await callAvailableTool(runtime, ["list_issue_statuses"], collectKnownArgs(parsed, ["team", "teamId", "type", "project", "initiative", "user", "limit", "cursor", "orderBy", "createdAt", "updatedAt", "includeArchived"]));
    const data = extractData(result);
    const rows = parsed.full ? data : compactRows("statuses", data);
    const rowCount = asArray(data).length;
    const page = paginationInfo(data, rowCount);
    const statusesValue = Array.isArray(rows) && rows.length === 0 ? `0 statuses found for ${team}` : rows;
    const help = [`Run \`linear-axi statuses list --team ${formatCommandArg(team)} --full\` to show the full response`];
    if (page.cursor) {
      help.push(`Run \`${continuationCommand("linear-axi statuses list", parsed, STATUS_CONTINUATION_FLAGS, page.cursor)}\` to continue`);
    }
    return renderToon({
      count: page.count,
      ...(page.cursor ? { cursor: page.cursor } : {}),
      statuses: statusesValue,
      help,
    });
  }
  if (subcommand === "save") {
    return removedStatusCommand("save");
  }
  if (subcommand === "delete") {
    return removedStatusCommand("delete");
  }
  throw usage(`unknown statuses command: ${subcommand}`, ["Run `linear-axi statuses list --team <team>`"]);
}

function removedResourceCommand(command) {
  throw usage(`${command} is not supported by the default Linear MCP server`, [
    "Run `linear-axi issues list`",
    "Run `linear-axi projects list`",
    "Run `linear-axi teams list`",
    "Run `linear-axi statuses list --team <team>`",
  ]);
}

function removedStatusCommand(subcommand) {
  throw usage(`statuses ${subcommand} is not supported by the default Linear MCP server`, [
    "Run `linear-axi statuses list --team <team>`",
    "Run `linear-axi issues save --id <id> --state <state>`",
  ]);
}

async function authCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("auth", ["login", "finish"]);
  if (subcommand === "login") {
    const parsed = parseFlags(rest, { boolean: ["help", "manual"], example: "auth login" });
    if (parsed.help) return authLoginHelp();
    try {
      await runtime.client.listTools();
      return renderToon({ auth: "Linear MCP OAuth already authorized" });
    } catch (error) {
      if (error.authorizationUrl) {
        if (parsed.manual) {
          return renderToon({
            auth: "Linear MCP OAuth authorization required",
            url: error.authorizationUrl,
            help: ["Open the URL, copy the code, then run `linear-axi auth finish --code <code>`"],
          });
        }

        return completeLoginWithCallback(error.authorizationUrl, runtime, parsed);
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

async function completeLoginWithCallback(authorizationUrl, runtime, parsed) {
  const timeoutMs = Number(parsed.timeout ?? 300000);
  const callbackUrl = new URL("http://127.0.0.1:14566/oauth/callback");
  const expectedState = new URL(authorizationUrl).searchParams.get("state");
  if (!expectedState) {
    throw usage("OAuth authorization URL did not include state", ["Run `linear-axi auth login --manual`"]);
  }
  const server = await startOAuthCallbackServer(callbackUrl, timeoutMs, expectedState);

  runtime.stdout?.write?.(renderToon({
    auth: "Linear MCP OAuth authorization required",
    url: authorizationUrl,
    callback: callbackUrl.toString(),
    help: [
      "Open the URL in a browser to finish automatically",
      "If callback capture fails, rerun `linear-axi auth login --manual`",
    ],
  }));

  try {
    const code = await server.code;
    await runtime.client.finishAuth(code);
    return renderToon({ auth: "Linear MCP OAuth authorized" });
  } finally {
    await server.close();
  }
}

async function startOAuthCallbackServer(callbackUrl, timeoutMs, expectedState) {
  if (callbackUrl.hostname !== "127.0.0.1" && callbackUrl.hostname !== "localhost") {
    throw usage("OAuth callback must use localhost or 127.0.0.1", ["Run `linear-axi auth login --manual`"]);
  }

  let timeout;
  let settled = false;
  let resolveCode;
  let rejectCode;
  const code = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url, callbackUrl.origin);
    if (requestUrl.pathname !== callbackUrl.pathname) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found.\n");
      return;
    }

    const error = requestUrl.searchParams.get("error");
    const authCode = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");
    if (state !== expectedState) {
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("OAuth state did not match. You can close this tab.\n");
      return;
    }
    if (error) {
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("Linear authorization failed. You can close this tab.\n");
      finish(new Error(`Linear OAuth error: ${error}`));
      return;
    }
    if (!authCode) {
      response.writeHead(400, { "content-type": "text/plain" });
      response.end("Missing OAuth code. You can close this tab.\n");
      finish(new Error("Linear OAuth callback did not include a code"));
      return;
    }

    response.writeHead(200, { "content-type": "text/plain" });
    response.end("Linear authorization captured. You can close this tab.\n");
    finish(null, authCode);
  });

  function finish(error, authCode) {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    if (error) rejectCode(error);
    else resolveCode(authCode);
  }

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(callbackUrl.port || 80), callbackUrl.hostname, resolve);
  });

  timeout = setTimeout(() => {
    finish(new Error("Timed out waiting for Linear OAuth callback"));
  }, timeoutMs);

  return {
    code,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function getIssueDetail(id, runtime) {
  try {
    const detailed = await callAvailableTool(runtime, ["get_issue"], { id });
    return extractData(detailed);
  } catch (error) {
    if (!isUnknownToolError(error)) throw error;
  }

  const listed = await runtime.client.callTool("list_issues", { query: id, limit: 10 });
  const rawMatches = asArray(extractData(listed)).filter((issue) => issue.id === id || issue.identifier === id);
  if (rawMatches.length === 0) return null;
  return rawMatches[0];
}

async function callAvailableTool(runtime, candidates, args) {
  const tools = typeof runtime.client.listTools === "function" ? await runtime.client.listTools() : [];
  const names = new Set(tools.map((tool) => tool.name));
  if (names.size > 0 && !candidates.some((candidate) => names.has(candidate))) {
    throw new ToolUnavailableError(candidates);
  }
  const preferred = candidates.find((candidate) => names.has(candidate)) ?? candidates[0];
  const argsFor = typeof args === "function" ? args : () => args;
  try {
    return await runtime.client.callTool(preferred, argsFor(preferred));
  } catch (error) {
    if (!isUnknownToolError(error)) throw error;
    for (const candidate of candidates) {
      if (candidate === preferred) continue;
      try {
        return await runtime.client.callTool(candidate, argsFor(candidate));
      } catch (candidateError) {
        if (!isUnknownToolError(candidateError)) throw candidateError;
      }
    }
    throw error;
  }
}

function projectSaveToolArgs(toolName, args) {
  if (toolName !== "save_project") return args;
  const { team, teamId, ...projectArgs } = args;
  const teamRef = teamId ?? team;
  if (teamRef === undefined) return projectArgs;
  return {
    ...projectArgs,
    [projectArgs.id ? "addTeams" : "setTeams"]: [teamRef],
  };
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

function parseFields(fields) {
  return fields.split(",").map((field) => field.trim()).filter(Boolean);
}

function fieldHint(publicName) {
  if (publicName === "issues") return "id,title,state,assignee";
  if (publicName === "documents") return "id,title,updatedAt";
  if (publicName === "projects") return "id,name,status";
  if (publicName === "teams") return "id,name,key";
  if (publicName === "users") return "id,name,email";
  return "id,name,state";
}

function selectFields(items, fields) {
  return items.map((item) => {
    const selected = {};
    for (const field of fields) {
      selected[field] = fieldValue(item, field);
    }
    return selected;
  });
}

function fieldValue(item, field) {
  const value = field.split(".").reduce((current, part) => current?.[part], item);
  if (value === undefined) return "";
  if (value === null) return null;
  if (typeof value === "object") {
    return value.name ?? value.displayName ?? value.identifier ?? value.id ?? JSON.stringify(value);
  }
  return value;
}

const LIST_CONTINUATION_FLAGS = [
  "assignee",
  "createdAt",
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
  "state",
  "team",
  "teamId",
  "updatedAt",
  "includeArchived",
  "includeMembers",
  "includeMilestones",
  "includeStages",
  "includeTeams",
  "fields",
  "full",
];

const STATUS_CONTINUATION_FLAGS = [
  "team",
  "teamId",
  "type",
  "project",
  "initiative",
  "user",
  "limit",
  "orderBy",
  "createdAt",
  "updatedAt",
  "includeArchived",
  "full",
];

const COMMENT_CONTINUATION_FLAGS = [
  "issue",
  "limit",
  "orderBy",
  "full",
];

function continuationCommand(baseCommand, parsed, flagNames, cursor) {
  const parts = [baseCommand];
  for (const name of flagNames) {
    if (parsed[name] === undefined) continue;
    appendFlag(parts, name, parsed[name]);
  }
  appendFlag(parts, "cursor", cursor);
  return parts.join(" ");
}

function appendFlag(parts, name, value) {
  if (value === true) {
    parts.push(`--${name}`);
    return;
  }
  if (value === false) {
    parts.push(`--${name}=false`);
    return;
  }
  parts.push(`--${name}`, formatCommandArg(value));
}

function formatCommandArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function paginationInfo(data, rowCount) {
  const total = data?.totalCount ?? data?.total ?? data?.pageInfo?.totalCount;
  const hasNextPageValue = data?.hasNextPage ?? data?.pageInfo?.hasNextPage;
  const cursor = data?.cursor ?? data?.nextCursor ?? data?.pageInfo?.endCursor;
  const hasCursor = cursor !== undefined && cursor !== null && cursor !== "";
  const hasNextPage = hasNextPageValue === undefined ? hasCursor : Boolean(hasNextPageValue);
  if (typeof total === "number") {
    return {
      count: `${rowCount} of ${total} total`,
      cursor: hasNextPage ? cursor : undefined,
    };
  }
  return {
    count: hasNextPage ? `${rowCount} returned, more available` : `${rowCount} returned`,
    cursor: hasNextPage ? cursor : undefined,
  };
}

function compactComments(data) {
  return asArray(data).map((comment) => {
    const body = formattedPreview(comment.body ?? "", 120);
    return {
      id: comment.id ?? "",
      author: comment.user?.name ?? comment.author?.name ?? "",
      created: comment.createdAt ?? "",
      body: body.text,
      truncated: body.truncated,
    };
  });
}

function compactIssues(data) {
  return asArray(data).map((issue) => ({
    id: issue.identifier ?? issue.id ?? "",
    title: issue.title ?? "",
    state: issue.state?.name ?? issue.state ?? "",
    assignee: issue.assignee?.name ?? issue.assignee?.displayName ?? issue.assignee ?? "",
  }));
}

function compactIssueDetail(issue) {
  const description = String(issue.description ?? issue.body ?? "");
  const preview = truncate(description, 1000);
  return {
    truncated: preview.truncated,
    issue: {
      id: issue.identifier ?? issue.id ?? "",
      title: issue.title ?? "",
      state: issue.state?.name ?? issue.status ?? issue.state ?? "",
      assignee: issue.assignee?.name ?? issue.assignee?.displayName ?? issue.assignee ?? "",
      description: preview.truncated
        ? `${preview.text}... (truncated, ${description.length} chars total)`
        : description,
      url: issue.url ?? "",
    },
  };
}

function compactIssueMutation(issue) {
  return {
    id: issue.identifier ?? issue.id ?? "",
    title: issue.title ?? "",
    state: issue.state?.name ?? issue.status ?? issue.state ?? "",
    project: issue.project?.name ?? issue.project ?? "",
    team: issue.team?.name ?? issue.team ?? "",
    url: issue.url ?? "",
  };
}

function compactProjectMutation(project) {
  return {
    id: project.id ?? "",
    name: project.name ?? "",
    status: project.status?.name ?? project.state?.name ?? project.status ?? project.state ?? "",
    team: project.team?.name ?? project.teams?.[0]?.name ?? project.team ?? "",
    url: project.url ?? "",
  };
}

function compactDocumentMutation(document) {
  return {
    id: document.id ?? "",
    title: document.title ?? document.name ?? "",
    team: document.team?.name ?? document.team ?? "",
    project: document.project?.name ?? document.project ?? "",
    url: document.url ?? "",
  };
}

function compactDocumentDetail(document, id) {
  const content = rewriteMcpHints(String(document.content ?? document.body ?? ""), id);
  const preview = formattedPreview(content, 1200);
  return {
    truncated: preview.truncated,
    document: {
      id: document.id ?? id ?? "",
      title: document.title ?? document.name ?? "",
      content: preview.text,
      team: document.team?.name ?? document.team ?? "",
      project: document.project?.name ?? document.project ?? "",
      url: document.url ?? "",
    },
  };
}

async function getDocumentDetail(id, runtime) {
  try {
    const detailed = await callAvailableTool(runtime, ["get_document"], { id });
    return sanitizeDocument(extractData(detailed), id);
  } catch (error) {
    if (!isUnknownToolError(error)) throw error;
  }

  const listed = await runtime.client.callTool("list_documents", { query: id, limit: 10 });
  const rawMatches = asArray(extractData(listed)).filter((document) => document.id === id || document.slugId === id);
  if (rawMatches.length === 0) return null;
  return sanitizeDocument(rawMatches[0], id);
}

function sanitizeDocument(document, id) {
  if (!document || typeof document !== "object") return document;
  return {
    ...document,
    content: document.content === undefined ? document.content : rewriteMcpHints(String(document.content), id ?? document.id),
  };
}

function mutationData(result, help) {
  const data = extractData(result);
  if (data && typeof data === "object" && Object.keys(data).length === 1 && typeof data.text === "string") {
    throw new AxiError("operational", data.text, help);
  }
  return data;
}

function formattedPreview(value, limit) {
  const text = String(value ?? "");
  const preview = truncate(text, limit);
  if (!preview.truncated) return { text, truncated: false };
  return {
    text: `${preview.text}... (truncated, ${text.length} chars total)`,
    truncated: true,
  };
}

function rewriteMcpHints(text, id) {
  const replacement = id ? `run \`linear-axi documents view ${id} --full\`` : "run `linear-axi documents view <id> --full`";
  return text.replace(/use `get_document`/g, replacement);
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
  for (const key of ["issues", "projects", "teams", "users", "documents", "comments", "milestones", "cycles", "statuses", "labels", "nodes", "items", "data"]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  if (data && typeof data === "object") return [data];
  return [];
}

function rejectUnsupportedCommentFlags(parsed) {
  const unsupported = ["issueId", "project", "projectId", "initiative", "initiativeId", "document", "documentId", "milestone", "milestoneId", "parentId"]
    .find((name) => parsed[name] !== undefined);
  if (unsupported) {
    throw usage(`--${unsupported} is not supported for comments`, [
      "Run `linear-axi comments list --issue LIN-123`",
      'Run `linear-axi comments save --issue LIN-123 --body "Ready"`',
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
  if (["includeArchived", "includeMembers", "includeMilestones", "includeStages", "includeTeams"].includes(name)) return value === true || value === "true";
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
  if (error?.authorizationUrl) {
    return "Linear MCP OAuth authorization required";
  }
  const message = error && typeof error.message === "string" ? error.message : String(error);
  if (/unauthorized|401|invalid_token|access token/i.test(message)) {
    return "Linear MCP authentication failed";
  }
  return message;
}

function isAuthRequiredError(error) {
  return Boolean(error?.authorizationUrl);
}

function topHelp() {
  return `usage: linear-axi <command>
commands[11]:
  auth, issues, projects, teams, users, comments, documents, milestones, cycles, statuses, labels
examples:
  linear-axi
  linear-axi auth login
  linear-axi issues list --assignee me --limit 25
  linear-axi projects save --name "Roadmap" --team ENG
  linear-axi documents view <id>
  linear-axi issues save --id LIN-123 --state Done
  linear-axi comments save --issue LIN-123 --body "Ready for review."
env[4]:
  LINEAR_AXI_MCP_URL, LINEAR_AXI_MCP_TOKEN, LINEAR_MCP_TOKEN, LINEAR_AXI_AUTH_FILE
`;
}

function groupHelp(name, subcommands) {
  const examples = {
    issues: [
      "linear-axi issues list --assignee me --limit 25",
      "linear-axi issues view LIN-123",
      'linear-axi issues save --title "Fix auth" --team ENG',
    ],
    projects: [
      "linear-axi projects list --limit 25",
      'linear-axi projects save --name "Roadmap" --team ENG',
      'linear-axi issues save --title "Task" --team ENG --project "Roadmap"',
    ],
    documents: [
      "linear-axi documents list --limit 25",
      "linear-axi documents view <id>",
      'linear-axi documents save --title "Spec" --team ENG --content-file spec.md',
    ],
    comments: [
      "linear-axi comments list --issue LIN-123",
      'linear-axi comments save --issue LIN-123 --body "Ready for review."',
    ],
    auth: [
      "linear-axi auth login",
      "linear-axi auth login --manual",
      "linear-axi auth finish --code <code>",
    ],
    milestones: [
      'linear-axi milestones list --project "Roadmap"',
      'linear-axi milestones view --project "Roadmap" "Beta"',
      'linear-axi milestones save --project "Roadmap" --name "Beta"',
    ],
    cycles: ["linear-axi cycles list --team ENG --type current"],
    statuses: ["linear-axi statuses list --team ENG"],
  };
  return `usage: linear-axi ${name} <subcommand>
subcommands[${subcommands.length}]: ${subcommands.join(", ")}
examples:
${(examples[name] ?? [`linear-axi ${name} list`]).map((example) => `  ${example}`).join("\n")}
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
  --fields <comma-separated-fields>
examples:
  linear-axi ${alias} list --limit 25
  linear-axi ${alias} list --fields ${fieldHint(alias)}
  linear-axi ${alias} list --query "auth" --full
`;
}

function commentListHelp() {
  return `usage: linear-axi comments list --issue <id>
flags:
  --limit <n> default ${DEFAULT_LIMIT}
  --orderBy createdAt|updatedAt
examples:
  linear-axi comments list --issue LIN-123
`;
}

function commentSaveHelp() {
  return `usage: linear-axi comments save --issue <id> (--body <text> | --body-file <path>)
examples:
  linear-axi comments save --issue LIN-123 --body "Ready for review."
`;
}

function documentSaveHelp() {
  return `usage: linear-axi documents save (--id <id> | --title <title>) [parent] [--content <markdown> | --content-file <path>]
examples:
  linear-axi documents save --title "Spec" --team ENG --content-file spec.md
  linear-axi documents save --id <id> --content "Updated"
`;
}

function documentViewHelp() {
  return `usage: linear-axi documents view <id> [--full]
examples:
  linear-axi documents view <id>
  linear-axi documents view <id> --full
`;
}

function projectSaveHelp() {
  return `usage: linear-axi projects save (--id <id> | --name <name> --team <team>) [fields]
flags:
  --id <id>
  --name <name>
  --team <team>
  --summary <text>
  --description <markdown>
  --status <status>
  --lead <user>
  --startDate <yyyy-mm-dd>
  --targetDate <yyyy-mm-dd>
examples:
  linear-axi projects save --name "Roadmap" --team ENG
  linear-axi projects save --id <id> --summary "Updated scope"
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
  --project <project>
  --cycle <cycle>
  --label <label> repeatable
  --priority <number>
  --estimate <number>
  --dueDate <yyyy-mm-dd>
  --description <markdown>
  --description-file <path>
examples:
  linear-axi issues save --title "Fix auth" --team ENG
  linear-axi issues save --title "Task" --team ENG --project "Roadmap"
  linear-axi issues save --id LIN-123 --state Done
`;
}

function authLoginHelp() {
  return `usage: linear-axi auth login [--manual] [--timeout <ms>]
flags:
  --manual print the authorization URL and exit so you can paste the code into auth finish
  --timeout <ms> default 300000
examples:
  linear-axi auth login
  linear-axi auth login --manual
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
  };
  return names[name] ?? name;
}
