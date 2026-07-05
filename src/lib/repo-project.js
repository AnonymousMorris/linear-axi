import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { usage } from "../args.js";
import { asArray, extractData } from "./mcp-tools.js";

export async function applyRepoProjectDefault(toolArgs, runtime, options = {}) {
  const {
    allProjects = false,
    allProjectsCommand,
    command,
    requireProject = false,
  } = options;

  if (allProjects && toolArgs.project !== undefined) {
    throw usage("--project and --all-projects cannot be used together", [
      `Run \`${command ?? "linear-axi issues list"} --project "<project>"\` to use one project`,
      allProjectsCommand ? `Run \`${allProjectsCommand}\` to list across all projects` : "Remove --all-projects when using --project",
    ]);
  }

  if (allProjects) return "all-projects";
  if (toolArgs.project !== undefined) return "explicit";

  const repoProject = await readRepoProject(runtime.cwd);
  if (repoProject) {
    const validated = await validateRepoProject(repoProject, runtime, { command });
    toolArgs.project = validated.project;
    return "repo-default";
  }

  if (requireProject) {
    throw usage("No default Linear project is configured for this repository", uninitializedProjectHelp(command, allProjectsCommand));
  }

  return "none";
}

export function withRepoProject(toolArgs, repoProject) {
  if (!repoProject || toolArgs.project !== undefined) return toolArgs;
  return { ...toolArgs, project: repoProject.project };
}

export async function validateRepoProject(repoProject, runtime, options = {}) {
  if (!repoProject) return null;
  if (!(await canValidateProjects(runtime))) return repoProject;

  const listed = await runtime.client.callTool("list_projects", { query: repoProject.project, limit: 10 });
  const projects = asArray(extractData(listed));
  const match = projects.find((project) => projectMatches(project, repoProject.project));
  if (!match) {
    throw invalidRepoProject(repoProject.project, options.command);
  }

  const workspace = extractWorkspaceName(match, { allowBareName: false }) ?? repoProject.workspace;
  if (repoProject.workspace && workspace && normalizeWorkspace(repoProject.workspace) !== normalizeWorkspace(workspace)) {
    throw invalidRepoProject(repoProject.project, options.command, repoProject.workspace);
  }
  return {
    project: projectName(match, repoProject.project),
    ...(workspace ? { workspace } : {}),
  };
}

export function projectFileValue(repoProject) {
  return repoProject.workspace
    ? { workspace: repoProject.workspace, project: repoProject.project }
    : { project: repoProject.project };
}

export async function readRepoProject(cwd) {
  const repo = await findGitRoot(cwd);
  if (!repo) return null;
  return readProjectFile(join(repo, ".linear-project"));
}

function uninitializedProjectHelp(command, allProjectsCommand) {
  return [
    'Run `linear-axi init --project "<project>"` to bind this repo',
    ...(command ? [`Run \`${command} --project "<project>"\` to choose a project once`] : []),
    ...(allProjectsCommand ? [`Run \`${allProjectsCommand}\` to list across all projects`] : []),
    "Run `linear-axi projects list` to find Linear projects",
  ];
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
      const workspace = typeof parsed.workspace === "string" && parsed.workspace.trim()
        ? parsed.workspace.trim()
        : null;
      return {
        ...(workspace ? { workspace } : {}),
        project: parsed.project.trim(),
      };
    }
  } catch {
    if (!trimmed.includes("\n") && !/^\s*[\[{]/.test(trimmed)) return { project: trimmed };
  }
  throw usage(".linear-project must contain JSON with a project string", [
    'Run `linear-axi init --project "<project>" --force` to repair it',
  ]);
}

async function canValidateProjects(runtime) {
  if (typeof runtime.client.listTools !== "function") return false;
  const tools = await runtime.client.listTools();
  return tools.some((tool) => tool.name === "list_projects");
}

function invalidRepoProject(project, command, workspace) {
  return usage(`The saved default Linear project does not exist in the authenticated workspace: ${project}`, [
    `Run \`linear-axi projects list --query "${project}" --fields id,name,status\` to search the current workspace`,
    `Run \`linear-axi init --project "<project>" --force\` to update .linear-project`,
    ...(workspace ? [`The saved workspace is ${workspace}`] : []),
    ...(command ? [`Run \`${command} --project "<project>"\` to choose a project once`] : []),
  ]);
}

function projectMatches(project, value) {
  const expected = normalizeProject(value);
  return [project.id, project.slugId, project.name].some((candidate) => normalizeProject(candidate) === expected);
}

function projectName(project, fallback) {
  return String(project.name ?? project.slugId ?? project.id ?? fallback).trim();
}

function normalizeProject(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function normalizeWorkspace(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

export function extractWorkspaceName(data, options = {}) {
  const { allowBareName = true } = options;
  if (!data || typeof data !== "object") return null;
  for (const key of ["workspace", "organization"]) {
    const nested = extractWorkspaceName(data[key]);
    if (nested) return nested;
  }
  if (typeof data.url === "string") {
    const workspace = workspaceFromLinearUrl(data.url);
    if (workspace) return workspace;
  }
  if (allowBareName && typeof data.name === "string" && data.name.trim()) return data.name.trim();
  for (const key of ["projects", "teams", "nodes", "items", "data"]) {
    if (!Array.isArray(data[key])) continue;
    for (const item of data[key]) {
      const nested = extractWorkspaceName(item, { allowBareName: false });
      if (nested) return nested;
    }
  }
  return null;
}

export function workspaceFromLinearUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "linear.app") return null;
    const workspace = parsed.pathname.split("/").filter(Boolean)[0];
    return workspace || null;
  } catch {
    return null;
  }
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
