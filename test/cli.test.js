import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
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

test("home auth errors suggest login before list commands", async () => {
  const parent = await mkdtemp(join(tmpdir(), "linear-axi-home-"));
  const repo = join(parent, "linear-axi");
  await mkdir(join(repo, ".git"), { recursive: true });

  const output = await run(
    [],
    runtime({
      cwd: repo,
      callTool: async () => {
        const error = new Error("auth required");
        error.authorizationUrl = "https://linear.example/authorize?state=expected-state";
        throw error;
      },
    }),
  );

  assert.match(output, /project: linear-axi/);
  assert.match(output, /error: Linear MCP OAuth authorization required/);
  assert.match(output, /help\[1\]:\n  Run `linear-axi <command> <subcommand>` — commands: auth, issues, projects, teams, users, comments, documents/);
  assert.doesNotMatch(output, /linear-axi init --project/);
  assert.doesNotMatch(output, /issues list --assignee me --limit 50/);
});

test("home project uses .linear-project when configured", async () => {
  const repo = await mkdtemp(join(tmpdir(), "linear-axi-repo-"));
  await mkdir(join(repo, ".git"));
  await writeFile(join(repo, ".linear-project"), JSON.stringify({ project: "Roadmap" }), "utf8");

  const output = await run(
    [],
    runtime({
      cwd: repo,
      callTool: async () => ({ structuredContent: { issues: [] } }),
    }),
  );

  assert.match(output, /project: Roadmap/);
  assert.match(output, /issues: 0 assigned to me/);
  assert.doesNotMatch(output, /issues\[0\]/);
  assert.match(output, /help\[1\]:/);
});

test("home summarizes assigned issues instead of listing rows", async () => {
  const output = await run(
    [],
    runtime({
      callTool: async () => ({
        structuredContent: {
          issues: [
            { identifier: "LIN-1", title: "Fix auth" },
            { identifier: "LIN-2", title: "Ship docs" },
          ],
          cursor: "next-page",
        },
      }),
    }),
  );

  assert.match(output, /issues: 2\+ assigned to me/);
  assert.doesNotMatch(output, /issues\[2\]/);
  assert.doesNotMatch(output, /Fix auth/);
});

test("empty lists render as gh-axi-style empty arrays", async () => {
  const output = await run(
    ["projects", "list"],
    runtime({
      callTool: async () => ({ structuredContent: { projects: [] } }),
    }),
  );

  assert.match(output, /count: 0 returned/);
  assert.match(output, /projects: \[\]/);
  assert.match(output, /Run `linear-axi projects create --name "\.\.\." --team "<team>"` to create a project/);
  assert.doesNotMatch(output, /0 projects found/);
  assert.doesNotMatch(output, /--fields/);
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
  assert.match(output, /help\[1\]:\n  Run `linear-axi projects list --fields id,name,status` to choose fields/);
  assert.doesNotMatch(output, /--full/);
  assert.doesNotMatch(output, /--query "<text>"/);
});

test("list commands support fields and pagination hints", async () => {
  const output = await run(
    ["projects", "list", "--fields", "id,name,state", "--query", "roadmap", "--limit", "25"],
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

  assert.match(output, /count: 1 returned \(more available\)/);
  assert.match(output, /cursor: next-page/);
  assert.match(output, /projects\[1\]\{id,name,state\}:/);
  assert.match(output, /p1,Roadmap,started/);
  assert.doesNotMatch(output, /ignored/);
  assert.match(output, /help\[2\]:/);
  assert.match(output, /Run `linear-axi projects list --limit 25 --query roadmap --fields 'id,name,state' --cursor next-page` to continue/);
});

test("list pagination hints shell-escape unsafe values", async () => {
  const output = await run(
    ["projects", "list", "--query", "roadmap $(touch /tmp/axi)'$HOME", "--limit", "25"],
    runtime({
      callTool: async () => ({
        structuredContent: {
          projects: [{ id: "p1", name: "Roadmap" }],
          cursor: "next $(touch /tmp/cursor)'$TOKEN",
        },
      }),
    }),
  );

  assert.match(output, /cursor: next \$\(touch \/tmp\/cursor\)'\$TOKEN/);
  assert.match(output, /--query 'roadmap \$\(touch \/tmp\/axi\)'\\''\$HOME' --cursor 'next \$\(touch \/tmp\/cursor\)'\\''\$TOKEN'/);
});

test("list pagination hints are emitted for cursor-only responses", async () => {
  const output = await run(
    ["projects", "list", "--limit", "25"],
    runtime({
      callTool: async () => ({
        structuredContent: {
          projects: [{ id: "p1", name: "Roadmap" }],
          pageInfo: { endCursor: "next-page" },
        },
      }),
    }),
  );

  assert.match(output, /count: 1 returned \(more available\)/);
  assert.match(output, /cursor: next-page/);
  assert.match(output, /Run `linear-axi projects list --limit 25 --cursor next-page` to continue/);
});

test("list pagination hints preserve false boolean filters", async () => {
  const output = await run(
    ["projects", "list", "--limit", "25", "--includeArchived=false", "--full=false"],
    runtime({
      callTool: async () => ({
        structuredContent: {
          projects: [{ id: "p1", name: "Roadmap" }],
          pageInfo: { hasNextPage: true, endCursor: "next-page" },
        },
      }),
    }),
  );

  assert.match(output, /Run `linear-axi projects list --limit 25 --includeArchived=false --full=false --cursor next-page` to continue/);
  assert.doesNotMatch(output, /--includeArchived false/);
  assert.doesNotMatch(output, /--full false/);
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

test("init saves repo project and issues list uses it by default", async () => {
  const repo = await mkdtemp(join(tmpdir(), "linear-axi-repo-"));
  await mkdir(join(repo, ".git"));

  const initOutput = await run(["init", "--project", "Roadmap"], runtime({ cwd: repo }));
  assert.match(initOutput, /project: initialized/);
  assert.match(initOutput, /file: .+\.linear-project/);
  assert.doesNotMatch(initOutput, /help\[/);
  assert.deepEqual(JSON.parse(await readFile(join(repo, ".linear-project"), "utf8")), { project: "Roadmap" });

  let seen;
  await run(
    ["issues", "list"],
    runtime({
      cwd: repo,
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { issues: [] } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "list_issues", args: { project: "Roadmap", limit: 50 } });
});

test("repo project default applies to issue creates but not updates", async () => {
  const repo = await mkdtemp(join(tmpdir(), "linear-axi-repo-"));
  await mkdir(join(repo, ".git"));
  await writeFile(join(repo, ".linear-project"), `${JSON.stringify({ project: "Roadmap" })}\n`, "utf8");

  let seen;
  const createOutput = await run(
    ["issues", "create", "--title", "Fix auth", "--team", "ENG"],
    runtime({
      cwd: repo,
      callTool: async (name, args) => {
        if (name === "list_issues") return { structuredContent: { issues: [] } };
        seen = { name, args };
        return { structuredContent: { identifier: "LIN-1", title: "Fix auth" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "save_issue", args: { title: "Fix auth", team: "ENG", project: "Roadmap" } });
  assert.doesNotMatch(createOutput, /help\[/);

  const updateOutput = await run(
    ["issues", "update", "--id", "LIN-1", "--state", "Done"],
    runtime({
      cwd: repo,
      listTools: async () => [{ name: "get_issue" }],
      callTool: async (name, args) => {
        if (name === "get_issue") return { structuredContent: { identifier: "LIN-1", title: "Fix auth" } };
        seen = { name, args };
        return { structuredContent: { identifier: "LIN-1", title: "Fix auth" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "save_issue", args: { id: "LIN-1", state: "Done" } });
  assert.doesNotMatch(updateOutput, /help\[/);
});

test("repo project default applies to document creates but not updates", async () => {
  const repo = await mkdtemp(join(tmpdir(), "linear-axi-repo-"));
  await mkdir(join(repo, ".git"));
  await writeFile(join(repo, ".linear-project"), `${JSON.stringify({ project: "Roadmap" })}\n`, "utf8");

  let seen;
  await run(
    ["documents", "create", "--title", "Spec"],
    runtime({
      cwd: repo,
      listTools: async () => [{ name: "create_document" }, { name: "update_document" }],
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { id: "doc1", title: "Spec" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "create_document", args: { title: "Spec", project: "Roadmap" } });

  await run(
    ["documents", "update", "--id", "doc1", "--title", "Updated"],
    runtime({
      cwd: repo,
      listTools: async () => [{ name: "create_document" }, { name: "update_document" }, { name: "get_document" }],
      callTool: async (name, args) => {
        if (name === "get_document") return { structuredContent: { id: "doc1", title: "Spec" } };
        seen = { name, args };
        return { structuredContent: { id: "doc1", title: "Updated" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "update_document", args: { id: "doc1", title: "Updated" } });
});

test("repo project default applies to milestone creates and updates use explicit projects", async () => {
  const repo = await mkdtemp(join(tmpdir(), "linear-axi-repo-"));
  await mkdir(join(repo, ".git"));
  await writeFile(join(repo, ".linear-project"), `${JSON.stringify({ project: "Roadmap" })}\n`, "utf8");

  let seen;
  await run(
    ["milestones", "create", "--name", "Beta"],
    runtime({
      cwd: repo,
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { id: "m1", name: "Beta" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "save_milestone", args: { name: "Beta", project: "Roadmap" } });

  await run(
    ["milestones", "update", "--project", "Roadmap", "--id", "m1", "--targetDate", "2026-09-01"],
    runtime({
      cwd: repo,
      callTool: async (name, args) => {
        if (name === "get_milestone") return { structuredContent: { id: "m1", name: "Beta" } };
        seen = { name, args };
        return { structuredContent: { id: "m1", name: "Beta" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "save_milestone", args: { id: "m1", project: "Roadmap", targetDate: "2026-09-01" } });
});

test("repo project discovery walks up from a subdirectory and explicit project wins", async () => {
  const repo = await mkdtemp(join(tmpdir(), "linear-axi-repo-"));
  const child = join(repo, "packages", "app");
  await mkdir(join(repo, ".git"));
  await mkdir(child, { recursive: true });
  await writeFile(join(repo, ".linear-project"), `${JSON.stringify({ project: "Roadmap" })}\n`, "utf8");

  let seen;
  await run(
    ["issues", "list", "--project", "Other"],
    runtime({
      cwd: child,
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { issues: [] } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "list_issues", args: { project: "Other", limit: 50 } });
});

test("init requires a Git repository before writing .linear-project", async (t) => {
  const dir = await makeNoGitTempDir();
  if (!dir) {
    t.skip("no writable temp parent without a .git ancestor");
    return;
  }

  await assert.rejects(
    () => run(["init", "--project", "Roadmap"], runtime({ cwd: dir })),
    /current directory is not inside a Git repository/,
  );
});

test("init is idempotent and protects existing project values", async () => {
  const repo = await mkdtemp(join(tmpdir(), "linear-axi-repo-"));
  await mkdir(join(repo, ".git"));
  await writeFile(join(repo, ".linear-project"), `${JSON.stringify({ project: "Roadmap" })}\n`, "utf8");

  const same = await run(["init", "--project", "Roadmap"], runtime({ cwd: repo }));
  assert.match(same, /project: already initialized/);
  assert.doesNotMatch(same, /help\[/);

  await assert.rejects(
    () => run(["init", "--project", "Other"], runtime({ cwd: repo })),
    /\.linear-project already exists/,
  );

  const replaced = await run(["init", "--project", "Other", "--force"], runtime({ cwd: repo }));
  assert.match(replaced, /project: initialized/);
  assert.doesNotMatch(replaced, /help\[/);
  assert.deepEqual(JSON.parse(await readFile(join(repo, ".linear-project"), "utf8")), { project: "Other" });
});

test("comments create uses comment-oriented flags", async () => {
  let seen;
  const output = await run(
    ["comments", "create", "--issue", "LIN-1", "--body", "Ready"],
    runtime({
      listTools: async () => [{ name: "get_issue" }],
      callTool: async (name, args) => {
        if (name === "get_issue") return { structuredContent: { identifier: "LIN-1", title: "Task" } };
        seen = { name, args };
        return { structuredContent: { id: "c1", body: "Ready" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "save_comment", args: { issueId: "LIN-1", body: "Ready" } });
  assert.match(output, /comment:/);
  assert.match(output, /id: c1/);
  assert.doesNotMatch(output, /help\[/);
  assert.doesNotMatch(output, /linear-axi comments list/);
});

test("comments create returns compact preview output", async () => {
  const output = await run(
    ["comments", "create", "--issue", "LIN-1", "--body", "Ready"],
    runtime({
      listTools: async () => [{ name: "get_issue" }],
      callTool: async (name) => {
        if (name === "get_issue") return { structuredContent: { identifier: "LIN-1", title: "Task" } };
        return {
          structuredContent: {
            id: "c1",
            body: "a".repeat(121),
            author: { name: "Morris" },
            createdAt: "2026-07-04T12:00:00Z",
            metadata: "hidden",
          },
        };
      },
    }),
  );

  assert.match(output, /comment:/);
  assert.match(output, /id: c1/);
  assert.match(output, /author: Morris/);
  assert.match(output, /created: "2026-07-04T12:00:00Z"/);
  assert.match(output, /\.\.\. \(truncated, 121 chars total\)/);
  assert.doesNotMatch(output, /metadata/);
  assert.match(output, /help\[1\]:\n  Run `linear-axi comments list --issue LIN-1 --full` to show complete comment bodies/);
  assert.doesNotMatch(output, /Run `linear-axi comments list --issue LIN-1` to verify comments/);
});

test("comments create treats text-only mutation responses as errors", async () => {
  await assert.rejects(
    () => run(
      ["comments", "create", "--issue", "LIN-1", "--body", "Ready"],
      runtime({
        listTools: async () => [{ name: "get_issue" }],
        callTool: async (name) => {
          if (name === "get_issue") return { structuredContent: { identifier: "LIN-1", title: "Task" } };
          return { structuredContent: { text: "Issue not found" } };
        },
      }),
    ),
    (error) => {
      assert.equal(error.kind, "operational");
      assert.equal(error.exitCode, 1);
      assert.match(error.message, /Issue not found/);
      return true;
    },
  );
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
  let seen;
  const output = await run(
    ["comments", "list", "--issue", "LIN-1", "--orderBy", "createdAt", "--limit", "10", "--full"],
    runtime({
      callTool: async (name, args) => {
        seen = { name, args };
        return {
          structuredContent: {
            comments: [{ id: "c1", body: "Ready" }],
            pageInfo: { hasNextPage: true, endCursor: "next-comments" },
          },
        };
      },
    }),
  );

  assert.deepEqual(seen, { name: "list_comments", args: { issueId: "LIN-1", limit: 10, orderBy: "createdAt" } });
  assert.match(output, /count: 1 returned \(more available\)/);
  assert.match(output, /cursor: next-comments/);
  assert.match(output, /comments\[1\]\{id,body\}:/);
  assert.match(output, /Run `linear-axi comments list --issue LIN-1 --limit 10 --orderBy createdAt --full --cursor next-comments` to continue/);
});

test("comments list pagination hints preserve false full flag", async () => {
  const output = await run(
    ["comments", "list", "--issue", "LIN-1", "--limit", "10", "--full=false"],
    runtime({
      callTool: async () => ({
        structuredContent: {
          comments: [{ id: "c1", body: "Ready" }],
          pageInfo: { hasNextPage: true, endCursor: "next-comments" },
        },
      }),
    }),
  );

  assert.match(output, /Run `linear-axi comments list --issue LIN-1 --limit 10 --full=false --cursor next-comments` to continue/);
  assert.doesNotMatch(output, /--full false/);
});

test("comments list marks truncated bodies and shows full escape hatch", async () => {
  const output = await run(
    ["comments", "list", "--issue", "LIN-1"],
    runtime({
      callTool: async () => ({
        structuredContent: { comments: [{ id: "c1", body: "a".repeat(121), author: { name: "Morris" } }] },
      }),
    }),
  );

  assert.match(output, /count: 1 returned/);
  assert.match(output, /body\}:/);
  assert.match(output, /\.\.\. \(truncated, 121 chars total\)/);
  assert.match(output, /Run `linear-axi comments list --issue LIN-1 --full` to show complete comment bodies/);
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
    () => run(["comments", "create", "--parentId", "comment-id", "--body", "Reply"], client),
    /--parentId is not supported for comments/,
  );

  assert.equal(called, false);
});

test("comments create requires an issue", async () => {
  let called = false;

  await assert.rejects(
    () => run(
      ["comments", "create", "--body", "Ready"],
      runtime({
        callTool: async () => {
          called = true;
          return {};
        },
      }),
    ),
    /comments create requires --issue/,
  );

  assert.equal(called, false);
});

test("comments create requires a body before checking the issue", async () => {
  let called = false;

  await assert.rejects(
    () => run(
      ["comments", "create", "--issue", "LIN-1"],
      runtime({
        callTool: async () => {
          called = true;
          return {};
        },
      }),
    ),
    /--body or --body-file is required/,
  );

  assert.equal(called, false);
});

test("numeric flags reject invalid finite numbers before MCP calls", async () => {
  let called = false;

  await assert.rejects(
    () => run(
      ["issues", "list", "--limit", "abc"],
      runtime({
        callTool: async () => {
          called = true;
          return {};
        },
      }),
    ),
    (error) => {
      assert.equal(error.kind, "usage");
      assert.equal(error.exitCode, 2);
      assert.match(error.message, /--limit must be a finite number/);
      return true;
    },
  );

  await assert.rejects(
    () => run(
      ["issues", "create", "--title", "Task", "--team", "ENG", "--priority", "Infinity"],
      runtime({
        callTool: async () => {
          called = true;
          return {};
        },
      }),
    ),
    /--priority must be a finite number/,
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

test("issues view missing issue returns not found", async () => {
  await assert.rejects(
    () => run(
      ["issues", "view", "LIN-404"],
      runtime({
        listTools: async () => [{ name: "get_issue" }],
        callTool: async () => ({ structuredContent: {} }),
      }),
    ),
    (error) => {
      assert.equal(error.kind, "not_found");
      assert.equal(error.code, "NOT_FOUND");
      assert.equal(error.exitCode, 1);
      assert.match(error.message, /issue not found: LIN-404/);
      return true;
    },
  );
});

test("issues view treats blank issue-shaped responses as not found", async () => {
  await assert.rejects(
    () => run(
      ["issues", "view", "LIN-404"],
      runtime({
        listTools: async () => [{ name: "get_issue" }],
        callTool: async () => ({ structuredContent: { identifier: "", title: "", state: "", assignee: "" } }),
      }),
    ),
    (error) => {
      assert.equal(error.kind, "not_found");
      assert.equal(error.code, "NOT_FOUND");
      assert.match(error.message, /issue not found: LIN-404/);
      return true;
    },
  );
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

test("issues view all is rejected instead of returning an empty detail", async () => {
  let called = false;

  await assert.rejects(
    () => run(
      ["issues", "view", "all"],
      runtime({
        callTool: async () => {
          called = true;
          return {};
        },
      }),
    ),
    /issues view expects one issue id/,
  );

  assert.equal(called, false);
});

test("documents create and update use create or update document tools", async () => {
  let seen;
  await run(
    ["documents", "create", "--title", "Spec"],
    runtime({
      listTools: async () => [{ name: "create_document" }, { name: "update_document" }],
      callTool: async (name, args) => {
        seen = { name, args };
        return { structuredContent: { id: "doc1", title: "Spec" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "create_document", args: { title: "Spec" } });

  const updateOutput = await run(
    ["documents", "update", "--id", "doc1", "--content", "Updated"],
    runtime({
      listTools: async () => [{ name: "get_document" }, { name: "create_document" }, { name: "update_document" }],
      callTool: async (name, args) => {
        if (name === "get_document") return { structuredContent: { id: "doc1", title: "Spec" } };
        seen = { name, args };
        return { structuredContent: { id: "doc1", title: "Spec" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "update_document", args: { id: "doc1", content: "Updated" } });
  assert.doesNotMatch(updateOutput, /help\[/);
});

test("explicit create commands reject id before MCP calls", async () => {
  for (const [args, message] of [
    [["issues", "create", "--id", "LIN-1", "--title", "Task", "--team", "ENG"], /creating an issue does not accept --id/],
    [["projects", "create", "--id", "p1", "--name", "Roadmap", "--team", "ENG"], /creating a project does not accept --id/],
    [["documents", "create", "--id", "doc1", "--title", "Spec"], /creating a document does not accept --id/],
    [["milestones", "create", "--project", "Roadmap", "--id", "m1", "--name", "Beta"], /creating a milestone does not accept --id/],
  ]) {
    let called = false;

    await assert.rejects(
      () => run(
        args,
        runtime({
          callTool: async () => {
            called = true;
            return {};
          },
        }),
      ),
      (error) => {
        assert.equal(error.kind, "usage");
        assert.equal(error.exitCode, 2);
        assert.match(error.message, message);
        return true;
      },
    );

    assert.equal(called, false);
  }
});

test("documents view uses get_document and rewrites MCP-native truncation hints", async () => {
  const output = await run(
    ["documents", "view", "doc1"],
    runtime({
      listTools: async () => [{ name: "get_document" }],
      callTool: async (name, args) => {
        assert.equal(name, "get_document");
        assert.deepEqual(args, { id: "doc1" });
        return {
          structuredContent: {
            id: "doc1",
            title: "Spec",
            content: "short preview (truncated, use `get_document` for full description)",
          },
        };
      },
    }),
  );

  assert.match(output, /document:/);
  assert.match(output, /title: Spec/);
  assert.match(output, /linear-axi documents view doc1 --full/);
  assert.doesNotMatch(output, /get_document/);
});

test("documents create returns compact mutation output", async () => {
  const output = await run(
    ["documents", "create", "--title", "Spec", "--team", "ENG", "--content", "Body"],
    runtime({
      listTools: async () => [{ name: "create_document" }],
      callTool: async () => ({ structuredContent: { id: "doc1", title: "Spec", content: "Body", url: "https://linear/doc1", extra: "hidden" } }),
    }),
  );

  assert.match(output, /document:/);
  assert.match(output, /id: doc1/);
  assert.match(output, /title: Spec/);
  assert.doesNotMatch(output, /extra/);
  assert.doesNotMatch(output, /help\[/);
  assert.doesNotMatch(output, /linear-axi documents view doc1/);
});

test("projects create wraps create_project and returns compact output", async () => {
  let seen;
  const output = await run(
    ["projects", "create", "--name", "Roadmap", "--team", "ENG", "--summary", "Plan"],
    runtime({
      listTools: async () => [{ name: "create_project" }],
      callTool: async (name, args) => {
        if (name === "list_projects") return { structuredContent: { projects: [] } };
        seen = { name, args };
        return { structuredContent: { id: "p1", name: "Roadmap", status: { name: "Planned" }, team: { name: "ENG" }, extra: "hidden" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "create_project", args: { name: "Roadmap", team: "ENG", summary: "Plan" } });
  assert.match(output, /project:/);
  assert.match(output, /id: p1/);
  assert.doesNotMatch(output, /extra/);
  assert.doesNotMatch(output, /help\[/);
});

test("projects create maps team when falling back to save_project create shape", async () => {
  let seen;
  const output = await run(
    ["projects", "create", "--name", "Roadmap", "--team", "ENG", "--summary", "Plan"],
    runtime({
      listTools: async () => [{ name: "save_project" }],
      callTool: async (name, args) => {
        if (name === "list_projects") return { structuredContent: { projects: [] } };
        seen = { name, args };
        return { structuredContent: { id: "p1", name: "Roadmap", status: { name: "Planned" }, teams: [{ name: "ENG" }] } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "save_project", args: { name: "Roadmap", summary: "Plan", setTeams: ["ENG"] } });
  assert.match(output, /project:/);
  assert.match(output, /team: ENG/);
  assert.doesNotMatch(output, /help\[/);
});

test("projects create maps team when retrying unknown create_project with save_project", async () => {
  const seen = [];
  await run(
    ["projects", "create", "--name", "Roadmap", "--teamId", "team-1", "--summary", "Plan"],
    runtime({
      callTool: async (name, args) => {
        if (name === "list_projects") return { structuredContent: { projects: [] } };
        seen.push({ name, args });
        if (name === "create_project") throw new Error("unknown tool: create_project");
        return { structuredContent: { id: "p1", name: "Roadmap" } };
      },
    }),
  );

  assert.deepEqual(seen, [
    { name: "create_project", args: { name: "Roadmap", teamId: "team-1", summary: "Plan" } },
    { name: "save_project", args: { name: "Roadmap", summary: "Plan", setTeams: ["team-1"] } },
  ]);
});

test("projects update maps team when update falls back to save_project", async () => {
  let seen;
  const updateOutput = await run(
    ["projects", "update", "--id", "p1", "--team", "ENG", "--summary", "Plan"],
    runtime({
      listTools: async () => [{ name: "save_project" }],
      callTool: async (name, args) => {
        if (name === "list_projects") return { structuredContent: { projects: [{ id: "p1", name: "Roadmap" }] } };
        seen = { name, args };
        return { structuredContent: { id: "p1", name: "Roadmap" } };
      },
    }),
  );

  assert.deepEqual(seen, { name: "save_project", args: { id: "p1", summary: "Plan", addTeams: ["ENG"] } });
  assert.doesNotMatch(updateOutput, /help\[/);
});

test("milestones create treats text-only mutation responses as errors", async () => {
  await assert.rejects(
    () => run(
      ["milestones", "create", "--project", "Roadmap", "--name", "Beta"],
      runtime({
        callTool: async () => ({ structuredContent: { text: "Milestone name is required" } }),
      }),
    ),
    (error) => {
      assert.equal(error.kind, "operational");
      assert.equal(error.exitCode, 1);
      assert.match(error.message, /Milestone name is required/);
      return true;
    },
  );
});

test("mutation text responses become structured errors", async () => {
  await assert.rejects(
    () => run(
      ["issues", "create", "--title", "Task", "--team", "ENG", "--project", "Wrong"],
      runtime({
        callTool: async (name) => {
          if (name === "list_issues") return { structuredContent: { issues: [] } };
          return { structuredContent: { text: "Project not in same team as issue" } };
        },
      }),
    ),
    /Project not in same team as issue/,
  );
});

test("issues create rejects an existing issue before mutation", async () => {
  let mutated = false;

  await assert.rejects(
    () => run(
      ["issues", "create", "--title", "Task", "--team", "ENG"],
      runtime({
        callTool: async (name) => {
          if (name === "list_issues") {
            return { structuredContent: { issues: [{ identifier: "LIN-1", title: "Task", team: { key: "ENG" } }] } };
          }
          mutated = true;
          return {};
        },
      }),
    ),
    (error) => {
      assert.equal(error.kind, "operational");
      assert.match(error.message, /issue already exists: LIN-1 Task/);
      assert.deepEqual(error.help, [
        "Run `linear-axi issues view LIN-1` to inspect the existing issue",
        'Run `linear-axi issues update --id LIN-1 --state "<state>"` to edit it',
        "Run `linear-axi issues create --title 'Task copy' --team ENG` to create a distinct issue",
      ]);
      return true;
    },
  );

  assert.equal(mutated, false);
});

test("issues update rejects a missing issue before mutation", async () => {
  const calls = [];

  await assert.rejects(
    () => run(
      ["issues", "update", "--id", "LIN-404", "--state", "Done"],
      runtime({
        listTools: async () => [{ name: "get_issue" }],
        callTool: async (name, args) => {
          calls.push({ name, args });
          return { structuredContent: {} };
        },
      }),
    ),
    (error) => {
      assert.equal(error.kind, "not_found");
      assert.equal(error.code, "NOT_FOUND");
      assert.match(error.message, /issue not found: LIN-404/);
      return true;
    },
  );

  assert.deepEqual(calls, [{ name: "get_issue", args: { id: "LIN-404" } }]);
});

test("projects create rejects an existing project before mutation", async () => {
  let mutated = false;

  await assert.rejects(
    () => run(
      ["projects", "create", "--name", "Roadmap", "--team", "ENG"],
      runtime({
        callTool: async (name) => {
          if (name === "list_projects") {
            return { structuredContent: { projects: [{ id: "p1", name: "Roadmap", team: { key: "ENG" } }] } };
          }
          mutated = true;
          return {};
        },
      }),
    ),
    /project already exists: p1 Roadmap/,
  );

  assert.equal(mutated, false);
});

test("projects update rejects a missing project before mutation", async () => {
  const calls = [];

  await assert.rejects(
    () => run(
      ["projects", "update", "--id", "missing", "--summary", "Plan"],
      runtime({
        callTool: async (name, args) => {
          calls.push({ name, args });
          return { structuredContent: { projects: [] } };
        },
      }),
    ),
    (error) => {
      assert.equal(error.kind, "not_found");
      assert.equal(error.code, "NOT_FOUND");
      assert.match(error.message, /project not found: missing/);
      return true;
    },
  );

  assert.deepEqual(calls, [{ name: "list_projects", args: { query: "missing", limit: 10 } }]);
});

test("resource group help is available before choosing a subcommand", async () => {
  const output = await run(["projects", "--help"], runtime({}));

  assert.match(output, /usage: linear-axi projects <subcommand> \[flags\]/);
  assert.match(output, /subcommands\[3\]:\n  list, create, update/);
  assert.match(output, /flags\{list\}:\n  --query <text>, --team <team>, --state <state>, --limit <n> \(default 50\), --fields <a,b,c>, --full/);
  assert.match(output, /flags\{create\}:\n  --name <text> \(required\), --team <team> or --teamId <id> \(required\)/);
  assert.match(output, /flags\{update\}:\n  --id <id> \(required\)/);
});

test("issue group help summarizes list view create and update flags", async () => {
  const output = await run(["issues", "--help"], runtime({}));

  assert.match(output, /flags\{list\}:/);
  assert.match(output, /--assignee <user>.*--fields <a,b,c>.*--full/);
  assert.match(output, /flags\{view\}:\n  --full \(show complete description without truncation\)/);
  assert.match(output, /flags\{create\}:\n  --title <text> \(required\), --team <team> \(required\)/);
  assert.match(output, /flags\{update\}:\n  --id <id> \(required\)/);
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

test("statuses list emits pagination hints", async () => {
  const output = await run(
    ["statuses", "list", "--team", "ENG", "--limit", "1", "--orderBy", "createdAt"],
    runtime({
      listTools: async () => [{ name: "list_issue_statuses" }],
      callTool: async () => ({
        structuredContent: {
          statuses: [{ id: "s1", name: "Todo", state: "unstarted" }],
          pageInfo: { hasNextPage: true, endCursor: "next-statuses" },
        },
      }),
    }),
  );

  assert.match(output, /count: 1 returned \(more available\)/);
  assert.match(output, /cursor: next-statuses/);
  assert.match(output, /statuses\[1\]\{id,name,state\}:/);
  assert.match(output, /Run `linear-axi statuses list --team ENG --limit 1 --orderBy createdAt --cursor next-statuses` to continue/);
});

test("statuses list does not fall back to status updates", async () => {
  await assert.rejects(
    () => run(
      ["statuses", "list", "--team", "ENG"],
      runtime({
        listTools: async () => [{ name: "get_status_updates" }],
      }),
    ),
    /Linear MCP server does not expose list_issue_statuses/,
  );
});

test("unsupported top-level resources use generic unknown-command handling without MCP calls", async () => {
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
    (error) => {
      assert.equal(error.kind, "usage");
      assert.match(error.message, /unknown command: releases/);
      assert.deepEqual(error.help, [
        "Run `linear-axi`",
        'Run `linear-axi init --project "<project>"`',
        "Run `linear-axi issues list`",
        "Run `linear-axi projects list`",
        "Run `linear-axi teams list`",
      ]);
      return true;
    },
  );

  assert.equal(called, false);
});

test("unsupported subcommands use generic unknown-subcommand handling without MCP calls", async () => {
  let called = false;
  const client = runtime({
    callTool: async () => {
      called = true;
      return {};
    },
  });

  await assert.rejects(
    () => run(["statuses", "save", "--type", "project", "--project", "Roadmap"], client),
    /unknown statuses command: save/,
  );
  await assert.rejects(
    () => run(["statuses", "delete", "--type", "project", "--id", "status-id"], client),
    /unknown statuses command: delete/,
  );
  await assert.rejects(
    () => run(["issues", "save", "--title", "Task"], client),
    /unknown issues command: save/,
  );
  await assert.rejects(
    () => run(["projects", "save", "--name", "Roadmap"], client),
    /unknown projects command: save/,
  );
  await assert.rejects(
    () => run(["documents", "save", "--title", "Spec"], client),
    /unknown documents command: save/,
  );
  await assert.rejects(
    () => run(["comments", "save", "--issue", "LIN-1"], client),
    /unknown comments command: save/,
  );
  await assert.rejects(
    () => run(["milestones", "save", "--project", "Roadmap"], client),
    /unknown milestones command: save/,
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
    cwd: client.cwd ?? process.cwd(),
    env: {},
    binPath: "/tmp/linear-axi",
    mcpUrl: "https://mcp.linear.app/mcp",
    stdout: client.stdout,
    client: { close: async () => {}, ...client },
  };
}

async function makeNoGitTempDir() {
  for (const parent of [tmpdir(), "/var/tmp", "/dev/shm"]) {
    if (await hasGitAncestor(parent)) continue;
    try {
      return await mkdtemp(join(parent, "linear-axi-no-git-"));
    } catch {
      // Try the next conventional temp directory.
    }
  }
  return null;
}

async function hasGitAncestor(path) {
  let current = resolve(path);
  while (true) {
    try {
      await stat(join(current, ".git"));
      return true;
    } catch {
      // Keep walking.
    }
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}
