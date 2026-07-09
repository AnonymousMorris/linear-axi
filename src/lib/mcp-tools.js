import { AxiError } from "../args.js";

export async function callAvailableTool(runtime, candidates, args) {
  const tools = typeof runtime.client.listTools === "function" ? await runtime.client.listTools() : [];
  const names = new Set(tools.map((tool) => tool.name));
  if (names.size > 0 && !candidates.some((candidate) => names.has(candidate))) {
    throw new ToolUnavailableError(candidates);
  }
  const preferred = candidates.find((candidate) => names.has(candidate)) ?? candidates[0];
  const argsFor = typeof args === "function" ? args : () => args;
  const orderedCandidates = [preferred, ...candidates.filter((candidate) => candidate !== preferred)];
  let preferredError;
  for (const candidate of orderedCandidates) {
    try {
      return await runtime.client.callTool(candidate, argsFor(candidate));
    } catch (error) {
      if (!isUnknownToolError(error)) throw error;
      preferredError ??= error;
    }
  }
  throw preferredError;
}

export function isUnknownToolError(error) {
  if (error?.toolUnavailable) return true;
  const message = error && typeof error.message === "string" ? error.message : String(error);
  return /unknown tool|tool .*not found|method not found|not found.*tool/i.test(message);
}

export function extractData(result) {
  if (result?.structuredContent !== undefined) return result.structuredContent;
  const text = result?.content?.find?.((item) => item.type === "text")?.text;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
  return result ?? {};
}

export function asArray(data) {
  if (Array.isArray(data)) return data;
  for (const key of ["issues", "projects", "teams", "users", "documents", "comments", "milestones", "cycles", "statuses", "labels", "nodes", "items", "data"]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  if (data && typeof data === "object") return [data];
  return [];
}

export async function hasTool(runtime, name) {
  if (typeof runtime.client.listTools !== "function") return false;
  const tools = await runtime.client.listTools();
  return tools.some((tool) => tool.name === name);
}

export function mutationData(result, help) {
  const data = extractData(result);
  if (data && typeof data === "object" && Object.keys(data).length === 1 && typeof data.text === "string") {
    throw new AxiError("operational", data.text, help);
  }
  return data;
}

class ToolUnavailableError extends Error {
  constructor(candidates) {
    super(`Linear MCP server does not expose ${candidates.join(" or ")}`);
    this.toolUnavailable = true;
  }
}
