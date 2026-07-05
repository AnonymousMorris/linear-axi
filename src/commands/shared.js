import { basename, resolve } from "node:path";
import { AxiError, usage } from "../args.js";
import { formatCommandArg } from "../lib/cli-helpers.js";
import { sanitizeDocument } from "../lib/linear-format.js";
import { asArray, callAvailableTool, extractData, isUnknownToolError } from "../lib/mcp-tools.js";
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

export const LIST_CONTINUATION_FLAGS = [
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

export const STATUS_CONTINUATION_FLAGS = [
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

export const COMMENT_CONTINUATION_FLAGS = [
  "issue",
  "limit",
  "orderBy",
  "full",
];

export async function getIssueDetail(id, runtime) {
  try {
    const detailed = await callAvailableTool(runtime, ["get_issue"], { id });
    const data = extractData(detailed);
    return isEmptyObject(data) || isBlankIssueDetail(data) ? null : data;
  } catch (error) {
    if (!isUnknownToolError(error)) throw error;
  }

  const listed = await runtime.client.callTool("list_issues", { query: id, limit: 10 });
  const rawMatches = asArray(extractData(listed)).filter((issue) => issue.id === id || issue.identifier === id);
  if (rawMatches.length === 0) return null;
  return rawMatches[0];
}

export async function ensureIssueExists(id, runtime) {
  const issue = await getIssueDetail(id, runtime);
  if (!issue) {
    throw notFound("issue", id, [
      `Run \`linear-axi issues list --query ${formatCommandArg(id)}\` to search for the issue`,
      "Run `linear-axi issues create --title \"Title\" --team \"<team>\"` to create a new issue",
    ]);
  }
  return issue;
}

export async function ensureIssueDoesNotExist(title, team, runtime) {
  const listed = await runtime.client.callTool("list_issues", { query: title, team, limit: 10 });
  const match = asArray(extractData(listed)).find((issue) => isSameText(issue.title, title) && belongsToTeam(issue, team));
  if (!match) return;
  const id = match.identifier ?? match.id ?? "<id>";
  throw new AxiError("operational", `issue already exists: ${id} ${match.title ?? title}`, [
    `Run \`linear-axi issues view ${id}\` to inspect the existing issue`,
    `Run \`linear-axi issues update --id ${id} --state "<state>"\` to edit it`,
    `Run \`linear-axi issues create --title ${formatCommandArg(`${title} copy`)} --team ${formatCommandArg(team)}\` to create a distinct issue`,
  ]);
}

export async function getProjectDetail(id, runtime) {
  const listed = await runtime.client.callTool("list_projects", { query: id, limit: 10 });
  const matches = asArray(extractData(listed)).filter((project) => project.id === id || project.slugId === id || isSameText(project.name, id));
  return matches[0] ?? null;
}

export async function ensureProjectExists(id, runtime) {
  const project = await getProjectDetail(id, runtime);
  if (!project) {
    throw notFound("project", id, [
      `Run \`linear-axi projects list --query ${formatCommandArg(id)} --fields id,name,status\` to search for the project`,
      'Run `linear-axi projects create --name "Roadmap" --team "<team>"` to create a new project',
    ]);
  }
  return project;
}

export async function ensureProjectDoesNotExist(name, team, runtime) {
  const listed = await runtime.client.callTool("list_projects", { query: name, limit: 10 });
  const match = asArray(extractData(listed)).find((project) => isSameText(project.name, name) && belongsToTeam(project, team));
  if (!match) return;
  const id = match.id ?? match.slugId ?? "<id>";
  throw new AxiError("operational", `project already exists: ${id} ${match.name ?? name}`, [
    `Run \`linear-axi projects list --query ${formatCommandArg(name)} --full\` to inspect matching projects`,
    `Run \`linear-axi projects update --id ${id} --summary "Updated scope"\` to edit it`,
    `Run \`linear-axi projects create --name ${formatCommandArg(`${name} copy`)} --team ${formatCommandArg(team)}\` to create a distinct project`,
  ]);
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

export async function getDocumentDetail(id, runtime) {
  try {
    const detailed = await callAvailableTool(runtime, ["get_document"], { id });
    const data = extractData(detailed);
    return isEmptyObject(data) || isBlankDocumentDetail(data) ? null : sanitizeDocument(data, id);
  } catch (error) {
    if (!isUnknownToolError(error)) throw error;
  }

  const listed = await runtime.client.callTool("list_documents", { query: id, limit: 10 });
  const rawMatches = asArray(extractData(listed)).filter((document) => document.id === id || document.slugId === id);
  if (rawMatches.length === 0) return null;
  return sanitizeDocument(rawMatches[0], id);
}

export async function ensureDocumentExists(id, runtime) {
  const document = await getDocumentDetail(id, runtime);
  if (!document) {
    throw notFound("document", id, [
      `Run \`linear-axi documents list --query ${formatCommandArg(id)} --fields id,title,updatedAt\` to search for the document`,
      'Run `linear-axi documents create --title "Spec" --team "<team>"` to create a new document',
    ]);
  }
  return document;
}

export async function ensureMilestoneExists(project, id, runtime) {
  const result = await runtime.client.callTool("get_milestone", { project, query: id });
  const milestone = extractData(result);
  if (!milestone || (typeof milestone === "object" && Object.keys(milestone).length === 0)) {
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

function isBlankIssueDetail(value) {
  return isBlankDetail(value, ["identifier", "id", "title"]);
}

function isBlankDocumentDetail(value) {
  return isBlankDetail(value, ["id", "title", "name"]);
}

function isBlankDetail(value, identityFields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return identityFields.every((field) => !hasText(value[field]));
}

function hasText(value) {
  return String(value ?? "").trim() !== "";
}

function belongsToTeam(item, team) {
  if (team === undefined || team === null || team === "") return true;
  const expected = String(team).trim().toLocaleLowerCase();
  const candidates = [
    item.team,
    item.team?.id,
    item.team?.key,
    item.team?.name,
    item.teamId,
    ...(Array.isArray(item.teams) ? item.teams.flatMap((entry) => [entry, entry?.id, entry?.key, entry?.name]) : []),
  ];
  return candidates.some((candidate) => String(candidate ?? "").trim().toLocaleLowerCase() === expected);
}
