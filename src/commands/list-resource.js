import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import {
  collectKnownArgs,
  continuationCommand,
} from "../lib/cli-helpers.js";
import {
  compactRows,
  fieldHint,
  paginationInfo,
  parseFields,
  selectFields,
} from "../lib/linear-format.js";
import { asArray, callAvailableTool, extractData } from "../lib/mcp-tools.js";
import { applyRepoProjectDefault } from "../lib/repo-project.js";
import { groupHelp, listAliasHelp } from "./help.js";
import {
  DEFAULT_LIMIT,
  LIST_CONTINUATION_FLAGS,
  LIST_TOOL_ALIASES,
  pluralName,
} from "./shared.js";

export async function listResourceCommand(alias, args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp(pluralName(alias), ["list"]);
  if (!subcommand || subcommand === "list") {
    return aliasListCommand(alias, rest, runtime);
  }
  throw usage(`unknown ${pluralName(alias)} command: ${subcommand}`, [
    `Run \`linear-axi ${pluralName(alias)} list\``,
  ]);
}

export async function aliasListCommand(alias, args, runtime) {
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
  if (["issues", "documents"].includes(alias)) {
    await applyRepoProjectDefault(toolArgs, runtime);
  }

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
  const listValue = Array.isArray(rows) && rows.length === 0 ? [] : rows;
  const help = listHints(publicName, rowCount);
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

function listHints(publicName, rowCount) {
  if (rowCount === 0) return emptyListHints(publicName);
  return [`Run \`linear-axi ${publicName} list --fields ${fieldHint(publicName)}\` to choose fields`];
}

function emptyListHints(publicName) {
  if (publicName === "issues") {
    return [
      'Run `linear-axi issues create --title "..." --team "<team>"` to create an issue',
      "Run `linear-axi issues list --state done` to see done issues",
    ];
  }
  if (publicName === "projects") {
    return ['Run `linear-axi projects create --name "..." --team "<team>"` to create a project'];
  }
  if (publicName === "documents") {
    return ['Run `linear-axi documents create --title "..." --team "<team>" --content-file <path>` to create a document'];
  }
  if (publicName === "comments") {
    return ['Run `linear-axi comments create --issue <id> --body-file <path>` to create a comment'];
  }
  return [`Run \`linear-axi ${publicName} list --query "<text>"\` to search ${publicName}`];
}
