import test from "node:test";
import assert from "node:assert/strict";

import { createSkillMarkdown, extractCommandsBlock, SKILL_DESCRIPTION } from "../src/skill.js";

test("skill markdown is installable and points agents at npx linear-axi", () => {
  const skill = createSkillMarkdown();

  assert.match(skill, /^---\nname: linear-axi\n/m);
  assert.match(skill, new RegExp(`description: ${JSON.stringify(SKILL_DESCRIPTION).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(skill, /user-invocable: false/);
  assert.match(skill, /npx -y linear-axi/);
  assert.match(skill, /auth login/);
  assert.doesNotMatch(skill, /linear-axi update/);
  assert.doesNotMatch(skill, /gh-axi/);
});

test("skill command block is generated from top help", () => {
  assert.equal(
    extractCommandsBlock(),
    `commands[12]:
  (none)=dashboard, init, auth, issues, projects, teams, users, comments, documents, milestones, cycles, statuses, labels`,
  );
});
