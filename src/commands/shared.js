import { basename, resolve } from "node:path";
import { AxiError, usage } from "../args.js";
import { renderToon } from "../format.js";
import { formatCommandArg, TOOL_BOOLEAN_FLAGS } from "../lib/cli-helpers.js";
import { sanitizeDocument } from "../lib/linear-format.js";
import { asArray, callAvailableTool, extractData, hasTool, isUnknownToolError, mutationData } from "../lib/mcp-tools.js";
import { projectMatches } from "../lib/project-match.js";
import { findGitRoot } from "../lib/repo-project.js";

export const DEFAULT_LIMIT = 50;

export const LIST_TOOL_ALIASES = {
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

export const PROJECT_SCOPED_LIST_ALIASES = ["issues", "documents"];

export const LIST_BOOLEAN_FLAGS = [
  "full",
  "all-projects",
  ...TOOL_BOOLEAN_FLAGS,
];

export const LIST_TOOL_ARG_FLAGS = [
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
  ...TOOL_BOOLEAN_FLAGS,
];

export const LIST_CONTINUATION_FLAGS = [
  ...LIST_TOOL_ARG_FLAGS.filter((name) => name !== "cursor"),
  "fields",
  "full",
  "all-projects",
];

export async function getIssueDetail(id, runtime) {
  return getDetailWithListFallback(runtime, {
    detailTool: "get_issue",
    detailArgs: { id },
    listTool: "list_issues",
    listArgs: { query: id, limit: 10 },
    identityFields: ["identifier", "id", "title"],
    matches: (issue) => issue.id === id || issue.identifier === id,
  });
}

export async function ensureIssueExists(id, runtime) {
  return requireExistingDetail(getIssueDetail(id, runtime), "issue", id, [
    `Run \`linear-axi issues list --query ${formatCommandArg(id)}\` to search for the issue`,
    "Run `linear-axi issues create --title \"Title\" --team \"<team>\"` to create a new issue",
  ]);
}

export async function ensureIssueDoesNotExist(title, team, runtime) {
  await ensureNamedResourceDoesNotExist(runtime, {
    resource: "issue",
    listTool: "list_issues",
    listArgs: { query: title, team, limit: 10 },
    query: title,
    team,
    name: (issue) => issue.title,
    id: (issue) => issue.identifier ?? issue.id ?? "<id>",
    help: (id) => [
      `Run \`linear-axi issues view ${id}\` to inspect the existing issue`,
      `Run \`linear-axi issues update --id ${id} --state "<state>"\` to edit it`,
      `Run \`linear-axi issues create --title ${formatCommandArg(`${title} copy`)} --team ${formatCommandArg(team)}\` to create a distinct issue`,
    ],
  });
}

export async function getProjectDetail(id, runtime) {
  return getDetailWithListFallback(runtime, {
    detailTool: "get_project",
    detailArgs: { query: id },
    listTool: "list_projects",
    listArgs: { query: id, limit: 10 },
    identityFields: ["id", "slugId", "name"],
    requireKnownDetailTool: true,
    fallbackOnBlankDetail: true,
    detailMatches: (project) => projectMatches(project, id),
    matches: (project) => projectMatches(project, id),
  });
}

export async function ensureProjectExists(id, runtime) {
  return requireExistingDetail(getProjectDetail(id, runtime), "project", id, [
    `Run \`linear-axi projects list --query ${formatCommandArg(id)} --fields id,name,status\` to search for the project`,
    'Run `linear-axi projects create --name "Roadmap" --team "<team>"` to create a new project',
  ]);
}

export async function ensureProjectDoesNotExist(name, team, runtime) {
  await ensureNamedResourceDoesNotExist(runtime, {
    resource: "project",
    listTool: "list_projects",
    listArgs: { query: name, limit: 10 },
    query: name,
    team,
    name: (project) => project.name,
    id: (project) => project.id ?? project.slugId ?? "<id>",
    help: (id) => [
      `Run \`linear-axi projects list --query ${formatCommandArg(name)} --full\` to inspect matching projects`,
      `Run \`linear-axi projects update --id ${id} --summary "Updated scope"\` to edit it`,
      `Run \`linear-axi projects create --name ${formatCommandArg(`${name} copy`)} --team ${formatCommandArg(team)}\` to create a distinct project`,
    ],
  });
}

export function projectSaveToolArgs(toolName, args) {
  if (toolName !== "save_project") return args;
  const { team, teamId, ...projectArgs } = args;
  const teamRef = teamId ?? team;
  if (teamRef === undefined) return projectArgs;
  return {
    ...projectArgs,
    [projectArgs.id ? "addTeams" : "setTeams"]: [teamRef],
  };
}

export async function renderMutation(runtime, options) {
  const result = options.toolNames
    ? await callAvailableTool(runtime, options.toolNames, options.argsForTool ?? options.args)
    : await runtime.client.callTool(options.tool, options.args);
  return renderToon(options.render(mutationData(result, options.help)));
}

export function renderDetailView(options) {
  if (options.full) return renderToon({ [options.resource]: options.detail });
  const compact = options.compact(options.detail);
  return renderToon({
    [options.resource]: compact[options.resource],
    ...(compact.truncated ? { help: [`Run \`${options.fullCommand}\` to show the complete ${options.resource}`] } : {}),
  });
}

export async function getDocumentDetail(id, runtime) {
  return getDetailWithListFallback(runtime, {
    detailTool: "get_document",
    detailArgs: { id },
    listTool: "list_documents",
    listArgs: { query: id, limit: 10 },
    identityFields: ["id", "title", "name"],
    matches: (document) => document.id === id || document.slugId === id,
    transform: (document) => sanitizeDocument(document, id),
  });
}

async function getDetailWithListFallback(runtime, options) {
  if (!options.requireKnownDetailTool || await hasTool(runtime, options.detailTool)) {
    try {
      const detailed = await callAvailableTool(runtime, [options.detailTool], options.detailArgs);
      const data = extractData(detailed);
      if (isEmptyObject(data) || isBlankDetail(data, options.identityFields)) {
        if (!options.fallbackOnBlankDetail || !(await hasTool(runtime, options.listTool))) return null;
      } else if (options.detailMatches && !options.detailMatches(data)) {
        if (!(await hasTool(runtime, options.listTool))) return null;
      } else {
        return detailResult(data, options);
      }
    } catch (error) {
      if (!isUnknownToolError(error)) throw error;
    }
  }

  const listed = await runtime.client.callTool(options.listTool, options.listArgs);
  const match = asArray(extractData(listed)).find(options.matches);
  if (!match) return null;
  return detailResult(match, options);
}

function detailResult(detail, options) {
  return options.transform ? options.transform(detail) : detail;
}

async function ensureNamedResourceDoesNotExist(runtime, options) {
  const listed = await runtime.client.callTool(options.listTool, options.listArgs);
  const match = asArray(extractData(listed)).find((item) => {
    return isSameText(options.name(item), options.query) && belongsToTeam(item, options.team);
  });
  if (!match) return;
  const id = options.id(match);
  const name = options.name(match) ?? options.query;
  throw new AxiError("operational", `${options.resource} already exists: ${id} ${name}`, options.help(id));
}

export async function ensureDocumentExists(id, runtime) {
  return requireExistingDetail(getDocumentDetail(id, runtime), "document", id, [
    `Run \`linear-axi documents list --query ${formatCommandArg(id)} --fields id,title,updatedAt\` to search for the document`,
    'Run `linear-axi documents create --title "Spec" --team "<team>"` to create a new document',
  ]);
}

async function requireExistingDetail(detailPromise, resource, id, help) {
  const detail = await detailPromise;
  if (!detail) throw notFound(resource, id, help);
  return detail;
}

export async function ensureMilestoneExists(project, id, runtime) {
  const result = await runtime.client.callTool("get_milestone", { project, query: id });
  const milestone = extractData(result);
  if (!milestone || isEmptyContainer(milestone)) {
    throw notFound("milestone", id, [
      `Run \`linear-axi milestones list --project ${formatCommandArg(project)}\` to find the milestone id`,
      `Run \`linear-axi milestones create --project ${formatCommandArg(project)} --name "<name>"\` to create a new milestone`,
    ]);
  }
  return milestone;
}

export function rejectUnsupportedCommentFlags(parsed) {
  const unsupported = ["issueId", "project", "projectId", "initiative", "initiativeId", "document", "documentId", "milestone", "milestoneId", "parentId"]
    .find((name) => parsed[name] !== undefined);
  if (unsupported) {
    throw usage(`--${unsupported} is not supported for comments`, [
      "Run `linear-axi comments list --issue LIN-123`",
      'Run `linear-axi comments create --issue LIN-123 --body "Ready"`',
    ]);
  }
}

export function normalizeError(error) {
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

export function notFound(resource, id, help = []) {
  return new AxiError("not_found", `${resource} not found: ${id}`, help);
}

export function mcpErrorMessage(error) {
  if (error?.authorizationUrl) {
    return "Linear MCP OAuth authorization required";
  }
  const message = error && typeof error.message === "string" ? error.message : String(error);
  if (/unauthorized|401|invalid_token|access token/i.test(message)) {
    return "Linear MCP authentication failed";
  }
  return message;
}

export async function workspaceName(cwd) {
  const root = await findGitRoot(cwd);
  return basename(root ?? resolve(cwd));
}

export function pluralName(name) {
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

function isSameText(left, right) {
  return String(left ?? "").trim().toLocaleLowerCase() === String(right ?? "").trim().toLocaleLowerCase();
}

function isEmptyObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

function isEmptyContainer(value) {
  return value && typeof value === "object" && Object.keys(value).length === 0;
}

function isBlankDetail(value, identityFields) {
  if (!identityFields) return false;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return identityFields.every((field) => !hasText(value[field]));
}

function hasText(value) {
  return String(value ?? "").trim() !== "";
}

function belongsToTeam(item, team) {
  if (team === undefined || team === null || team === "") return true;
  const candidates = [
    item.team,
    item.team?.id,
    item.team?.key,
    item.team?.name,
    item.teamId,
    ...(Array.isArray(item.teams) ? item.teams.flatMap((entry) => [entry, entry?.id, entry?.key, entry?.name]) : []),
  ];
  return candidates.some((candidate) => isSameText(candidate, team));
}
