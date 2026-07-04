import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { usage } from "../args.js";

export async function applyRepoProjectDefault(toolArgs, runtime) {
  if (toolArgs.project !== undefined) return;
  const repoProject = await readRepoProject(runtime.cwd);
  if (repoProject) toolArgs.project = repoProject.project;
}

export function withRepoProject(toolArgs, repoProject) {
  if (!repoProject || toolArgs.project !== undefined) return toolArgs;
  return { ...toolArgs, project: repoProject.project };
}

export async function readRepoProject(cwd) {
  const repo = await findGitRoot(cwd);
  if (!repo) return null;
  return readProjectFile(join(repo, ".linear-project"));
}

export async function readProjectFile(path) {
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return null;
  }
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.project === "string" && parsed.project.trim()) {
      return { project: parsed.project.trim() };
    }
  } catch {
    if (!trimmed.includes("\n") && !/^\s*[\[{]/.test(trimmed)) return { project: trimmed };
  }
  throw usage(".linear-project must contain JSON with a project string", [
    'Run `linear-axi init --project "<project>" --force` to repair it',
  ]);
}

export async function findGitRoot(cwd) {
  let current = resolve(cwd);
  while (true) {
    if (await pathExists(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
