import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/cli.js";

test("top help exposes Linear resource commands", async () => {
  const output = await run(["--help"], runtime({}));

  assert.match(output, /issues, projects, teams, users, comments, documents, milestones, cycles, statuses, labels/);
  assert.doesNotMatch(output, /tools list/);
  assert.doesNotMatch(output, /call <tool>/);
});

test("projects list uses list_projects wrapper", async () => {
  let seen;
  const output = await run(
    ["projects", "list", "--query", "roadmap"],
    runtime({
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { projects: [{ id: "p1", name: "Roadmap", state: "started" }] } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "list_projects", args: { query: "roadmap", limit: 50 } });
  assert.match(output, /projects\[1\]\{id,name,state\}:/);
  assert.match(output, /p1,Roadmap,started/);
});

test("issues list uses list_issues wrapper", async () => {
  let seen;
  const output = await run(
    ["issues", "list", "--assignee", "me"],
    runtime({
      callTool: async (name, args) => {
        seen = { name, args };
        return {
          structuredContent: {
            issues: [{ identifier: "LIN-1", title: "Fix auth", state: { name: "In Progress" }, assignee: { name: "Morris" } }],
          },
        };
      },
    }),
  );

  assert.deepEqual(seen, { name: "list_issues", args: { assignee: "me", limit: 50 } });
  assert.match(output, /issues\[1\]\{id,title,state,assignee\}:/);
  assert.match(output, /LIN-1,Fix auth,In Progress,Morris/);
});

test("comments save uses comment-oriented flags", async () => {
  let seen;
  const output = await run(
    ["comments", "save", "--issue", "LIN-1", "--body", "Ready"],
    runtime({
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { id: "c1", body: "Ready" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "save_comment", args: { issueId: "LIN-1", body: "Ready" } });
  assert.match(output, /comment:/);
  assert.match(output, /id: c1/);
});

test("mcp-shaped tools command is not public cli", async () => {
  await assert.rejects(
    () => run(["tools", "list"], runtime({})),
    /unknown command: tools/,
  );
});

function runtime(client) {
  return {
    cwd: process.cwd(),
    env: {},
    binPath: "/tmp/linear-axi",
    mcpUrl: "https://mcp.linear.app/mcp",
    client: { close: async () => {}, ...client },
  };
}
