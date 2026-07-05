import test from "node:test";
import assert from "node:assert/strict";
import { LinearMcpClient, LinearOAuthProvider } from "../src/mcp.js";
import { chmod, mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("remote client uses OAuth provider when no bearer token is configured", () => {
  const client = new LinearMcpClient({ url: "https://mcp.linear.app/mcp" });

  assert.ok(client.authProvider instanceof LinearOAuthProvider);
});

test("remote client keeps bearer token path for token endpoints", () => {
  const client = new LinearMcpClient({ url: "https://example.test/mcp", token: "secret" });

  assert.equal(client.authProvider, null);
});

test("OAuth provider persists state for Linear CSRF validation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "linear-axi-oauth-"));
  const storePath = join(dir, "oauth.json");
  const provider = new LinearOAuthProvider({ storePath });

  const first = await provider.state();
  const second = await provider.state();
  const store = JSON.parse(await readFile(storePath, "utf8"));

  assert.equal(first, second);
  assert.equal(store.state, first);

  await provider.invalidateCredentials("verifier");
  const resetStore = JSON.parse(await readFile(storePath, "utf8"));
  assert.equal(resetStore.state, undefined);
});

test("OAuth provider deletes the local credential store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "linear-axi-oauth-"));
  const storePath = join(dir, "oauth.json");
  const provider = new LinearOAuthProvider({ storePath });

  await provider.saveTokens({ access_token: "initial" });

  assert.equal(await provider.deleteStore(), true);
  await assert.rejects(() => stat(storePath), /ENOENT/);
  assert.equal(await provider.deleteStore(), false);
});

test("OAuth provider tightens permissions on existing token store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "linear-axi-oauth-"));
  const storePath = join(dir, "oauth.json");
  const provider = new LinearOAuthProvider({ storePath });

  await provider.saveTokens({ access_token: "initial" });
  await chmod(storePath, 0o666);
  await provider.saveTokens({ access_token: "updated" });

  assert.equal((await stat(storePath)).mode & 0o777, 0o600);
});
