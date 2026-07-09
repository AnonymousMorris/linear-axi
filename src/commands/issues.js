import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import {
  collectKnownArgs,
  dispatchCommandGroup,
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
  rejectIssueIdOnCreate("create", parsed);
  const toolArgs = issueToolArgs(parsed);
  await readIssueDescriptionFlag(toolArgs, parsed, runtime);
  await applyRepoProjectDefault(toolArgs, runtime, {
    command: "linear-axi issues create",
    requireProject: true,
  });
  requireIssueCreateFields(toolArgs);
  await ensureIssueDoesNotExist(toolArgs.title, toolArgs.team, runtime);
  return saveIssue(toolArgs, runtime, [
    'Run `linear-axi issues create --title "Title" --team "<team>"`',
    "Run `linear-axi projects list --full` to confirm project/team compatibility",
  ]);
}

async function updateIssueCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], array: ["label"], example: 'issues update --id LIN-123 --state Done' });
  if (parsed.help) return issueUpdateHelp();
  const toolArgs = issueToolArgs(parsed);
  if (!toolArgs.id) await applyRepoProjectDefault(toolArgs, runtime);
  await readIssueDescriptionFlag(toolArgs, parsed, runtime);
  requireIssueId(toolArgs);
  await ensureIssueExists(toolArgs.id, runtime);
  return saveIssue(toolArgs, runtime, ISSUE_UPDATE_HELP);
}

function rejectIssueIdOnCreate(subcommand, parsed) {
  rejectIdOnCreate(subcommand, "issue", [
    'Run `linear-axi issues create --title "Title" --team "<team>"` to create a new issue',
    'Run `linear-axi issues update --id LIN-123 --state "Done"` to edit an existing issue',
  ], parsed);
}

function issueToolArgs(parsed) {
  const toolArgs = collectKnownArgs(parsed, ISSUE_MUTATION_FIELDS);
  if (parsed.label) toolArgs.labels = parsed.label;
  return toolArgs;
}

function requireIssueCreateFields(toolArgs) {
  if (!toolArgs.title || !toolArgs.team) {
    throw usage("creating an issue requires --title and --team", ISSUE_CREATE_HELP);
  }
}

function requireIssueId(toolArgs) {
  if (!toolArgs.id) throw usage("updating an issue requires --id", ISSUE_UPDATE_HELP);
}

async function readIssueDescriptionFlag(toolArgs, parsed, runtime) {
  if (parsed["description-file"]) {
    toolArgs.description = await readTextFlag(parsed["description-file"], runtime.cwd);
  }
}

async function saveIssue(toolArgs, runtime, help) {
  const result = await runtime.client.callTool("save_issue", toolArgs);
  return renderIssueMutation(result, help);
}

function renderIssueMutation(result, help) {
  const issue = mutationData(result, help);
  return renderToon({ issue: compactIssueMutation(issue) });
}
