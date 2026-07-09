import { parseFlags } from "../args.js";
import { renderToon } from "../format.js";
import { dispatchCommandGroup, requireTeam } from "../lib/cli-helpers.js";
import { compactRows } from "../lib/linear-format.js";
import { extractData } from "../lib/mcp-tools.js";
import { cycleListHelp, groupHelp } from "./help.js";

export async function cycleCommand(args, runtime) {
  return dispatchCommandGroup(args, {
    name: "cycles",
    help: () => groupHelp("cycles", ["list"]),
    handlers: {
      list: (rest) => listCyclesCommand(rest, runtime),
    },
    unknownHelp: ["Run `linear-axi cycles list --team <team-id>`"],
  });
}

async function listCyclesCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help", "full"], example: "cycles list --team ENG" });
  if (parsed.help) return cycleListHelp();
  const teamId = requireTeam(parsed, ["Run `linear-axi cycles list --team <team-id>`"]);
  const result = await runtime.client.callTool("list_cycles", { teamId, type: parsed.type });
  return renderToon({ cycles: parsed.full ? extractData(result) : compactRows("cycles", extractData(result)) });
}
