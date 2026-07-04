import test from "node:test";
import assert from "node:assert/strict";
import { LinearMcpClient, LinearOAuthProvider } from "../src/mcp.js";

test("remote client uses OAuth provider when no bearer token is configured", () => {
  const client = new LinearMcpClient({ url: "https://mcp.linear.app/mcp" });

  assert.ok(client.authProvider instanceof LinearOAuthProvider);
});

test("remote client keeps bearer token path for token endpoints", () => {
  const client = new LinearMcpClient({ url: "https://example.test/mcp", token: "secret" });

  assert.equal(client.authProvider, null);
});
