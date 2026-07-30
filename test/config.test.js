import test from "node:test";
import assert from "node:assert/strict";
import { extractLinearMcpUrl, resolveMcpUrl, validateMcpUrl } from "../src/config.js";

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

test("validateMcpUrl accepts https and loopback http", () => {
  assert.equal(validateMcpUrl("https://mcp.linear.app/mcp"), "https://mcp.linear.app/mcp");
  assert.equal(validateMcpUrl("http://127.0.0.1:14566/mcp"), "http://127.0.0.1:14566/mcp");
  assert.equal(validateMcpUrl("http://localhost:8080/mcp"), "http://localhost:8080/mcp");
});

test("validateMcpUrl rejects insecure and malformed URLs", () => {
  assert.throws(() => validateMcpUrl("http://evil.example/mcp"), /insecure MCP URL/);
  assert.throws(() => validateMcpUrl("ftp://mcp.linear.app/mcp"), /insecure MCP URL/);
  assert.throws(() => validateMcpUrl("not a url"), /invalid Linear MCP URL/);
});

test("resolveMcpUrl announces a non-default endpoint on stderr", async (t) => {
  const write = t.mock.method(process.stderr, "write", () => true);
  const result = await resolveMcpUrl({ LINEAR_AXI_MCP_URL: "https://mcp.internal.example/mcp" });
  assert.equal(result, "https://mcp.internal.example/mcp");
  assert.match(String(write.mock.calls[0].arguments[0]), /non-default Linear MCP endpoint mcp\.internal\.example/);
});

test("resolveMcpUrl stays silent for the default endpoint", async (t) => {
  const write = t.mock.method(process.stderr, "write", () => true);
  assert.equal(await resolveMcpUrl({ CODEX_CONFIG: "/nonexistent/linear-axi/config.toml" }), "https://mcp.linear.app/mcp");
  assert.equal(write.mock.calls.length, 0);
});

test("resolveMcpUrl rejects an insecure endpoint from the environment", async () => {
  await assert.rejects(
    () => resolveMcpUrl({ LINEAR_AXI_MCP_URL: "http://evil.example/mcp" }),
    /insecure MCP URL/,
  );
});
