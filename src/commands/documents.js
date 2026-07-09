import { parseFlags, usage } from "../args.js";
import { renderToon } from "../format.js";
import { collectKnownArgs, dispatchCommandGroup, formatCommandArg, readTextFlag, rejectIdOnCreate } from "../lib/cli-helpers.js";
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

const DOCUMENT_MUTATION_FIELDS = ["id", "title", "team", "project", "issue", "initiative", "cycle", "color", "icon", "content"];
const DOCUMENT_CREATE_HELP = ['Run `linear-axi documents create --title "Spec" --team "<team>"`'];
const DOCUMENT_UPDATE_HELP = [
  'Run `linear-axi documents update --id <id> --content "Updated"`',
  "Run `linear-axi documents list --query <text>` to find the document id",
];

export async function documentCommand(args, runtime) {
  return dispatchCommandGroup(args, {
    name: "documents",
    help: () => groupHelp("documents", ["list", "view", "create", "update"]),
    handlers: {
      list: (rest) => aliasListCommand("documents", rest, runtime),
      view: (rest) => viewDocumentCommand(rest, runtime),
      create: (rest) => createDocumentCommand(rest, runtime),
      update: (rest) => updateDocumentCommand(rest, runtime),
    },
    unknownHelp: ["Run `linear-axi documents list`", "Run `linear-axi documents view <id>`", "Run `linear-axi documents create --title \"Spec\" --team ENG`"],
  });
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
  const toolArgs = await documentToolArgs(parsed, runtime, { applyDefaultProject: true });
  requireDocumentTitle(toolArgs);
  return saveDocument(toolArgs, runtime, ["create_document", "save_document"]);
}

async function updateDocumentCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'documents update --id <id> --content "Updated"' });
  if (parsed.help) return documentUpdateHelp();
  rejectDocumentIdOnCreate("update", parsed);
  const toolArgs = await documentToolArgs(parsed, runtime);
  requireDocumentId(toolArgs);
  await ensureDocumentExists(toolArgs.id, runtime);
  return saveDocument(toolArgs, runtime, ["update_document", "save_document"]);
}

function rejectDocumentIdOnCreate(subcommand, parsed) {
  rejectIdOnCreate(subcommand, "document", [
    'Run `linear-axi documents create --title "Spec" --team "<team>" --content-file spec.md`',
    'Run `linear-axi documents update --id <id> --content "Updated"` to edit an existing document',
  ], parsed);
}

async function documentToolArgs(parsed, runtime, options = {}) {
  const toolArgs = collectKnownArgs(parsed, DOCUMENT_MUTATION_FIELDS);
  if (options.applyDefaultProject && !toolArgs.team && !toolArgs.issue && !toolArgs.initiative && !toolArgs.cycle) {
    await applyRepoProjectDefault(toolArgs, runtime, {
      command: "linear-axi documents create",
      requireProject: true,
    });
  }
  if (parsed["content-file"]) toolArgs.content = await readTextFlag(parsed["content-file"], runtime.cwd);
  return toolArgs;
}

function requireDocumentTitle(toolArgs) {
  if (!toolArgs.title) throw usage("creating a document requires --title", DOCUMENT_CREATE_HELP);
}

function requireDocumentId(toolArgs) {
  if (!toolArgs.id) throw usage("updating a document requires --id", DOCUMENT_UPDATE_HELP);
}

async function saveDocument(toolArgs, runtime, toolNames) {
  const result = await callAvailableTool(runtime, toolNames, toolArgs);
  return renderDocumentMutation(result);
}

function renderDocumentMutation(result) {
  const document = mutationData(result, [
    'Run `linear-axi documents create --title "Spec" --team "<team>" --content-file spec.md`',
    "Run `linear-axi documents view <id>` to read a document",
  ]);
  return renderToon({ document: compactDocumentMutation(document) });
}
