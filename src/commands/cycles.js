import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import { compactRows } from "../lib/linear-format.js";
import { extractData } from "../lib/mcp-tools.js";
import { cycleListHelp, groupHelp } from "./help.js";

export async function cycleCommand(args, runtime) {
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
