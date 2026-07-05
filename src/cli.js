import { realpathSync } from "node:fs";
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

export async function main(args, context) {
  const runtime = await makeRuntime(context);
  try {
    const output = await run(args, runtime);
    context.stdout.write(output);
  } catch (error) {
    const axiError = normalizeError(error);
    context.stdout.write(renderToon({
      error: axiError.message,
      code: axiError.code,
      type: axiError.type,
      ...(axiError.help.length > 0 ? { help: axiError.help } : {}),
    }));
    process.exitCode = axiError.exitCode;
  } finally {
    await runtime.client?.close();
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
