import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import { collectKnownArgs, continuationCommand, formatCommandArg } from "../lib/cli-helpers.js";
import { compactRows, paginationInfo } from "../lib/linear-format.js";
import { asArray, callAvailableTool, extractData } from "../lib/mcp-tools.js";
import { groupHelp, statusListHelp } from "./help.js";
import { removedStatusCommand, STATUS_CONTINUATION_FLAGS } from "./shared.js";

export async function statusCommand(args, runtime) {
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
