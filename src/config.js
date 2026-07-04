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
    const match = text.match(/\[mcp_servers\.linear\][\s\S]*?url\s*=\s*"([^"]+)"/);
    return match?.[1] ?? DEFAULT_MCP_URL;
  } catch {
    return DEFAULT_MCP_URL;
  }
}

export function collapseHome(path) {
  const home = homedir();
  if (path === home) return "~";
  if (path.startsWith(`${home}/`)) return `~/${path.slice(home.length + 1)}`;
  return path;
}
