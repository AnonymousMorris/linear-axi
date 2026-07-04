import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import { collectKnownArgs, rejectIdOnCreate } from "../lib/cli-helpers.js";
import { compactRows } from "../lib/linear-format.js";
import { extractData, mutationData } from "../lib/mcp-tools.js";
import { applyRepoProjectDefault } from "../lib/repo-project.js";
import {
  groupHelp,
  milestoneCreateHelp,
  milestoneListHelp,
  milestoneUpdateHelp,
  milestoneViewHelp,
} from "./help.js";
import {
  ensureMilestoneExists,
  removedSaveCommand,
} from "./shared.js";

export async function milestoneCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("milestones", ["list", "view", "create", "update"]);
  if (!subcommand || subcommand === "list") {
    const parsed = parseFlags(rest, { boolean: ["help", "full"], example: 'milestones list --project "Roadmap"' });
    if (parsed.help) return milestoneListHelp();
    const toolArgs = collectKnownArgs(parsed, ["project"]);
    await applyRepoProjectDefault(toolArgs, runtime);
    if (!toolArgs.project) throw usage("--project is required", ['Run `linear-axi milestones list --project "<project>"`']);
    const result = await runtime.client.callTool("list_milestones", { project: toolArgs.project });
    return renderToon({ milestones: parsed.full ? extractData(result) : compactRows("milestones", extractData(result)) });
  }
  if (subcommand === "view") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: 'milestones view --project "Roadmap" "Beta"' });
    if (parsed.help) return milestoneViewHelp();
    const query = parsed.positionals[0] ?? parsed.query;
    const toolArgs = collectKnownArgs(parsed, ["project"]);
    await applyRepoProjectDefault(toolArgs, runtime);
    if (!toolArgs.project || !query) throw usage("--project and milestone query are required", ['Run `linear-axi milestones view --project "<project>" "<milestone>"`']);
    const result = await runtime.client.callTool("get_milestone", { project: toolArgs.project, query });
    return renderToon({ milestone: extractData(result) });
  }
  if (subcommand === "save") {
    return removedSaveCommand("milestones", rest, [
      'Run `linear-axi milestones create --project "<project>" --name "<name>"`',
      'Run `linear-axi milestones update --project "<project>" --id <id> --targetDate <yyyy-mm-dd>`',
    ]);
  }
  if (subcommand === "create" || subcommand === "update") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: `milestones ${subcommand} --project "Roadmap" --name "Beta"` });
    if (parsed.help) return subcommand === "create" ? milestoneCreateHelp() : milestoneUpdateHelp();
    rejectIdOnCreate(subcommand, "milestone", [
      'Run `linear-axi milestones create --project "<project>" --name "<name>"`',
      'Run `linear-axi milestones update --project "<project>" --id <id>` to edit an existing milestone',
    ], parsed);
    const toolArgs = collectKnownArgs(parsed, ["id", "name", "project", "description", "targetDate"]);
    if (subcommand === "create") await applyRepoProjectDefault(toolArgs, runtime);
    if (!toolArgs.project) throw usage("--project is required", ['Run `linear-axi milestones create --project "<project>" --name "<name>"`']);
    if (subcommand === "create" && !toolArgs.name) throw usage("creating a milestone requires --name", ['Run `linear-axi milestones create --project "<project>" --name "<name>"`']);
    if (subcommand === "update" && !toolArgs.id) throw usage("updating a milestone requires --id", ['Run `linear-axi milestones update --project "<project>" --id <id>`']);
    if (subcommand === "update") await ensureMilestoneExists(toolArgs.project, toolArgs.id, runtime);
    const result = await runtime.client.callTool("save_milestone", toolArgs);
    const milestone = mutationData(result, [
      'Run `linear-axi milestones create --project "<project>" --name "<name>"`',
      'Run `linear-axi milestones list --project "<project>"` to verify milestones',
    ]);
    return renderToon({ milestone });
  }
  throw usage(`unknown milestones command: ${subcommand}`, ["Run `linear-axi milestones list --project <project>`"]);
}
