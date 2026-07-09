import { parseFlags, usage } from "../args.js";
import { applyTextFileFlag, collectKnownArgs, dispatchCommandGroup, rejectIdOnCreate, requireValue } from "../lib/cli-helpers.js";
import { compactDocumentDetail, compactDocumentMutation } from "../lib/linear-format.js";
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
  renderDetailView,
  renderMutation,
} from "./shared.js";

const DOCUMENT_MUTATION_FIELDS = ["id", "title", "team", "project", "issue", "initiative", "cycle", "color", "icon", "content"];
const DOCUMENT_CREATE_HELP = ['Run `linear-axi documents create --title "Spec" --team "<team>"`'];
const DOCUMENT_UPDATE_HELP = [
  'Run `linear-axi documents update --id <id> --content "Updated"`',
  "Run `linear-axi documents list --query <text>` to find the document id",
];
const DOCUMENT_ID_ON_CREATE_HELP = [
  'Run `linear-axi documents create --title "Spec" --team "<team>" --content-file spec.md`',
  'Run `linear-axi documents update --id <id> --content "Updated"` to edit an existing document',
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
  const detail = await ensureDocumentExists(id, runtime);
  return renderDetailView({
    resource: "document",
    detail,
    full: parsed.full,
    compact: (document) => compactDocumentDetail(document, id),
    fullCommand: `linear-axi documents view ${id} --full`,
  });
}

async function createDocumentCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'documents create --title "Spec" --team ENG' });
  if (parsed.help) return documentCreateHelp();
  rejectIdOnCreate("document", DOCUMENT_ID_ON_CREATE_HELP, parsed);
  const toolArgs = await documentToolArgs(parsed, runtime, { applyDefaultProject: true });
  requireValue(toolArgs.title, "creating a document requires --title", DOCUMENT_CREATE_HELP);
  return saveDocument(toolArgs, runtime, ["create_document", "save_document"]);
}

async function updateDocumentCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help"], example: 'documents update --id <id> --content "Updated"' });
  if (parsed.help) return documentUpdateHelp();
  const toolArgs = await documentToolArgs(parsed, runtime);
  requireValue(toolArgs.id, "updating a document requires --id", DOCUMENT_UPDATE_HELP);
  await ensureDocumentExists(toolArgs.id, runtime);
  return saveDocument(toolArgs, runtime, ["update_document", "save_document"]);
}

async function documentToolArgs(parsed, runtime, options = {}) {
  const toolArgs = collectKnownArgs(parsed, DOCUMENT_MUTATION_FIELDS);
  if (options.applyDefaultProject && !toolArgs.team && !toolArgs.issue && !toolArgs.initiative && !toolArgs.cycle) {
    await applyRepoProjectDefault(toolArgs, runtime, {
      command: "linear-axi documents create",
      requireProject: true,
    });
  }
  await applyTextFileFlag(toolArgs, parsed, {
    flag: "content-file",
    field: "content",
    cwd: runtime.cwd,
  });
  return toolArgs;
}

async function saveDocument(toolArgs, runtime, toolNames) {
  return renderMutation(runtime, {
    toolNames,
    args: toolArgs,
    help: [
      'Run `linear-axi documents create --title "Spec" --team "<team>" --content-file spec.md`',
      "Run `linear-axi documents view <id>` to read a document",
    ],
    render: (document) => ({ document: compactDocumentMutation(document) }),
  });
}
