import test from "node:test";
import assert from "node:assert/strict";
import { renderToon } from "../src/format.js";

test("renders tabular arrays with counts", () => {
  assert.equal(
    renderToon({
      issues: [
        { id: "LIN-1", title: "Fix auth", state: "Todo" },
        { id: "LIN-2", title: "Ship, docs", state: "Done" },
      ],
    }),
    'issues[2]{id,title,state}:\n  LIN-1,Fix auth,Todo\n  LIN-2,"Ship, docs",Done\n',
  );
});

test("quotes ambiguous scalar values", () => {
  assert.equal(renderToon({ value: "true", empty: "", text: "hello" }), 'value: "true"\nempty: ""\ntext: hello\n');
});

test("renders help arrays as multiline hints", () => {
  assert.equal(
    renderToon({ help: ["Run `linear-axi issues list`", "Run `linear-axi auth login`"] }),
    "help[2]:\n  Run `linear-axi issues list`\n  Run `linear-axi auth login`\n",
  );
});
