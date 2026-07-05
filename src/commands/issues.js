import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import {
  collectKnownArgs,
  formatCommandArg,
  readTextFlag,
  rejectIdOnCreate,
} from "../lib/cli-helpers.js";
import {
  compactIssueDetail,
  compactIssueMutation,
} from "../lib/linear-format.js";
import { mutationData } from "../lib/mcp-tools.js";
import { applyRepoProjectDefault } from "../lib/repo-project.js";
import {
  groupHelp,
  issueCreateHelp,
  issueUpdateHelp,
  issueViewHelp,
} from "./help.js";
import { aliasListCommand } from "./list-resource.js";
import {
  ensureIssueDoesNotExist,
  ensureIssueExists,
  getIssueDetail,
  notFound,
} from "./shared.js";

export async function issueCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("issues", ["list", "view", "create", "update"]);

  switch (subcommand ?? "list") {
    case "list":
      return aliasListCommand("issues", rest, runtime);
    case "view":
      return viewIssueCommand(rest, runtime);
    case "create":
      return createIssueCommand(rest, runtime);
    case "update":
      return updateIssueCommand(rest, runtime);
    default:
      throw usage(`unknown issues command: ${subcommand}`, [
        "Run `linear-axi issues list`",
        "Run `linear-axi issues view <id>`",
        "Run `linear-axi issues update --id <id> --state done`",
      ]);
  }
}

async function viewIssueCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help", "full"], example: "issues view LIN-123" });
  if (parsed.help) return issueViewHelp();
  const id = parsed.positionals[0];
  if (!id) throw usage("issue id is required", ["Run `linear-axi issues view <id>`"]);
  if (id === "all") throw usage("issues view expects one issue id", [
    "Run `linear-axi issues list --limit 50` to view many issues",
    "Run `linear-axi issues view <id>` to view one issue",
  ]);
  const detail = await getIssueDetail(id, runtime);
  if (!detail) throw notFound("issue", id, [
    `Run \`linear-axi issues list --query ${formatCommandArg(id)}\` to search for the issue`,
    'Run `linear-axi issues create --title "Title" --team "<team>"` to create a new issue',
  ]);
  if (parsed.full) return renderToon({ issue: detail });
  const compact = compactIssueDetail(detail);
  return renderToon({
    issue: compact.issue,
    ...(compact.truncated ? { help: [`Run \`linear-axi issues view ${id} --full\` to show the complete issue`] } : {}),
  });
}

async function createIssueCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], array: ["label"], example: 'issues create --title "Bug" --team ENG' });
  if (parsed.help) return issueCreateHelp();
  rejectIdOnCreate("create", "issue", [
    'Run `linear-axi issues create --title "Title" --team "<team>"` to create a new issue',
    'Run `linear-axi issues update --id LIN-123 --state "Done"` to edit an existing issue',
  ], parsed);
  const toolArgs = collectKnownArgs(parsed, [
    "title",
    "team",
    "description",
    "state",
    "assignee",
    "project",
    "cycle",
    "parentId",
    "dueDate",
    "estimate",
    "priority",
  ]);
  if (parsed.label) toolArgs.labels = parsed.label;
  if (parsed["description-file"]) toolArgs.description = await readTextFlag(parsed["description-file"], runtime.cwd);
  await applyRepoProjectDefault(toolArgs, runtime);
  if (!toolArgs.title || !toolArgs.team) {
    throw usage("creating an issue requires --title and --team", [
      'Run `linear-axi issues create --title "Title" --team "<team>"`',
      'Run `linear-axi issues list --team "<team>" --query "Title"` to check existing issues',
    ]);
  }
  await ensureIssueDoesNotExist(toolArgs.title, toolArgs.team, runtime);
  const result = await runtime.client.callTool("save_issue", toolArgs);
  const issue = mutationData(result, [
    'Run `linear-axi issues create --title "Title" --team "<team>"`',
    "Run `linear-axi projects list --full` to confirm project/team compatibility",
  ]);
  return renderToon({ issue: compactIssueMutation(issue) });
}

async function updateIssueCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], array: ["label"], example: 'issues update --id LIN-123 --state Done' });
  if (parsed.help) return issueUpdateHelp();
  const toolArgs = collectKnownArgs(parsed, [
    "id",
    "title",
    "team",
    "description",
    "state",
    "assignee",
    "project",
    "cycle",
    "parentId",
    "dueDate",
    "estimate",
    "priority",
  ]);
  if (parsed.label) toolArgs.labels = parsed.label;
  if (!toolArgs.id) await applyRepoProjectDefault(toolArgs, runtime);
  if (parsed["description-file"]) toolArgs.description = await readTextFlag(parsed["description-file"], runtime.cwd);
  if (!toolArgs.id) {
    throw usage("updating an issue requires --id", [
      'Run `linear-axi issues update --id LIN-123 --state "Done"`',
      "Run `linear-axi issues list --query <text>` to find the issue id",
    ]);
  }
  await ensureIssueExists(toolArgs.id, runtime);
  const result = await runtime.client.callTool("save_issue", toolArgs);
  const issue = mutationData(result, [
    'Run `linear-axi issues update --id LIN-123 --state "Done"`',
    "Run `linear-axi issues list --query <text>` to find the issue id",
  ]);
  return renderToon({ issue: compactIssueMutation(issue) });
}
