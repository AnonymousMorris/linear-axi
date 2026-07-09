import { parseFlags, usage } from "../args.js";
import {
  applyTextFileFlag,
  collectKnownArgs,
  dispatchCommandGroup,
  rejectIdOnCreate,
  requireValue,
} from "../lib/cli-helpers.js";
import {
  compactIssueDetail,
  compactIssueMutation,
} from "../lib/linear-format.js";
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
  renderDetailView,
  renderMutation,
} from "./shared.js";

const ISSUE_MUTATION_FIELDS = [
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
];
const ISSUE_CREATE_HELP = [
  'Run `linear-axi issues create --title "Title" --team "<team>"`',
  'Run `linear-axi issues list --team "<team>" --query "Title"` to check existing issues',
];
const ISSUE_UPDATE_HELP = [
  'Run `linear-axi issues update --id LIN-123 --state "Done"`',
  "Run `linear-axi issues list --query <text>` to find the issue id",
];
const ISSUE_ID_ON_CREATE_HELP = [
  'Run `linear-axi issues create --title "Title" --team "<team>"` to create a new issue',
  'Run `linear-axi issues update --id LIN-123 --state "Done"` to edit an existing issue',
];

export async function issueCommand(args, runtime) {
  return dispatchCommandGroup(args, {
    name: "issues",
    help: () => groupHelp("issues", ["list", "view", "create", "update"]),
    handlers: {
      list: (rest) => aliasListCommand("issues", rest, runtime),
      view: (rest) => viewIssueCommand(rest, runtime),
      create: (rest) => createIssueCommand(rest, runtime),
      update: (rest) => updateIssueCommand(rest, runtime),
    },
    unknownHelp: [
      "Run `linear-axi issues list`",
      "Run `linear-axi issues view <id>`",
      "Run `linear-axi issues update --id <id> --state done`",
    ],
  });
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
  const detail = await ensureIssueExists(id, runtime);
  return renderDetailView({
    resource: "issue",
    detail,
    full: parsed.full,
    compact: compactIssueDetail,
    fullCommand: `linear-axi issues view ${id} --full`,
  });
}

async function createIssueCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], array: ["label"], example: 'issues create --title "Bug" --team ENG' });
  if (parsed.help) return issueCreateHelp();
  rejectIdOnCreate("issue", ISSUE_ID_ON_CREATE_HELP, parsed);
  const toolArgs = await issueToolArgs(parsed, runtime);
  await applyRepoProjectDefault(toolArgs, runtime, {
    command: "linear-axi issues create",
    requireProject: true,
  });
  requireValue(toolArgs.title && toolArgs.team, "creating an issue requires --title and --team", ISSUE_CREATE_HELP);
  await ensureIssueDoesNotExist(toolArgs.title, toolArgs.team, runtime);
  return saveIssue(toolArgs, runtime, [
    'Run `linear-axi issues create --title "Title" --team "<team>"`',
    "Run `linear-axi projects list --full` to confirm project/team compatibility",
  ]);
}

async function updateIssueCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], array: ["label"], example: 'issues update --id LIN-123 --state Done' });
  if (parsed.help) return issueUpdateHelp();
  const toolArgs = await issueToolArgs(parsed, runtime);
  if (!toolArgs.id) await applyRepoProjectDefault(toolArgs, runtime);
  requireValue(toolArgs.id, "updating an issue requires --id", ISSUE_UPDATE_HELP);
  await ensureIssueExists(toolArgs.id, runtime);
  return saveIssue(toolArgs, runtime, ISSUE_UPDATE_HELP);
}

async function issueToolArgs(parsed, runtime) {
  const toolArgs = collectKnownArgs(parsed, ISSUE_MUTATION_FIELDS);
  if (parsed.label) toolArgs.labels = parsed.label;
  await applyTextFileFlag(toolArgs, parsed, {
    flag: "description-file",
    field: "description",
    cwd: runtime.cwd,
  });
  return toolArgs;
}

async function saveIssue(toolArgs, runtime, help) {
  return renderMutation(runtime, {
    tool: "save_issue",
    args: toolArgs,
    help,
    render: (issue) => ({ issue: compactIssueMutation(issue) }),
  });
}
