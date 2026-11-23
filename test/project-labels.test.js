import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/cli.js";

function runtime(callTool, tools) {
  return {
    cwd: process.cwd(),
    env: {},
    client: {
      callTool,
      ...(tools ? { listTools: async () => tools.map((name) => ({ name })) } : {}),
    },
  };
}

const result = (data) => ({ structuredContent: data });

for (const args of [
  ["projects", "labels", "--help"],
  ["projects", "labels", "list", "--help"],
  ["projects", "labels", "create", "--help"],
  ["projects", "labels", "update", "--help"],
]) {
  test(`${args.join(" ")} is available offline`, async () => {
    const output = await run(args, runtime(() => assert.fail("unexpected MCP call")));
    assert.match(output, /projects labels/);
  });
}

test("project help advertises labels and replacement semantics", async () => {
  const rt = runtime(() => assert.fail("unexpected MCP call"));
  assert.match(await run(["projects", "--help"], rt), /list, create, update, labels/);
  for (const action of ["create", "update"]) {
    assert.match(await run(["projects", action, "--help"], rt), /replaces the entire label set/);
  }
  assert.match(await run(["projects", "update", "--help"], rt), /--clear-labels/);
});

test("project labels list forwards filters and keeps pagination context", async () => {
  const output = await run([
    "projects", "labels", "list", "--team", "ENG", "--name", "Audience",
    "--includeGroups", "--includeArchived=false", "--limit", "2", "--cursor", "first",
    "--orderBy", "createdAt", "--fields", "id,name,isGroup",
  ], runtime(async (name, args) => {
    assert.equal(name, "list_project_labels");
    assert.deepEqual(args, { limit: 2, cursor: "first", name: "Audience", team: "ENG", orderBy: "createdAt", includeArchived: false, includeGroups: true });
    return result({ labels: [{ id: "g1", name: "Audience", isGroup: true }], hasNextPage: true, cursor: "next-page" });
  }));
  assert.match(output, /g1,Audience,true/);
  assert.match(output, /cursor: next-page/);
  assert.match(output, /projects labels list .*--team ENG.*--includeGroups.*--fields 'id,name,isGroup' --cursor next-page/);
  assert.match(output, /--includeArchived=false/);
});

test("project labels list defaults to 50 and displays group metadata", async () => {
  const output = await run(["projects", "labels", "list"], runtime(async (name, args) => {
    assert.equal(name, "list_project_labels");
    assert.deepEqual(args, { limit: 50 });
    return result({ labels: [{ id: "g1", name: "Audience", isGroup: true, groupType: "singleSelect" }] });
  }));
  assert.match(output, /id,name,isGroup,parent,groupType/);
  assert.match(output, /singleSelect/);
});

test("project labels list --full preserves metadata and false flags", async () => {
  const output = await run(["projects", "labels", "list", "--full", "--includeGroups=false", "--includeArchived"], runtime(async (_name, args) => {
    assert.deepEqual(args, { limit: 50, includeGroups: false, includeArchived: true });
    return result({ labels: [{ id: "l1", description: "Full text", teamId: "t1" }], hasNextPage: false });
  }));
  assert.match(output, /id,description,teamId/);
  assert.match(output, /l1,Full text,t1/);
});

test("issue label listing remains separate", async () => {
  await run(["labels", "list"], runtime(async (name) => {
    assert.equal(name, "list_issue_labels");
    return result({ labels: [] });
  }));
});

for (const [flags, expected] of [
  [["--name", "Audience", "--isGroup", "--groupType", "singleSelect", "--teamId", "team-uuid"], { name: "Audience", isGroup: true, groupType: "singleSelect", teamId: "team-uuid" }],
  [["--name", "internal", "--parent", "group-uuid", "--description", "Internal consumers", "--color", "#123456"], { name: "internal", parent: "group-uuid", description: "Internal consumers", color: "#123456" }],
]) {
  test(`project labels create forwards ${flags.join(" ")}`, async () => {
    const output = await run(["projects", "labels", "create", ...flags], runtime(async (name, args) => {
      assert.equal(name, "save_project_label");
      assert.deepEqual(args, expected);
      return result({ id: "new-label", ...args });
    }, ["save_project_label"]));
    assert.match(output, /id: new-label/);
  });
}

test("project labels update preserves false and omitted values", async () => {
  await run(["projects", "labels", "update", "--id", "l1", "--isGroup=false", "--name", "renamed"], runtime(async (name, args) => {
    assert.equal(name, "save_project_label");
    assert.deepEqual(args, { id: "l1", name: "renamed", isGroup: false });
    return result(args);
  }));
  await run(["projects", "labels", "update", "--id", "g1", "--groupType", "multiSelect"], runtime(async (_name, args) => {
    assert.deepEqual(args, { id: "g1", groupType: "multiSelect" });
    return result(args);
  }));
});

for (const [flags, error] of [
  [["create"], /requires --name/],
  [["create", "--id", "l1", "--name", "test"], /does not accept --id/],
  [["update", "--name", "test"], /requires --id/],
  [["create", "--name", "Audience", "--isGroup=maybe"], /must be true or false/],
  [["create", "--name", "Audience", "--groupType", "wrong"], /must be singleSelect or multiSelect/],
  [["update", "--id", "l1", "--isGroup=false", "--groupType", "singleSelect"], /cannot be used with/],
  [["delete", "--id", "l1"], /unknown projects labels command/],
  [["create", "--name", "internal", "--team", "ENG"], /unknown project label flag: --team/],
  [["create", "--name", "internal", "--teamId", ""], /--teamId requires a non-empty value/],
  [["create", "--name", "--isGroup"], /--name requires a non-empty value/],
  [["create", "--name", "   "], /--name requires a non-empty value/],
  [["create", "internal"], /require named flags/],
  [["list", "--query", "Audience"], /unknown project label flag/],
]) {
  test(`invalid project label command fails before MCP: ${flags.join(" ")}`, async () => {
    await assert.rejects(run(["projects", "labels", ...flags], runtime(() => assert.fail("unexpected MCP call"))), error);
  });
}

test("unavailable label tools fail explicitly without issue-label fallback", async () => {
  for (const flags of [["list"], ["create", "--name", "internal"]]) {
    await assert.rejects(run(["projects", "labels", ...flags], runtime(() => assert.fail("unexpected MCP call"), ["list_issue_labels"])), /does not expose/);
  }
});

for (const flags of [["list"], ["create", "--name", "internal"], ["update", "--id", "l1", "--name", "internal"]]) {
  test(`project label ${flags[0]} errors are not reported as successes`, async () => {
    await assert.rejects(run(["projects", "labels", ...flags], runtime(async () => ({
      content: [{ type: "text", text: "Permission denied" }], isError: true,
    }))), /Permission denied/);
  });
}

for (const action of ["create", "update"]) {
  for (const tool of [action === "create" ? "create_project" : "update_project", "save_project"]) {
    test(`projects ${action} forwards repeated labels through ${tool}`, async () => {
      const flags = action === "create" ? ["--name", "Roadmap", "--team", "ENG"] : ["--id", "p1"];
      await run(["projects", action, ...flags, "--label", "internal", "--label=l2"], runtime(async (name, args) => {
        if (name === "list_projects") return result({ projects: action === "create" ? [] : [{ id: "p1", name: "Roadmap" }] });
        assert.equal(name, tool);
        assert.deepEqual(args.labels, ["internal", "l2"]);
        if (action === "create") assert.deepEqual(tool === "save_project" ? args.setTeams : args.team, tool === "save_project" ? ["ENG"] : "ENG");
        return result({ id: "p1", name: "Roadmap" });
      }, ["list_projects", tool]));
    });
  }
}

for (const [flags, expected] of [
  [["--summary", "New summary"], undefined],
  [["--clear-labels"], []],
  [["--clear-labels=false", "--summary", "New summary"], undefined],
]) {
  test(`project update preserves label intent: ${flags.join(" ")}`, async () => {
    await run(["projects", "update", "--id", "p1", ...flags], runtime(async (name, args) => {
      if (name === "list_projects") return result({ projects: [{ id: "p1", name: "Roadmap" }] });
      assert.equal(name, "save_project");
      assert.deepEqual(args.labels, expected);
      assert.equal(Object.hasOwn(args, "labels"), expected !== undefined);
      return result({ id: "p1", name: "Roadmap" });
    }, ["list_projects", "save_project"]));
  });
}

for (const flags of [
  ["--clear-labels", "--label", "internal"],
  ["--label", ""],
  ["--label", "   "],
  ["--label", "--clear-labels"],
]) {
  test(`invalid project labels fail before any MCP call: ${flags.join(" ")}`, async () => {
    await assert.rejects(run(["projects", "update", "--id", "p1", ...flags], runtime(() => assert.fail("unexpected MCP call"))), /--label/);
  });
}
