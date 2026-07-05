import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import { collectKnownArgs, formatCommandArg, readTextFlag, rejectIdOnCreate } from "../lib/cli-helpers.js";
import { compactDocumentDetail, compactDocumentMutation } from "../lib/linear-format.js";
import { callAvailableTool, mutationData } from "../lib/mcp-tools.js";
import { applyRepoProjectDefault } from "../lib/repo-project.js";
import {
  documentCreateHelp,
  documentUpdateHelp,
  documentViewHelp,
  groupHelp,
} from "./help.js";
import { aliasListCommand } from "./list-resource.js";
import {
  ensureDocumentExists,
  getDocumentDetail,
  notFound,
} from "./shared.js";

export async function documentCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("documents", ["list", "view", "create", "update"]);

  switch (subcommand ?? "list") {
    case "list":
      return aliasListCommand("documents", rest, runtime);
    case "view":
      return viewDocumentCommand(rest, runtime);
    case "create":
      return createDocumentCommand(rest, runtime);
    case "update":
      return updateDocumentCommand(rest, runtime);
    default:
      throw usage(`unknown documents command: ${subcommand}`, ["Run `linear-axi documents list`", "Run `linear-axi documents view <id>`", "Run `linear-axi documents create --title \"Spec\" --team ENG`"]);
  }
}

async function viewDocumentCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help", "full"], example: "documents view <id>" });
  if (parsed.help) return documentViewHelp();
  const id = parsed.positionals[0] ?? parsed.id;
  if (!id) throw usage("document id is required", ["Run `linear-axi documents view <id>`"]);
  const detail = await getDocumentDetail(id, runtime);
  if (!detail) throw notFound("document", id, [
    `Run \`linear-axi documents list --query ${formatCommandArg(id)} --fields id,title,updatedAt\` to search for the document`,
    'Run `linear-axi documents create --title "Spec" --team "<team>"` to create a new document',
  ]);
  if (parsed.full) return renderToon({ document: detail });
  const compact = compactDocumentDetail(detail, id);
  return renderToon({
    document: compact.document,
    ...(compact.truncated ? { help: [`Run \`linear-axi documents view ${id} --full\` to show the complete document`] } : {}),
  });
}

async function createDocumentCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'documents create --title "Spec" --team ENG' });
  if (parsed.help) return documentCreateHelp();
  rejectDocumentIdOnCreate("create", parsed);
  const toolArgs = await documentToolArgs(parsed, runtime);
  if (!toolArgs.title) {
    throw usage("creating a document requires --title", ['Run `linear-axi documents create --title "Spec" --team "<team>"`']);
  }
  const result = await callAvailableTool(runtime, ["create_document", "save_document"], toolArgs);
  return renderDocumentMutation(result);
}

async function updateDocumentCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'documents update --id <id> --content "Updated"' });
  if (parsed.help) return documentUpdateHelp();
  rejectDocumentIdOnCreate("update", parsed);
  const toolArgs = await documentToolArgs(parsed, runtime);
  if (!toolArgs.id) {
    throw usage("updating a document requires --id", [
      'Run `linear-axi documents update --id <id> --content "Updated"`',
      "Run `linear-axi documents list --query <text>` to find the document id",
    ]);
  }
  await ensureDocumentExists(toolArgs.id, runtime);
  const result = await callAvailableTool(runtime, ["update_document", "save_document"], toolArgs);
  return renderDocumentMutation(result);
}

function rejectDocumentIdOnCreate(subcommand, parsed) {
  rejectIdOnCreate(subcommand, "document", [
    'Run `linear-axi documents create --title "Spec" --team "<team>" --content-file spec.md`',
    'Run `linear-axi documents update --id <id> --content "Updated"` to edit an existing document',
  ], parsed);
}

async function documentToolArgs(parsed, runtime) {
  const toolArgs = collectKnownArgs(parsed, ["id", "title", "team", "project", "issue", "initiative", "cycle", "color", "icon", "content"]);
  if (!toolArgs.id) await applyRepoProjectDefault(toolArgs, runtime);
  if (parsed["content-file"]) toolArgs.content = await readTextFlag(parsed["content-file"], runtime.cwd);
  return toolArgs;
}

function renderDocumentMutation(result) {
  const document = mutationData(result, [
    'Run `linear-axi documents create --title "Spec" --team "<team>" --content-file spec.md`',
    "Run `linear-axi documents view <id>` to read a document",
  ]);
  return renderToon({
    document: compactDocumentMutation(document),
    help: [`Run \`linear-axi documents view ${document.id ?? "<id>"}\` to verify details`],
  });
}
