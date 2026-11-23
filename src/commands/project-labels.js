import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import { appendContinuationHelp, collectKnownArgs, dispatchCommandGroup, rejectIdOnCreate, requireValue } from "../lib/cli-helpers.js";
import { paginationInfo, parseFields, selectFields } from "../lib/linear-format.js";
import { asArray, callAvailableTool, mutationData } from "../lib/mcp-tools.js";
import { projectLabelHelp } from "./help.js";
import { DEFAULT_LIMIT, renderMutation } from "./shared.js";

const LIST_FIELDS = ["limit", "cursor", "name", "team", "orderBy", "includeArchived", "includeGroups"];
const SAVE_FIELDS = ["id", "name", "description", "color", "teamId", "parent", "isGroup", "groupType"];
const HELP = ["Run `linear-axi projects labels --help` for project label and group commands"];

export async function projectLabelCommand(args, runtime) {
  return dispatchCommandGroup(args, {
    name: "projects labels",
    help: () => projectLabelHelp(),
    handlers: {
      list: (rest) => listProjectLabels(rest, runtime),
      create: (rest) => saveProjectLabel(rest, runtime, false),
      update: (rest) => saveProjectLabel(rest, runtime, true),
    },
    unknownHelp: HELP,
  });
}

async function listProjectLabels(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help", "full", "includeArchived", "includeGroups"] });
  if (parsed.help) return projectLabelHelp("list");
  validateLabelFlags(parsed, [...LIST_FIELDS, "fields", "full"]);
  const toolArgs = collectKnownArgs(parsed, LIST_FIELDS);
  toolArgs.limit ??= DEFAULT_LIMIT;
  const data = mutationData(await callAvailableTool(runtime, ["list_project_labels"], toolArgs), HELP);
  const labels = asArray(data);
  const page = paginationInfo(data, labels.length);
  const help = ["Run `linear-axi projects labels list --includeGroups --full` to inspect groups and label metadata"];
  appendContinuationHelp(help, "linear-axi projects labels list", parsed, [...LIST_FIELDS.filter((key) => key !== "cursor"), "fields", "full"], page.cursor);
  return renderToon({
    count: page.count,
    ...(page.cursor ? { cursor: page.cursor } : {}),
    labels: parsed.full ? data : selectFields(labels, parseFields(parsed.fields ?? "id,name,isGroup,parent,groupType")),
    help,
  });
}

async function saveProjectLabel(args, runtime, update) {
  const action = update ? "update" : "create";
  const parsed = parseFlags(args, { boolean: ["help", "isGroup"] });
  if (parsed.help) return projectLabelHelp(action);
  validateLabelFlags(parsed, SAVE_FIELDS);
  if (!update) rejectIdOnCreate("project label", HELP, parsed);
  const toolArgs = collectKnownArgs(parsed, SAVE_FIELDS);
  requireValue(update ? toolArgs.id?.trim() : toolArgs.name?.trim(), `${update ? "updating" : "creating"} a project label requires --${update ? "id" : "name"}`, HELP);
  if (toolArgs.groupType !== undefined && !["singleSelect", "multiSelect"].includes(toolArgs.groupType)) {
    throw usage("--groupType must be singleSelect or multiSelect", HELP);
  }
  if (toolArgs.groupType !== undefined && toolArgs.isGroup === false) {
    throw usage("--groupType cannot be used with --isGroup=false", HELP);
  }
  return renderMutation(runtime, {
    toolNames: ["save_project_label"],
    args: toolArgs,
    help: HELP,
    render: (label) => ({ label }),
  });
}

function validateLabelFlags(parsed, fields) {
  if (parsed.positionals.length > 0) throw usage("project label commands require named flags", HELP);
  for (const key of Object.keys(parsed)) {
    if (["positionals", "help", ...fields].includes(key)) continue;
    throw usage(`unknown project label flag: --${key}`, HELP);
  }
  for (const key of ["id", "name", "teamId", "parent"]) {
    if (parsed[key] !== undefined && (!parsed[key].trim() || parsed[key].startsWith("--"))) {
      throw usage(`--${key} requires a non-empty value`, HELP);
    }
  }
}
