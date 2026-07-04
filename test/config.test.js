import test from "node:test";
import assert from "node:assert/strict";
import { extractLinearMcpUrl } from "../src/config.js";

test("Codex Linear MCP URL lookup stays inside linear table", () => {
  const text = `
[mcp_servers.linear]
command = "linear-mcp"

[mcp_servers.other]
url = "https://wrong.example/mcp"
`;

  assert.equal(extractLinearMcpUrl(text), null);
});

test("Codex Linear MCP URL lookup reads the linear table URL", () => {
  const text = `
[mcp_servers.other]
url = "https://wrong.example/mcp"

[mcp_servers.linear]
url = "https://linear.example/mcp"
`;

  assert.equal(extractLinearMcpUrl(text), "https://linear.example/mcp");
});
