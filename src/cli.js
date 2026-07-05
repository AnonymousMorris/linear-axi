import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AxiError as SdkAxiError, exitCodeForError, runAxiCli } from "axi-sdk-js";
import { usage } from "./args.js";
import { resolveMcpUrl } from "./config.js";
import { renderToon } from "./format.js";
import { LinearMcpClient } from "./mcp.js";
import { authCommand } from "./commands/auth.js";
import { commentCommand } from "./commands/comments.js";
import { cycleCommand } from "./commands/cycles.js";
import { documentCommand } from "./commands/documents.js";
import { topHelp } from "./commands/help.js";
import { homeCommand } from "./commands/home.js";
import { initCommand } from "./commands/init.js";
import { issueCommand } from "./commands/issues.js";
import { listResourceCommand } from "./commands/list-resource.js";
import { milestoneCommand } from "./commands/milestones.js";
import { projectCommand } from "./commands/projects.js";
import {
  LIST_TOOL_ALIASES,
  normalizeError,
} from "./commands/shared.js";
import { statusCommand } from "./commands/statuses.js";
import { DESCRIPTION } from "./skill.js";

const VERSION = readPackageVersion();

const COMMANDS = {
  ...Object.fromEntries(Object.keys(LIST_TOOL_ALIASES).map((command) => [
    command,
    (args, runtime) => listResourceCommand(command, args, runtime),
  ])),
  init: initCommand,
  auth: authCommand,
  issues: issueCommand,
  issue: issueCommand,
  comments: commentCommand,
  comment: commentCommand,
  milestones: milestoneCommand,
  milestone: milestoneCommand,
  cycles: cycleCommand,
  cycle: cycleCommand,
  statuses: statusCommand,
  status: statusCommand,
  documents: documentCommand,
  document: documentCommand,
  projects: projectCommand,
  project: projectCommand,
};

export async function main(args, context) {
  try {
    await runAxiCli({
      argv: normalizeTopLevelArgs(args),
      stdout: context.stdout,
      description: DESCRIPTION,
      version: VERSION,
      topLevelHelp: topHelp(),
      home: withRuntimeCleanup(async (_args, runtime) => stripHomeHeader(await homeCommand(runtime))),
      commands: Object.fromEntries(Object.entries(COMMANDS).map(([name, command]) => [
        name,
        withRuntimeCleanup(async (commandArgs, runtime) => trimFinalNewline(await command(commandArgs, runtime))),
      ])),
      resolveContext: () => makeRuntime(context),
      renderUnknownCommand: (command) => renderToon({
        error: `unknown command: ${command}`,
        code: "VALIDATION_ERROR",
        type: "The command input or saved local configuration is invalid.",
        help: [
          "Run `linear-axi`",
          'Run `linear-axi init --project "<project>"`',
          "Run `linear-axi issues list`",
          "Run `linear-axi projects list`",
          "Run `linear-axi teams list`",
        ],
      }),
      formatError: (error) => {
        if (error instanceof SdkAxiError) {
          return {
            output: renderToon({
              error: error.message,
              code: error.code,
              type: sdkErrorTypeMessage(error.code),
              ...(error.suggestions.length > 0 ? { help: error.suggestions } : {}),
            }),
            exitCode: exitCodeForError(error),
          };
        }
        const axiError = normalizeError(error);
        return {
          output: renderToon({
            error: axiError.message,
            code: axiError.code,
            type: axiError.type,
            ...(axiError.help.length > 0 ? { help: axiError.help } : {}),
          }),
          exitCode: axiError.exitCode,
        };
      },
    });
  } catch (error) {
    const axiError = normalizeError(error);
    context.stdout.write(renderToon({
      error: axiError.message,
      code: axiError.code,
      type: axiError.type,
      ...(axiError.help.length > 0 ? { help: axiError.help } : {}),
    }));
    process.exitCode = axiError.exitCode;
  }
}

export async function run(args, runtime) {
  if (args.length === 0) {
    return homeCommand(runtime);
  }

  const [command, ...rest] = args;
  if (command === "--help" || command === "-h") return topHelp();
  if (command === "init") return initCommand(rest, runtime);
  if (command === "auth") return authCommand(rest, runtime);
  if (command === "issues" || command === "issue") return issueCommand(rest, runtime);
  if (command === "comments" || command === "comment") return commentCommand(rest, runtime);
  if (command === "milestones" || command === "milestone") return milestoneCommand(rest, runtime);
  if (command === "cycles" || command === "cycle") return cycleCommand(rest, runtime);
  if (command === "statuses" || command === "status") return statusCommand(rest, runtime);
  if (command === "documents" || command === "document") return documentCommand(rest, runtime);
  if (command === "projects" || command === "project") return projectCommand(rest, runtime);
  if (command in LIST_TOOL_ALIASES) return listResourceCommand(command, rest, runtime);

  throw usage(`unknown command: ${command}`, [
    "Run `linear-axi`",
    "Run `linear-axi init --project \"<project>\"`",
    "Run `linear-axi issues list`",
    "Run `linear-axi projects list`",
    "Run `linear-axi teams list`",
  ]);
}

function trimFinalNewline(output) {
  return typeof output === "string" ? output.replace(/\n$/, "") : output;
}

function normalizeTopLevelArgs(args) {
  if (args.length === 1 && args[0] === "-h") {
    return ["--help"];
  }
  return args;
}

function withRuntimeCleanup(handler) {
  return async (args, runtime) => {
    try {
      return await handler(args, runtime);
    } finally {
      await runtime?.client?.close();
    }
  };
}

function stripHomeHeader(output) {
  return trimFinalNewline(output)
    .split("\n")
    .filter((line) => !line.startsWith("bin: ") && !line.startsWith("description: "))
    .join("\n");
}

function sdkErrorTypeMessage(code) {
  if (code === "VALIDATION_ERROR") return "The command input is invalid.";
  if (code === "UPDATE_ERROR") return "The self-update operation failed.";
  return "The operation failed.";
}

async function makeRuntime(context) {
  const url = await resolveMcpUrl(context.env);
  return {
    cwd: context.cwd,
    env: context.env,
    binPath: executablePath(),
    mcpUrl: url,
    stdout: context.stdout,
    client: context.client ?? new LinearMcpClient({
      url,
      token: context.env.LINEAR_AXI_MCP_TOKEN ?? context.env.LINEAR_MCP_TOKEN,
      authStorePath: context.env.LINEAR_AXI_AUTH_FILE,
    }),
  };
}

function executablePath() {
  try {
    return realpathSync(process.argv[1]);
  } catch {
    return process.argv[1] ?? "linear-axi";
  }
}

function readPackageVersion() {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    join(here, "..", "package.json"),
    join(here, "..", "..", "package.json"),
  ]) {
    if (!existsSync(candidate)) continue;
    const parsed = JSON.parse(readFileSync(candidate, "utf8"));
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  }
  throw new Error("Could not determine linear-axi package version");
}
