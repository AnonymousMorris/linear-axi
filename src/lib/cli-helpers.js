import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { usage } from "../args.js";

export function continuationCommand(baseCommand, parsed, flagNames, cursor) {
  const parts = [baseCommand];
  for (const name of flagNames) {
    if (parsed[name] === undefined) continue;
    appendFlag(parts, name, parsed[name]);
  }
  appendFlag(parts, "cursor", cursor);
  return parts.join(" ");
}

export function formatCommandArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@-]+$/.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

export function collectKnownArgs(parsed, names) {
  const collected = {};
  for (const name of names) {
    if (parsed[name] !== undefined) collected[name] = coerceArg(name, parsed[name]);
  }
  return collected;
}

export function rejectIdOnCreate(subcommand, resource, help, parsed) {
  if (subcommand === "create" && parsed.id !== undefined) {
    const article = /^[aeiou]/i.test(resource) ? "an" : "a";
    throw usage(`creating ${article} ${resource} does not accept --id`, help);
  }
}

export function dispatchCommandGroup(args, options) {
  const [subcommand, ...rest] = args;
  if (subcommand === "--help" || subcommand === "-h") return options.help();

  const handler = options.handlers[subcommand ?? options.defaultSubcommand ?? "list"];
  if (handler) return handler(rest);

  throw usage(`unknown ${options.name} command: ${subcommand}`, options.unknownHelp);
}

export function parseFiniteNumber(name, value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw usage(`--${name} must be a finite number`, [`Run \`linear-axi --help\``]);
  }
  return number;
}

export async function readTextFlag(path, cwd) {
  const absolute = isAbsolute(path) ? path : resolve(cwd, path);
  try {
    return await readFile(absolute, "utf8");
  } catch {
    throw usage(`file could not be read: ${path}`, ["Rerun with a readable file path"]);
  }
}

function appendFlag(parts, name, value) {
  if (value === true) {
    parts.push(`--${name}`);
    return;
  }
  if (value === false) {
    parts.push(`--${name}=false`);
    return;
  }
  parts.push(`--${name}`, formatCommandArg(value));
}

function coerceArg(name, value) {
  if (["limit", "estimate", "priority"].includes(name)) return parseFiniteNumber(name, value);
  if (["includeArchived", "includeMembers", "includeMilestones", "includeStages", "includeTeams"].includes(name)) return value === true || value === "true";
  return value;
}
