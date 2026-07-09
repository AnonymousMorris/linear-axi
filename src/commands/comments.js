import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import {
  appendContinuationHelp,
  applyTextFileFlag,
  collectKnownArgs,
  dispatchCommandGroup,
  formatCommandArg,
  requireValue,
} from "../lib/cli-helpers.js";
import { compactCommentMutation, compactComments, paginationInfo } from "../lib/linear-format.js";
import { asArray, extractData } from "../lib/mcp-tools.js";
import { commentCreateHelp, commentListHelp, groupHelp } from "./help.js";
import {
  DEFAULT_LIMIT,
  ensureIssueExists,
  rejectUnsupportedCommentFlags,
  renderMutation,
} from "./shared.js";

const COMMENT_CREATE_HELP = ['Run `linear-axi comments create --issue LIN-123 --body "Ready"`'];
const COMMENT_LIST_FIELDS = ["issue", "limit", "cursor", "orderBy"];
const COMMENT_CONTINUATION_FLAGS = [
  ...COMMENT_LIST_FIELDS.filter((name) => name !== "cursor"),
  "full",
];
const COMMENT_MUTATION_FIELDS = ["issue", "body"];

export async function commentCommand(args, runtime) {
  return dispatchCommandGroup(args, {
    name: "comments",
    help: () => groupHelp("comments", ["list", "create"]),
    handlers: {
      list: (rest) => listCommentsCommand(rest, runtime),
      create: (rest) => createCommentCommand(rest, runtime),
    },
    unknownHelp: ["Run `linear-axi comments list --issue LIN-123`", "Run `linear-axi comments create --issue LIN-123 --body \"...\"`"],
  });
}

async function listCommentsCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help", "full"], example: "comments list --issue LIN-123" });
  if (parsed.help) return commentListHelp();
  rejectUnsupportedCommentFlags(parsed);
  if (!parsed.issue) {
    throw usage("comments list requires --issue", ["Run `linear-axi comments list --issue LIN-123`"]);
  }
  const { issue, ...toolArgs } = collectKnownArgs({ ...parsed, limit: parsed.limit ?? DEFAULT_LIMIT }, COMMENT_LIST_FIELDS);
  toolArgs.issueId = issue;
  const result = await runtime.client.callTool("list_comments", toolArgs);
  const data = extractData(result);
  const rows = parsed.full ? data : compactComments(data);
  const rowCount = asArray(data).length;
  const page = paginationInfo(data, rowCount);
  const help = [`Run \`linear-axi comments create --issue ${parsed.issue} --body "..."\` to add a comment`];
  if (!parsed.full && Array.isArray(rows) && rows.some((comment) => comment.truncated)) {
    help.push(`Run \`linear-axi comments list --issue ${formatCommandArg(parsed.issue)} --full\` to show complete comment bodies`);
  }
  appendContinuationHelp(help, "linear-axi comments list", parsed, COMMENT_CONTINUATION_FLAGS, page.cursor);
  return renderToon({
    count: page.count,
    ...(page.cursor ? { cursor: page.cursor } : {}),
    comments: parsed.full ? rows : rows.map(({ truncated, ...comment }) => comment),
    help,
  });
}

async function createCommentCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'comments create --issue LIN-123 --body "Ready"' });
  if (parsed.help) return commentCreateHelp();
  rejectUnsupportedCommentFlags(parsed);
  if (parsed.id) {
    throw usage("comments create supports issue comments only", COMMENT_CREATE_HELP);
  }
  const toolArgs = await commentToolArgs(parsed, runtime);
  requireValue(toolArgs.issueId, "comments create requires --issue", COMMENT_CREATE_HELP);
  requireValue(toolArgs.body, "--body or --body-file is required", COMMENT_CREATE_HELP);
  await ensureIssueExists(toolArgs.issueId, runtime);
  return saveComment(toolArgs, runtime);
}

async function commentToolArgs(parsed, runtime) {
  const { issue, ...toolArgs } = collectKnownArgs(parsed, COMMENT_MUTATION_FIELDS);
  if (issue) toolArgs.issueId = issue;
  await applyTextFileFlag(toolArgs, parsed, {
    flag: "body-file",
    field: "body",
    cwd: runtime.cwd,
    preserveExisting: true,
  });
  return toolArgs;
}

async function saveComment(toolArgs, runtime) {
  return renderMutation(runtime, {
    tool: "save_comment",
    args: toolArgs,
    help: [
      'Run `linear-axi comments create --issue LIN-123 --body "Ready"`',
      `Run \`linear-axi comments list --issue ${formatCommandArg(toolArgs.issueId)}\` to verify comments`,
    ],
    render: (comment) => {
      const compact = compactCommentMutation(comment);
      return {
        comment: compact.comment,
        ...(compact.truncated
          ? { help: [`Run \`linear-axi comments list --issue ${formatCommandArg(toolArgs.issueId)} --full\` to show complete comment bodies`] }
          : {}),
      };
    },
  });
}
