import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/cli.js";

test("top help exposes Linear resource commands", async () => {
  const output = await run(["--help"], runtime({}));

  assert.match(output, /issues, projects, teams, users, comments, documents, milestones, cycles, statuses, labels/);
  assert.doesNotMatch(output, /releases/);
  assert.doesNotMatch(output, /statuses save/);
  assert.doesNotMatch(output, /statuses delete/);
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

test("list commands support fields and pagination hints", async () => {
  const output = await run(
    ["projects", "list", "--fields", "id,name,state"],
    runtime({
      callTool: async () => ({
        structuredContent: {
          projects: [
            { id: "p1", name: "Roadmap", state: "started", ignored: "hidden" },
          ],
          hasNextPage: true,
          cursor: "next-page",
        },
      }),
    }),
  );

  assert.match(output, /count: "1 returned, more available"/);
  assert.match(output, /cursor: next-page/);
  assert.match(output, /projects\[1\]\{id,name,state\}:/);
  assert.match(output, /p1,Roadmap,started/);
  assert.doesNotMatch(output, /ignored/);
  assert.match(output, /Run `linear-axi projects list --cursor next-page` to continue/);
});

test("list full counts rows inside response envelopes", async () => {
  const output = await run(
    ["projects", "list", "--full"],
    runtime({
      callTool: async () => ({
        structuredContent: {
          projects: [
            { id: "p1", name: "Roadmap" },
            { id: "p2", name: "Inbox" },
          ],
        },
      }),
    }),
  );

  assert.match(output, /count: 2 returned/);
  assert.match(output, /projects\[2\]\{id,name\}:/);
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

test("comments list emits pagination hints", async () => {
  const output = await run(
    ["comments", "list", "--issue", "LIN-1"],
    runtime({
      callTool: async () => ({
        structuredContent: {
          comments: [{ id: "c1", body: "Ready" }],
          pageInfo: { hasNextPage: true, endCursor: "next-comments" },
        },
      }),
    }),
  );

  assert.match(output, /count: "1 returned, more available"/);
  assert.match(output, /cursor: next-comments/);
  assert.match(output, /comments\[1\]\{id,author,created,body\}:/);
  assert.match(output, /Run `linear-axi comments list --issue LIN-1 --cursor next-comments` to continue/);
});

test("comments reject unsupported parent flags before MCP calls", async () => {
  let called = false;
  const client = runtime({
    callTool: async () => {
      called = true;
      return {};
    },
  });

  await assert.rejects(
    () => run(["comments", "list", "--project", "Roadmap"], client),
    /--project is not supported for comments/,
  );
  await assert.rejects(
    () => run(["comments", "save", "--parentId", "comment-id", "--body", "Reply"], client),
    /--parentId is not supported for comments/,
  );

  assert.equal(called, false);
});

test("comments save requires an issue", async () => {
  let called = false;

  await assert.rejects(
    () => run(
      ["comments", "save", "--body", "Ready"],
      runtime({
        callTool: async () => {
          called = true;
          return {};
        },
      }),
    ),
    /comments save requires --issue/,
  );

  assert.equal(called, false);
});

test("auth login manual prints authorization url without finishing", async () => {
  let finished = false;
  const output = await run(
    ["auth", "login", "--manual"],
    runtime({
      listTools: async () => {
        const error = new Error("auth required");
        error.authorizationUrl = "https://linear.example/authorize?code_challenge=test&state=expected-state";
        throw error;
      },
      finishAuth: async () => {
        finished = true;
      },
    }),
  );

  assert.match(output, /auth: Linear MCP OAuth authorization required/);
  assert.match(output, /url: "https:\/\/linear.example\/authorize\?code_challenge=test&state=expected-state"/);
  assert.equal(finished, false);
});

test("auth login validates localhost callback state before finishing", async () => {
  const writes = [];
  const finishedCodes = [];
  const login = run(
    ["auth", "login", "--timeout", "5000"],
    runtime({
      stdout: { write: (text) => writes.push(text) },
      listTools: async () => {
        const error = new Error("auth required");
        error.authorizationUrl = "https://linear.example/authorize?code_challenge=test&state=expected-state";
        throw error;
      },
      finishAuth: async (code) => {
        finishedCodes.push(code);
      },
    }),
  );

  await waitFor(() => writes.join("").includes("http://127.0.0.1:14566/oauth/callback"));
  const rejected = await fetch("http://127.0.0.1:14566/oauth/callback?code=wrong-code&state=wrong-state");
  assert.equal(rejected.status, 400);
  assert.deepEqual(finishedCodes, []);

  const response = await fetch("http://127.0.0.1:14566/oauth/callback?code=test-code&state=expected-state");
  assert.equal(response.status, 200);

  const output = await login;
  assert.deepEqual(finishedCodes, ["test-code"]);
  assert.match(output, /auth: Linear MCP OAuth authorized/);
});

test("issues view full returns only matching issue detail", async () => {
  const calls = [];
  const output = await run(
    ["issues", "view", "LIN-1", "--full"],
    runtime({
      listTools: async () => [{ name: "get_issue" }],
      callTool: async (name, args) => {
        calls.push({ name, args });
        return { structuredContent: { id: "issue-id", identifier: "LIN-1", title: "Right", description: "Full body" } };
      },
    }),
  );

  assert.deepEqual(calls, [
    { name: "get_issue", args: { id: "LIN-1" } },
  ]);
  assert.match(output, /title: Right/);
  assert.match(output, /description: Full body/);
  assert.doesNotMatch(output, /Wrong/);
});

test("issues view compact output previews long descriptions", async () => {
  const description = `${"a".repeat(1001)} tail`;
  const output = await run(
    ["issues", "view", "LIN-1"],
    runtime({
      listTools: async () => [{ name: "get_issue" }],
      callTool: async () => ({
        structuredContent: {
          identifier: "LIN-1",
          title: "Right",
          description,
          assignee: { name: "Morris" },
          state: { name: "Todo" },
        },
      }),
    }),
  );

  assert.match(output, /issue:/);
  assert.match(output, /description: ".+\.\.\. \(truncated, 1006 chars total\)"/);
  assert.match(output, /help\[1\]:\n  Run `linear-axi issues view LIN-1 --full` to show the complete issue/);
});

test("issues view compact output includes short descriptions without noisy help", async () => {
  const output = await run(
    ["issues", "view", "LIN-1"],
    runtime({
      listTools: async () => [{ name: "get_issue" }],
      callTool: async () => ({
        structuredContent: {
          identifier: "LIN-1",
          title: "Right",
          description: "Short body",
        },
      }),
    }),
  );

  assert.match(output, /description: Short body/);
  assert.doesNotMatch(output, /--full/);
});

test("issues view falls back to exact list match when get_issue is unavailable", async () => {
  const calls = [];
  const output = await run(
    ["issues", "view", "LIN-1", "--full"],
    runtime({
      listTools: async () => [{ name: "list_issues" }],
      callTool: async (name, args) => {
        calls.push({ name, args });
        return {
          structuredContent: {
            issues: [
              { id: "other", identifier: "LIN-10", title: "Wrong" },
              { id: "issue-id", identifier: "LIN-1", title: "Right" },
            ],
          },
        };
      },
    }),
  );

  assert.deepEqual(calls, [
    { name: "list_issues", args: { query: "LIN-1", limit: 10 } },
  ]);
  assert.match(output, /title: Right/);
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

test("statuses list does not fall back to status update tool", async () => {
  let called = false;

  await assert.rejects(
    () => run(
      ["statuses", "list", "--team", "ENG"],
      runtime({
        listTools: async () => [{ name: "get_status_updates" }],
        callTool: async () => {
          called = true;
          return {};
        },
      }),
    ),
    /Linear MCP server does not expose list_issue_statuses/,
  );

  assert.equal(called, false);
});

test("statuses list surfaces missing issue status tool without fallback", async () => {
  let calls = 0;

  await assert.rejects(
    () => run(
      ["statuses", "list", "--team", "ENG"],
      runtime({
        callTool: async (name) => {
          calls += 1;
          assert.equal(name, "list_issue_statuses");
          throw new Error("unknown tool: list_issue_statuses");
        },
      }),
    ),
    /unknown tool: list_issue_statuses/,
  );

  assert.equal(calls, 1);
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

test("removed releases command returns usage without MCP call", async () => {
  let called = false;

  await assert.rejects(
    () => run(
      ["releases", "list"],
      runtime({
        callTool: async () => {
          called = true;
          return {};
        },
      }),
    ),
    /releases is not supported by the default Linear MCP server/,
  );

  assert.equal(called, false);
});

test("removed status mutations return usage without MCP call", async () => {
  let called = false;
  const client = runtime({
    callTool: async () => {
      called = true;
      return {};
    },
  });

  await assert.rejects(
    () => run(["statuses", "save", "--type", "project", "--project", "Roadmap"], client),
    /statuses save is not supported by the default Linear MCP server/,
  );
  await assert.rejects(
    () => run(["statuses", "delete", "--type", "project", "--id", "status-id"], client),
    /statuses delete is not supported by the default Linear MCP server/,
  );

  assert.equal(called, false);
});

test("mcp-shaped tools command is not public cli", async () => {
  await assert.rejects(
    () => run(["tools", "list"], runtime({})),
    /unknown command: tools/,
  );
});

async function waitFor(predicate) {
  const started = Date.now();
  while (Date.now() - started < 3000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for condition");
}

function runtime(client) {
  return {
    cwd: process.cwd(),
    env: {},
    binPath: "/tmp/linear-axi",
    mcpUrl: "https://mcp.linear.app/mcp",
    stdout: client.stdout,
    client: { close: async () => {}, ...client },
  };
}
