import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export class LinearMcpClient {
  constructor({ url, token, fetchImpl, authStorePath } = {}) {
    this.url = url;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.authProvider = token ? null : new LinearOAuthProvider({ storePath: authStorePath });
    this.client = null;
    this.transport = null;
  }

  async connect() {
    const headers = {};
    if (this.token) {
      headers.authorization = `Bearer ${this.token}`;
    }

    this.transport = new StreamableHTTPClientTransport(new URL(this.url), {
      requestInit: Object.keys(headers).length > 0 ? { headers } : undefined,
      authProvider: this.authProvider ?? undefined,
      fetch: this.fetchImpl,
    });
    this.client = new Client({ name: "linear-axi", version: "0.1.0" });
    try {
      await this.client.connect(this.transport);
    } catch (error) {
      if (this.authProvider?.authorizationUrl) {
        const authError = new Error("Linear MCP OAuth authorization required");
        authError.authorizationUrl = this.authProvider.authorizationUrl;
        throw authError;
      }
      throw error;
    }
  }

  async listTools() {
    await this.ensureConnected();
    const result = await this.client.listTools();
    return result.tools ?? [];
  }

  async callTool(name, args) {
    await this.ensureConnected();
    return this.client.callTool({ name, arguments: args });
  }

  async finishAuth(code) {
    this.transport = new StreamableHTTPClientTransport(new URL(this.url), {
      authProvider: this.authProvider ?? undefined,
      fetch: this.fetchImpl,
    });
    await this.transport.finishAuth(code);
  }

  async close() {
    await this.transport?.close();
  }

  async ensureConnected() {
    if (!this.client) {
      await this.connect();
    }
  }
}

export class LinearOAuthProvider {
  constructor({ storePath } = {}) {
    this.storePath = storePath ?? defaultAuthStorePath();
    this.authorizationUrl = null;
  }

  get redirectUrl() {
    return "http://127.0.0.1:14566/oauth/callback";
  }

  get clientMetadata() {
    return {
      client_name: "linear-axi",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    };
  }

  async state() {
    const store = await this.readStore();
    if (store.state) return store.state;
    const state = randomBytes(24).toString("base64url");
    await this.updateStore({ state });
    return state;
  }

  async clientInformation() {
    return (await this.readStore()).clientInformation;
  }

  async saveClientInformation(clientInformation) {
    await this.updateStore({ clientInformation });
  }

  async tokens() {
    return (await this.readStore()).tokens;
  }

  async saveTokens(tokens) {
    await this.updateStore({ tokens });
  }

  async redirectToAuthorization(authorizationUrl) {
    this.authorizationUrl = authorizationUrl.toString();
  }

  async saveCodeVerifier(codeVerifier) {
    await this.updateStore({ codeVerifier });
  }

  async codeVerifier() {
    const codeVerifier = (await this.readStore()).codeVerifier;
    if (!codeVerifier) throw new Error("No OAuth code verifier saved");
    return codeVerifier;
  }

  async invalidateCredentials(scope) {
    const store = await this.readStore();
    if (scope === "all" || scope === "client") delete store.clientInformation;
    if (scope === "all" || scope === "tokens") delete store.tokens;
    if (scope === "all" || scope === "verifier") {
      delete store.codeVerifier;
      delete store.state;
    }
    await this.writeStore(store);
  }

  async readStore() {
    try {
      return JSON.parse(await readFile(this.storePath, "utf8"));
    } catch {
      return {};
    }
  }

  async updateStore(patch) {
    await this.writeStore({ ...(await this.readStore()), ...patch });
  }

  async writeStore(store) {
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await chmod(this.storePath, 0o600);
  }
}

function defaultAuthStorePath() {
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "linear-axi", "oauth.json");
}
