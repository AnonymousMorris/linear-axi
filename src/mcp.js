import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class LinearMcpClient {
  constructor({ url, token, fetchImpl } = {}) {
    this.url = url;
    this.token = token;
    this.fetchImpl = fetchImpl;
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
      fetch: this.fetchImpl,
    });
    this.client = new Client({ name: "linear-axi", version: "0.1.0" });
    await this.client.connect(this.transport);
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

  async close() {
    await this.transport?.close();
  }

  async ensureConnected() {
    if (!this.client) {
      await this.connect();
    }
  }
}
