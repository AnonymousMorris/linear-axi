import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import {
  appendContinuationHelp,
  collectKnownArgs,
  dispatchCommandGroup,
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
  LIST_BOOLEAN_FLAGS,
  LIST_TOOL_ARG_FLAGS,
  LIST_CONTINUATION_FLAGS,
  LIST_TOOL_ALIASES,
  PROJECT_SCOPED_LIST_ALIASES,
  pluralName,
} from "./shared.js";

const EMPTY_LIST_HINTS = {
  issues: [
    'Run `linear-axi issues create --title "..." --team "<team>"` to create an issue',
    "Run `linear-axi issues list --state done` to see done issues",
  ],
  projects: ['Run `linear-axi projects create --name "..." --team "<team>"` to create a project'],
  documents: ['Run `linear-axi documents create --title "..." --team "<team>" --content-file <path>` to create a document'],
};

export async function listResourceCommand(alias, args, runtime) {
  const publicName = pluralName(alias);
  return dispatchCommandGroup(args, {
    name: publicName,
    help: () => groupHelp(publicName, ["list"]),
    handlers: {
      list: (rest) => aliasListCommand(alias, rest, runtime),
    },
    unknownHelp: [`Run \`linear-axi ${publicName} list\``],
  });
}

export async function aliasListCommand(alias, args, runtime) {
  const publicName = pluralName(alias);
  const toolNames = LIST_TOOL_ALIASES[alias];
  const parsed = parseFlags(args, { boolean: ["help", ...LIST_BOOLEAN_FLAGS], example: `${publicName} list --limit ${DEFAULT_LIMIT}` });
  if (parsed.help) return listAliasHelp(publicName);
  if (parsed["all-projects"] && !PROJECT_SCOPED_LIST_ALIASES.includes(alias)) {
    throw usage("--all-projects is only supported for issues and documents", [
      "Run `linear-axi issues list --all-projects`",
      "Run `linear-axi documents list --all-projects`",
    ]);
  }
  const toolArgs = collectKnownArgs(parsed, LIST_TOOL_ARG_FLAGS);
  if (!("limit" in toolArgs)) toolArgs.limit = DEFAULT_LIMIT;
  if (PROJECT_SCOPED_LIST_ALIASES.includes(alias)) {
    await applyRepoProjectDefault(toolArgs, runtime, {
      allProjects: Boolean(parsed["all-projects"]),
      allProjectsCommand: `linear-axi ${publicName} list --all-projects`,
      command: `linear-axi ${publicName} list`,
      requireProject: true,
    });
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
  const help = listHints(publicName, rowCount);
  appendContinuationHelp(help, `linear-axi ${publicName} list`, parsed, LIST_CONTINUATION_FLAGS, page.cursor);
  return renderToon({
    count: page.count,
    ...(page.cursor ? { cursor: page.cursor } : {}),
    [publicName]: rows,
    help,
  });
}

function listHints(publicName, rowCount) {
  if (rowCount > 0) return [`Run \`linear-axi ${publicName} list --fields ${fieldHint(publicName)}\` to choose fields`];
  const hints = EMPTY_LIST_HINTS[publicName] ?? [`Run \`linear-axi ${publicName} list --query "<text>"\` to search ${publicName}`];
  return [...hints];
}
