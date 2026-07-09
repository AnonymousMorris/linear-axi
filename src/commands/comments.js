import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import {
  collectKnownArgs,
  continuationCommand,
  dispatchCommandGroup,
  formatCommandArg,
  parseFiniteNumber,
  readTextFlag,
} from "../lib/cli-helpers.js";
import { compactCommentMutation, compactComments, paginationInfo } from "../lib/linear-format.js";
import { asArray, extractData, mutationData } from "../lib/mcp-tools.js";
import { commentCreateHelp, commentListHelp, groupHelp } from "./help.js";
import {
  COMMENT_CONTINUATION_FLAGS,
  DEFAULT_LIMIT,
  ensureIssueExists,
  rejectUnsupportedCommentFlags,
} from "./shared.js";

const COMMENT_CREATE_HELP = ['Run `linear-axi comments create --issue LIN-123 --body "Ready"`'];
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
  const toolArgs = { issueId: parsed.issue };
  toolArgs.limit = parseFiniteNumber("limit", parsed.limit ?? DEFAULT_LIMIT);
  if (parsed.cursor) toolArgs.cursor = parsed.cursor;
  if (parsed.orderBy) toolArgs.orderBy = parsed.orderBy;
  const result = await runtime.client.callTool("list_comments", toolArgs);
  const data = extractData(result);
  const rows = parsed.full ? data : compactComments(data);
  const rowCount = asArray(data).length;
  const page = paginationInfo(data, rowCount);
  const commentsValue = Array.isArray(rows) && rows.length === 0 ? [] : rows;
  const help = [`Run \`linear-axi comments create --issue ${parsed.issue} --body "..."\` to add a comment`];
  if (!parsed.full && Array.isArray(rows) && rows.some((comment) => comment.truncated)) {
    help.push(`Run \`linear-axi comments list --issue ${formatCommandArg(parsed.issue)} --full\` to show complete comment bodies`);
  }
  if (page.cursor) {
    help.push(`Run \`${continuationCommand("linear-axi comments list", parsed, COMMENT_CONTINUATION_FLAGS, page.cursor)}\` to continue`);
  }
  return renderToon({
    count: page.count,
    ...(page.cursor ? { cursor: page.cursor } : {}),
    comments: parsed.full ? commentsValue : commentsValue.map?.(({ truncated, ...comment }) => comment) ?? commentsValue,
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
  requireCommentIssue(toolArgs);
  requireCommentBody(toolArgs);
  await ensureIssueExists(toolArgs.issueId, runtime);
  return saveComment(toolArgs, runtime);
}

async function commentToolArgs(parsed, runtime) {
  const { issue, ...toolArgs } = collectKnownArgs(parsed, COMMENT_MUTATION_FIELDS);
  if (issue) toolArgs.issueId = issue;
  if (toolArgs.body === undefined && parsed["body-file"]) toolArgs.body = await readTextFlag(parsed["body-file"], runtime.cwd);
  return toolArgs;
}

function requireCommentIssue(toolArgs) {
  if (!toolArgs.issueId) throw usage("comments create requires --issue", COMMENT_CREATE_HELP);
}

function requireCommentBody(toolArgs) {
  if (!toolArgs.body) throw usage("--body or --body-file is required", COMMENT_CREATE_HELP);
}

async function saveComment(toolArgs, runtime) {
  const result = await runtime.client.callTool("save_comment", toolArgs);
  return renderCommentMutation(result, toolArgs.issueId);
}

function renderCommentMutation(result, issueId) {
  const comment = mutationData(result, [
    'Run `linear-axi comments create --issue LIN-123 --body "Ready"`',
    `Run \`linear-axi comments list --issue ${formatCommandArg(issueId)}\` to verify comments`,
  ]);
  const compact = compactCommentMutation(comment);
  return renderToon({
    comment: compact.comment,
    ...(compact.truncated
      ? { help: [`Run \`linear-axi comments list --issue ${formatCommandArg(issueId)} --full\` to show complete comment bodies`] }
      : {}),
  });
}
