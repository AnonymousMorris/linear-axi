import { parseFlags } from "../args.js";
import { collectKnownArgs, dispatchCommandGroup, rejectIdOnCreate, requireValue } from "../lib/cli-helpers.js";
import { compactProjectMutation } from "../lib/linear-format.js";
import { groupHelp, projectCreateHelp, projectUpdateHelp } from "./help.js";
import { aliasListCommand } from "./list-resource.js";
import {
  ensureProjectDoesNotExist,
  ensureProjectExists,
  projectSaveToolArgs,
  renderMutation,
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
const PROJECT_ID_ON_CREATE_HELP = [
  'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
  'Run `linear-axi projects update --id <id> --summary "Updated scope"` to edit an existing project',
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
  rejectIdOnCreate("project", PROJECT_ID_ON_CREATE_HELP, parsed);
  const toolArgs = collectKnownArgs(parsed, PROJECT_MUTATION_FIELDS);
  requireValue(toolArgs.name && (toolArgs.team ?? toolArgs.teamId), "creating a project requires --name and --team", PROJECT_CREATE_HELP);
  await ensureProjectDoesNotExist(toolArgs.name, toolArgs.team ?? toolArgs.teamId, runtime);
  return saveProject(toolArgs, runtime, ["create_project", "save_project"]);
}

async function updateProjectCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'projects update --id <id> --summary "Updated scope"' });
  if (parsed.help) return projectUpdateHelp();
  const toolArgs = collectKnownArgs(parsed, PROJECT_MUTATION_FIELDS);
  requireValue(toolArgs.id, "updating a project requires --id", PROJECT_UPDATE_HELP);
  await ensureProjectExists(toolArgs.id, runtime);
  return saveProject(toolArgs, runtime, ["update_project", "save_project"]);
}

async function saveProject(toolArgs, runtime, toolNames) {
  return renderMutation(runtime, {
    toolNames,
    argsForTool: (toolName) => projectSaveToolArgs(toolName, toolArgs),
    help: PROJECT_CREATE_HELP,
    render: (project) => ({ project: compactProjectMutation(project) }),
  });
}
