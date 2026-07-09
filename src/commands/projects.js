import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import { collectKnownArgs, dispatchCommandGroup, rejectIdOnCreate } from "../lib/cli-helpers.js";
import { compactProjectMutation } from "../lib/linear-format.js";
import { callAvailableTool, mutationData } from "../lib/mcp-tools.js";
import { groupHelp, projectCreateHelp, projectUpdateHelp } from "./help.js";
import { aliasListCommand } from "./list-resource.js";
import {
  ensureProjectDoesNotExist,
  ensureProjectExists,
  projectSaveToolArgs,
} from "./shared.js";

const PROJECT_MUTATION_FIELDS = ["id", "name", "team", "teamId", "summary", "description", "state", "status", "lead", "startDate", "targetDate"];
const PROJECT_CREATE_HELP = [
  'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
  "Run `linear-axi teams list --fields id,name,key` to choose a team",
];
const PROJECT_UPDATE_HELP = [
  'Run `linear-axi projects update --id <id> --summary "Updated scope"`',
  'Run `linear-axi projects list --query "Roadmap" --fields id,name,status` to find the project id',
];

export async function projectCommand(args, runtime) {
  return dispatchCommandGroup(args, {
    name: "projects",
    help: () => groupHelp("projects", ["list", "create", "update"]),
    handlers: {
      list: (rest) => aliasListCommand("projects", rest, runtime),
      create: (rest) => createProjectCommand(rest, runtime),
      update: (rest) => updateProjectCommand(rest, runtime),
    },
    unknownHelp: [
      "Run `linear-axi projects list`",
      'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
    ],
  });
}

async function createProjectCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'projects create --name "Roadmap" --team ENG' });
  if (parsed.help) return projectCreateHelp();
  rejectProjectIdOnCreate("create", parsed);
  const toolArgs = projectToolArgs(parsed);
  requireProjectCreateFields(toolArgs);
  await ensureProjectDoesNotExist(toolArgs.name, toolArgs.team ?? toolArgs.teamId, runtime);
  return saveProject(toolArgs, runtime, ["create_project", "save_project"]);
}

async function updateProjectCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'projects update --id <id> --summary "Updated scope"' });
  if (parsed.help) return projectUpdateHelp();
  rejectProjectIdOnCreate("update", parsed);
  const toolArgs = projectToolArgs(parsed);
  requireProjectId(toolArgs);
  await ensureProjectExists(toolArgs.id, runtime);
  return saveProject(toolArgs, runtime, ["update_project", "save_project"]);
}

function rejectProjectIdOnCreate(subcommand, parsed) {
  rejectIdOnCreate(subcommand, "project", [
    'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
    'Run `linear-axi projects update --id <id> --summary "Updated scope"` to edit an existing project',
  ], parsed);
}

function projectToolArgs(parsed) {
  return collectKnownArgs(parsed, PROJECT_MUTATION_FIELDS);
}

function requireProjectCreateFields(toolArgs) {
  if (!toolArgs.name || !(toolArgs.team ?? toolArgs.teamId)) {
    throw usage("creating a project requires --name and --team", PROJECT_CREATE_HELP);
  }
}

function requireProjectId(toolArgs) {
  if (!toolArgs.id) throw usage("updating a project requires --id", PROJECT_UPDATE_HELP);
}

async function saveProject(toolArgs, runtime, toolNames) {
  const result = await callAvailableTool(runtime, toolNames, (toolName) => projectSaveToolArgs(toolName, toolArgs));
  return renderProjectMutation(result);
}

function renderProjectMutation(result) {
  const project = mutationData(result, PROJECT_CREATE_HELP);
  return renderToon({ project: compactProjectMutation(project) });
}
