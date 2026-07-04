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
  removedSaveCommand,
} from "./shared.js";

export async function documentCommand(args, runtime) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return groupHelp("documents", ["list", "view", "create", "update"]);
  if (!subcommand || subcommand === "list") return aliasListCommand("documents", rest, runtime);
  if (subcommand === "view") {
    const parsed = parseFlags(rest, { boolean: ["help", "full"], example: "documents view <id>" });
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
  if (subcommand === "save") {
    return removedSaveCommand("documents", rest, [
      'Run `linear-axi documents create --title "Spec" --team "<team>" --content-file spec.md`',
      'Run `linear-axi documents update --id <id> --content "Updated"`',
    ]);
  }
  if (subcommand === "create" || subcommand === "update") {
    const parsed = parseFlags(rest, { boolean: ["help"], example: `documents ${subcommand} --title "Spec" --team ENG` });
    if (parsed.help) return subcommand === "create" ? documentCreateHelp() : documentUpdateHelp();
    rejectIdOnCreate(subcommand, "document", [
      'Run `linear-axi documents create --title "Spec" --team "<team>" --content-file spec.md`',
      'Run `linear-axi documents update --id <id> --content "Updated"` to edit an existing document',
    ], parsed);
    const toolArgs = collectKnownArgs(parsed, ["id", "title", "team", "project", "issue", "initiative", "cycle", "color", "icon", "content"]);
    if (!toolArgs.id) await applyRepoProjectDefault(toolArgs, runtime);
    if (parsed["content-file"]) toolArgs.content = await readTextFlag(parsed["content-file"], runtime.cwd);
    if (subcommand === "create" && !toolArgs.title) {
      throw usage("creating a document requires --title", ['Run `linear-axi documents create --title "Spec" --team "<team>"`']);
    }
    if (subcommand === "update" && !toolArgs.id) {
      throw usage("updating a document requires --id", [
        'Run `linear-axi documents update --id <id> --content "Updated"`',
        "Run `linear-axi documents list --query <text>` to find the document id",
      ]);
    }
    if (subcommand === "update") await ensureDocumentExists(toolArgs.id, runtime);
    const result = subcommand === "update"
      ? await callAvailableTool(runtime, ["update_document", "save_document"], toolArgs)
      : await callAvailableTool(runtime, ["create_document", "save_document"], toolArgs);
    const document = mutationData(result, [
      'Run `linear-axi documents create --title "Spec" --team "<team>" --content-file spec.md`',
      "Run `linear-axi documents view <id>` to read a document",
    ]);
    return renderToon({
      document: compactDocumentMutation(document),
      help: [`Run \`linear-axi documents view ${document.id ?? "<id>"}\` to verify details`],
    });
  }
  throw usage(`unknown documents command: ${subcommand}`, ["Run `linear-axi documents list`", "Run `linear-axi documents view <id>`", "Run `linear-axi documents create --title \"Spec\" --team ENG`"]);
}
