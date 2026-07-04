import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_MCP_URL = "https://mcp.linear.app/mcp";

export async function resolveMcpUrl(env) {
  if (env.LINEAR_AXI_MCP_URL) {
    return env.LINEAR_AXI_MCP_URL;
  }

  const configPath = env.CODEX_CONFIG ?? join(homedir(), ".codex", "config.toml");
  try {
    const text = await readFile(configPath, "utf8");
    return extractLinearMcpUrl(text) ?? DEFAULT_MCP_URL;
  } catch {
    return DEFAULT_MCP_URL;
  }
}

export function extractLinearMcpUrl(text) {
  let inLinearTable = false;

  for (const line of text.split(/\r?\n/)) {
    const table = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
    if (table) {
      inLinearTable = table[1].trim() === "mcp_servers.linear";
      continue;
    }

    if (!inLinearTable) continue;
    const url = line.match(/^\s*url\s*=\s*(['"])(.*?)\1\s*(?:#.*)?$/);
    if (url) return url[2];
  }

  return null;
}

export function collapseHome(path) {
  const home = homedir();
  if (path === home) return "~";
  if (path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;
  return path;
}
