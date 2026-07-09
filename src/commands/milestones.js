import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import { collectKnownArgs, dispatchCommandGroup, rejectIdOnCreate } from "../lib/cli-helpers.js";
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
} from "./shared.js";

const MILESTONE_MUTATION_FIELDS = ["id", "name", "project", "description", "targetDate"];
const MILESTONE_CREATE_HELP = ['Run `linear-axi milestones create --project "<project>" --name "<name>"`'];
const MILESTONE_UPDATE_HELP = ['Run `linear-axi milestones update --project "<project>" --id <id>`'];

export async function milestoneCommand(args, runtime) {
  return dispatchCommandGroup(args, {
    name: "milestones",
    help: () => groupHelp("milestones", ["list", "view", "create", "update"]),
    handlers: {
      list: (rest) => listMilestonesCommand(rest, runtime),
      view: (rest) => viewMilestoneCommand(rest, runtime),
      create: (rest) => createMilestoneCommand(rest, runtime),
      update: (rest) => updateMilestoneCommand(rest, runtime),
    },
    unknownHelp: ["Run `linear-axi milestones list --project <project>`"],
  });
}

async function listMilestonesCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help", "full"], example: 'milestones list --project "Roadmap"' });
  if (parsed.help) return milestoneListHelp();
  const toolArgs = await milestoneProjectArgs(parsed, runtime);
  if (!toolArgs.project) throw usage("--project is required", ['Run `linear-axi milestones list --project "<project>"`']);
  const result = await runtime.client.callTool("list_milestones", { project: toolArgs.project });
  return renderToon({ milestones: parsed.full ? extractData(result) : compactRows("milestones", extractData(result)) });
}

async function viewMilestoneCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'milestones view --project "Roadmap" "Beta"' });
  if (parsed.help) return milestoneViewHelp();
  const query = parsed.positionals[0] ?? parsed.query;
  const toolArgs = await milestoneProjectArgs(parsed, runtime);
  if (!toolArgs.project || !query) throw usage("--project and milestone query are required", ['Run `linear-axi milestones view --project "<project>" "<milestone>"`']);
  const result = await runtime.client.callTool("get_milestone", { project: toolArgs.project, query });
  return renderToon({ milestone: extractData(result) });
}

async function createMilestoneCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'milestones create --project "Roadmap" --name "Beta"' });
  if (parsed.help) return milestoneCreateHelp();
  rejectMilestoneIdOnCreate("create", parsed);
  const toolArgs = await milestoneMutationArgs(parsed, runtime, { applyDefaultProject: true });
  requireMilestoneProject(toolArgs);
  requireMilestoneName(toolArgs);
  return saveMilestone(toolArgs, runtime);
}

async function updateMilestoneCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'milestones update --project "Roadmap" --id <id>' });
  if (parsed.help) return milestoneUpdateHelp();
  rejectMilestoneIdOnCreate("update", parsed);
  const toolArgs = await milestoneMutationArgs(parsed, runtime);
  requireMilestoneProject(toolArgs);
  requireMilestoneId(toolArgs);
  await ensureMilestoneExists(toolArgs.project, toolArgs.id, runtime);
  return saveMilestone(toolArgs, runtime);
}

function rejectMilestoneIdOnCreate(subcommand, parsed) {
  rejectIdOnCreate(subcommand, "milestone", [
    'Run `linear-axi milestones create --project "<project>" --name "<name>"`',
    'Run `linear-axi milestones update --project "<project>" --id <id>` to edit an existing milestone',
  ], parsed);
}

async function milestoneProjectArgs(parsed, runtime) {
  const toolArgs = collectKnownArgs(parsed, ["project"]);
  await applyRepoProjectDefault(toolArgs, runtime, {
    command: "linear-axi milestones list",
    requireProject: true,
  });
  return toolArgs;
}

async function milestoneMutationArgs(parsed, runtime, options = {}) {
  const toolArgs = collectKnownArgs(parsed, MILESTONE_MUTATION_FIELDS);
  if (options.applyDefaultProject) {
    await applyRepoProjectDefault(toolArgs, runtime, {
      command: "linear-axi milestones create",
      requireProject: true,
    });
  }
  return toolArgs;
}

function requireMilestoneProject(toolArgs) {
  if (!toolArgs.project) throw usage("--project is required", MILESTONE_CREATE_HELP);
}

function requireMilestoneName(toolArgs) {
  if (!toolArgs.name) throw usage("creating a milestone requires --name", MILESTONE_CREATE_HELP);
}

function requireMilestoneId(toolArgs) {
  if (!toolArgs.id) throw usage("updating a milestone requires --id", MILESTONE_UPDATE_HELP);
}

async function saveMilestone(toolArgs, runtime) {
  const result = await runtime.client.callTool("save_milestone", toolArgs);
  const milestone = mutationData(result, [
    'Run `linear-axi milestones create --project "<project>" --name "<name>"`',
    'Run `linear-axi milestones list --project "<project>"` to verify milestones',
  ]);
  return renderToon({ milestone });
}
