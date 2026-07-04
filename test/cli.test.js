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

test("comments list accepts bare full flag", async () => {
  let seen;
  const output = await run(
    ["comments", "list", "--issue", "LIN-1", "--full"],
    runtime({
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { comments: [{ id: "c1", body: "Ready", extra: "kept" }] } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "list_comments", args: { issueId: "LIN-1", limit: 50 } });
  assert.match(output, /comments\[1\]\{id,body,extra\}:/);
  assert.match(output, /c1,Ready,kept/);
});

test("issues view full returns only matching issue detail", async () => {
  const calls = [];
  const output = await run(
    ["issues", "view", "LIN-1", "--full"],
    runtime({
      listTools: async () => [{ name: "get_issue" }],
      callTool: async (name, args) => {
        calls.push({ name, args });
        if (name === "list_issues") {
          return {
            structuredContent: {
              issues: [
                { id: "other", identifier: "LIN-10", title: "Wrong" },
                { id: "issue-id", identifier: "LIN-1", title: "Right" },
              ],
            },
          };
        }
        return { structuredContent: { id: "issue-id", identifier: "LIN-1", title: "Right", description: "Full body" } };
      },
    }),
  );

  assert.deepEqual(calls, [
    { name: "list_issues", args: { query: "LIN-1", limit: 10 } },
    { name: "get_issue", args: { id: "LIN-1" } },
  ]);
  assert.match(output, /title: Right/);
  assert.match(output, /description: Full body/);
  assert.doesNotMatch(output, /Wrong/);
});

test("documents save uses create or update document tools", async () => {
  let seen;
  await run(
    ["documents", "save", "--title", "Spec"],
    runtime({
      listTools: async () => [{ name: "create_document" }, { name: "update_document" }],
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { id: "doc1", title: "Spec" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "create_document", args: { title: "Spec" } });

  await run(
    ["documents", "save", "--id", "doc1", "--content", "Updated"],
    runtime({
      listTools: async () => [{ name: "create_document" }, { name: "update_document" }],
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { id: "doc1", title: "Spec" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "update_document", args: { id: "doc1", content: "Updated" } });
});

test("statuses list uses issue status tool", async () => {
  let seen;
  await run(
    ["statuses", "list", "--team", "ENG", "--full"],
    runtime({
      listTools: async () => [{ name: "list_issue_statuses" }],
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { statuses: [{ id: "s1", name: "Done" }] } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "list_issue_statuses", args: { team: "ENG" } });
});

test("statuses list compacts status arrays from envelope", async () => {
  const output = await run(
    ["statuses", "list", "--team", "ENG"],
    runtime({
      listTools: async () => [{ name: "list_issue_statuses" }],
      callTool: async () => ({ structuredContent: { statuses: [{ id: "s1", name: "Done", state: "completed" }] } }),
    }),
  );

  assert.match(output, /statuses\[1\]\{id,name,state\}:/);
  assert.match(output, /s1,Done,completed/);
});

test("releases list chooses supported release tool alias", async () => {
  let seen;
  await run(
    ["releases", "list"],
    runtime({
      listTools: async () => [{ name: "list_release_pipelines" }],
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { releases: [{ id: "r1", name: "Mobile" }] } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "list_release_pipelines", args: { limit: 50 } });
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
