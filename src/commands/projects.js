import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import { collectKnownArgs, formatCommandArg, rejectIdOnCreate } from "../lib/cli-helpers.js";
import { compactProjectMutation } from "../lib/linear-format.js";
import { callAvailableTool, mutationData } from "../lib/mcp-tools.js";
import { groupHelp, projectCreateHelp, projectUpdateHelp } from "./help.js";
import { aliasListCommand } from "./list-resource.js";
import {
  ensureProjectDoesNotExist,
  ensureProjectExists,
  projectSaveToolArgs,
  removedSaveCommand,
} from "./shared.js";

export async function projectCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("projects", ["list", "create", "update"]);
  if (!subcommand || subcommand === "list") return aliasListCommand("projects", rest, runtime);
  if (subcommand === "save") {
    return removedSaveCommand("projects", rest, [
      'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
      'Run `linear-axi projects update --id <id> --summary "Updated scope"`',
    ]);
  }
  if (subcommand === "create" || subcommand === "update") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: `projects ${subcommand} --name "Roadmap" --team ENG` });
    if (parsed.help) return subcommand === "create" ? projectCreateHelp() : projectUpdateHelp();
    rejectIdOnCreate(subcommand, "project", [
      'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
      'Run `linear-axi projects update --id <id> --summary "Updated scope"` to edit an existing project',
    ], parsed);
    const toolArgs = collectKnownArgs(parsed, ["id", "name", "team", "teamId", "summary", "description", "state", "status", "lead", "startDate", "targetDate"]);
    if (subcommand === "create" && (!toolArgs.name || !(toolArgs.team ?? toolArgs.teamId))) {
      throw usage("creating a project requires --name and --team", [
        'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
        "Run `linear-axi teams list --fields id,name,key` to choose a team",
      ]);
    }
    if (subcommand === "update" && !toolArgs.id) {
      throw usage("updating a project requires --id", [
        'Run `linear-axi projects update --id <id> --summary "Updated scope"`',
        'Run `linear-axi projects list --query "Roadmap" --fields id,name,status` to find the project id',
      ]);
    }
    if (subcommand === "create") await ensureProjectDoesNotExist(toolArgs.name, toolArgs.team ?? toolArgs.teamId, runtime);
    else await ensureProjectExists(toolArgs.id, runtime);
    const result = subcommand === "update"
      ? await callAvailableTool(runtime, ["update_project", "save_project"], (toolName) => projectSaveToolArgs(toolName, toolArgs))
      : await callAvailableTool(runtime, ["create_project", "save_project"], (toolName) => projectSaveToolArgs(toolName, toolArgs));
    const project = mutationData(result, [
      'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
      "Run `linear-axi teams list --fields id,name,key` to choose a team",
    ]);
    return renderToon({
      project: compactProjectMutation(project),
      help: [
        `Run \`linear-axi projects list --query ${formatCommandArg(project.name ?? "<name>")} --full\` to verify details`,
        `Run \`linear-axi issues create --title "Task" --team "<team>" --project ${formatCommandArg(project.name ?? "<project>")}\` to add an issue`,
      ],
    });
  }
  throw usage(`unknown projects command: ${subcommand}`, [
    "Run `linear-axi projects list`",
    'Run `linear-axi projects create --name "Roadmap" --team "<team>"`',
  ]);
}
