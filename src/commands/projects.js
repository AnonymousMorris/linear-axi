import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import { collectKnownArgs, rejectIdOnCreate } from "../lib/cli-helpers.js";
import { compactProjectMutation } from "../lib/linear-format.js";
import { callAvailableTool, mutationData } from "../lib/mcp-tools.js";
import { groupHelp, projectCreateHelp, projectUpdateHelp } from "./help.js";
import { aliasListCommand } from "./list-resource.js";
import {
  ensureProjectDoesNotExist,
  ensureProjectExists,
  projectSaveToolArgs,
} from "./shared.js";

export async function projectCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("projects", ["list", "create", "update"]);

  switch (subcommand ?? "list") {
    case "list":
      return aliasListCommand("projects", rest, runtime);
    case "create":
      return createProjectCommand(rest, runtime);
    case "update":
      return updateProjectCommand(rest, runtime);
    default:
      throw usage(`unknown projects command: ${subcommand}`, [
        "Run `linear-axi projects list`",
        'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
      ]);
  }
}

async function createProjectCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'projects create --name "Roadmap" --team ENG' });
  if (parsed.help) return projectCreateHelp();
  rejectProjectIdOnCreate("create", parsed);
  const toolArgs = projectToolArgs(parsed);
  if (!toolArgs.name || !(toolArgs.team ?? toolArgs.teamId)) {
    throw usage("creating a project requires --name and --team", [
      'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
      "Run `linear-axi teams list --fields id,name,key` to choose a team",
    ]);
  }
  await ensureProjectDoesNotExist(toolArgs.name, toolArgs.team ?? toolArgs.teamId, runtime);
  const result = await callAvailableTool(runtime, ["create_project", "save_project"], (toolName) => projectSaveToolArgs(toolName, toolArgs));
  return renderProjectMutation(result);
}

async function updateProjectCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'projects update --id <id> --summary "Updated scope"' });
  if (parsed.help) return projectUpdateHelp();
  rejectProjectIdOnCreate("update", parsed);
  const toolArgs = projectToolArgs(parsed);
  if (!toolArgs.id) {
    throw usage("updating a project requires --id", [
      'Run `linear-axi projects update --id <id> --summary "Updated scope"`',
      'Run `linear-axi projects list --query "Roadmap" --fields id,name,status` to find the project id',
    ]);
  }
  await ensureProjectExists(toolArgs.id, runtime);
  const result = await callAvailableTool(runtime, ["update_project", "save_project"], (toolName) => projectSaveToolArgs(toolName, toolArgs));
  return renderProjectMutation(result);
}

function rejectProjectIdOnCreate(subcommand, parsed) {
  rejectIdOnCreate(subcommand, "project", [
    'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
    'Run `linear-axi projects update --id <id> --summary "Updated scope"` to edit an existing project',
  ], parsed);
}

function projectToolArgs(parsed) {
  return collectKnownArgs(parsed, ["id", "name", "team", "teamId", "summary", "description", "state", "status", "lead", "startDate", "targetDate"]);
}

function renderProjectMutation(result) {
  const project = mutationData(result, [
    'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
    "Run `linear-axi teams list --fields id,name,key` to choose a team",
  ]);
  return renderToon({ project: compactProjectMutation(project) });
}
