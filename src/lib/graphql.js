import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { AxiError, usage } from "../args.js";

const DEFAULT_GRAPHQL_URL = "https://api.linear.app/graphql";

export async function callLinearGraphql(runtime, query, variables) {
  if (runtime.graphqlClient) {
    return runtime.graphqlClient.call(query, variables);
  }

  const token = await resolveGraphqlToken(runtime);
  const response = await (runtime.fetch ?? fetch)(runtime.env.LINEAR_AXI_GRAPHQL_URL ?? DEFAULT_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: token.authorization,
    },
    body: JSON.stringify({ query, variables }),
  });

  let body;
  try {
    body = await response.json();
  } catch {
    throw new AxiError("operational", `Linear GraphQL returned HTTP ${response.status}`);
  }

  if (!response.ok || body.errors?.length > 0) {
    const message = body.errors?.[0]?.message ?? `Linear GraphQL returned HTTP ${response.status}`;
    throw new AxiError("operational", message);
  }
  return body.data;
}

export function requireDangerouslySkipPermissions(parsed, command) {
  if (parsed["dangerously-skip-permissions"]) return;
  throw usage(`${command} requires --dangerously-skip-permissions`, [
    `Run \`linear-axi ${command} --id <id> --dangerously-skip-permissions\``,
  ]);
}

async function resolveGraphqlToken(runtime) {
  const env = runtime.env ?? {};
  const authorization = env.LINEAR_AXI_GRAPHQL_AUTHORIZATION
    ?? env.LINEAR_API_KEY
    ?? env.LINEAR_API_TOKEN
    ?? env.LINEAR_AXI_GRAPHQL_TOKEN
    ?? bearer(env.LINEAR_AXI_MCP_TOKEN)
    ?? bearer(env.LINEAR_MCP_TOKEN)
    ?? bearer(await readOAuthAccessToken(env));

  if (!authorization) {
    throw new AxiError("usage", "Linear GraphQL authentication is required", [
      "Set LINEAR_API_KEY or LINEAR_AXI_GRAPHQL_TOKEN before using this hidden delete command",
    ]);
  }

  return { authorization };
}

function bearer(token) {
  if (!token) return null;
  return token.startsWith("Bearer ") ? token : `Bearer ${token}`;
}

async function readOAuthAccessToken(env) {
  const authFile = env.LINEAR_AXI_AUTH_FILE ?? join(env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "linear-axi", "oauth.json");
  try {
    const store = JSON.parse(await readFile(authFile, "utf8"));
    return store.tokens?.access_token ?? null;
  } catch {
    return null;
  }
}
