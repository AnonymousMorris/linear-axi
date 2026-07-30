import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { usage } from "./args.js";

const DEFAULT_MCP_URL = "https://mcp.linear.app/mcp";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export async function resolveMcpUrl(env) {
  const value = validateMcpUrl(await readMcpUrl(env));
  if (value !== DEFAULT_MCP_URL) {
    process.stderr.write(`linear-axi: using non-default Linear MCP endpoint ${new URL(value).host}\n`);
  }
  return value;
}

async function readMcpUrl(env) {
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

export function validateMcpUrl(value) {
  if (!URL.canParse(value)) {
    throw usage(`invalid Linear MCP URL: ${value}`, [
      "Set LINEAR_AXI_MCP_URL to an https:// endpoint",
    ]);
  }

  const url = new URL(value);
  const loopbackHttp = url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  if (url.protocol !== "https:" && !loopbackHttp) {
    throw usage(`refusing to send Linear credentials over insecure MCP URL: ${value}`, [
      "Use an https:// endpoint (http:// is allowed only for loopback hosts)",
    ]);
  }
  return value;
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
