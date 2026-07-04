import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFlags, usage } from "../args.js";
import { collapseHome } from "../config.js";
import { renderToon } from "../format.js";
import { formatCommandArg } from "../lib/cli-helpers.js";
import { findGitRoot, readProjectFile } from "../lib/repo-project.js";
import { initHelp } from "./help.js";

export async function initCommand(args, runtime) {
  const parsed = parseFlags(args, { boolean: ["help", "force"], example: 'init --project "Roadmap"' });
  if (parsed.help) return initHelp();
  const project = String(parsed.project ?? parsed.positionals[0] ?? "").trim();
  if (!project) {
    throw usage("--project is required", ['Run `linear-axi init --project "<project>"`']);
  }
  const repo = await findGitRoot(runtime.cwd);
  if (!repo) {
    throw usage("current directory is not inside a Git repository", [
      "Run `git init` first",
      'Run `linear-axi init --project "<project>"` from a Git repository',
    ]);
  }

  const path = join(repo, ".linear-project");
  let existing;
  try {
    existing = await readProjectFile(path);
  } catch (error) {
    if (!parsed.force) throw error;
    existing = null;
  }
  if (existing?.project === project) {
    return renderToon({
      project: "already initialized",
      file: collapseHome(path),
      value: { project },
      help: ["Run `linear-axi issues list` to list issues for this project"],
    });
  }
  if (existing && !parsed.force) {
    throw usage(".linear-project already exists with a different project", [
      `Run \`linear-axi init --project ${formatCommandArg(project)} --force\` to replace it`,
      "Run `linear-axi issues list --project <project>` to override the repo default once",
    ]);
  }

  await writeFile(path, `${JSON.stringify({ project }, null, 2)}\n`, "utf8");
  return renderToon({
    project: "initialized",
    file: collapseHome(path),
    value: { project },
    help: [
      "Run `linear-axi issues list` to list issues for this project",
      'Run `linear-axi issues create --title "Task" --team "<team>"` to create an issue in this project',
    ],
  });
}
