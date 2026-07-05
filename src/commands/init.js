import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFlags, usage } from "../args.js";
import { collapseHome } from "../config.js";
import { renderToon } from "../format.js";
import { formatCommandArg } from "../lib/cli-helpers.js";
import { findGitRoot, projectFileValue, readProjectFile, validateRepoProject } from "../lib/repo-project.js";
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
    const validated = await validateRepoProject(parsed.force ? { project } : existing, runtime);
    if (validated.workspace && existing.workspace !== validated.workspace) {
      await writeProjectFile(path, validated);
      return renderToon({
        project: "initialized",
        file: collapseHome(path),
        value: projectFileValue(validated),
      });
    }
    return renderToon({
      project: "already initialized",
      file: collapseHome(path),
      value: projectFileValue(existing),
    });
  }
  if (existing && !parsed.force) {
    throw usage(".linear-project already exists with a different project", [
      `Run \`linear-axi init --project ${formatCommandArg(project)} --force\` to replace it`,
      "Run `linear-axi issues list --project <project>` to override the repo default once",
    ]);
  }

  const validated = await validateRepoProject({ project }, runtime);
  await writeProjectFile(path, validated);
  return renderToon({
    project: "initialized",
    file: collapseHome(path),
    value: projectFileValue(validated),
  });
}

async function writeProjectFile(path, repoProject) {
  await writeFile(path, `${JSON.stringify(projectFileValue(repoProject), null, 2)}\n`, "utf8");
}
