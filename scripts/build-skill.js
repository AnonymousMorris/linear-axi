import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createSkillMarkdown } from "../src/skill.js";

const target = new URL("../skills/linear-axi/SKILL.md", import.meta.url);
const expected = createSkillMarkdown();
const check = process.argv.includes("--check");

if (check) {
  let actual = null;
  try {
    actual = await readFile(target, "utf8");
  } catch {
    // Missing file falls through to the mismatch branch below.
  }

  if (actual !== expected) {
    console.error("skills/linear-axi/SKILL.md is out of date. Run `npm run build:skill` and commit the result.");
    process.exit(1);
  }

  console.log("skills/linear-axi/SKILL.md is up to date.");
} else {
  await mkdir(new URL("../skills/linear-axi/", import.meta.url), {
    recursive: true,
  });
  await writeFile(target, expected);
  console.log(`Wrote ${fileURLToPath(target)}`);
}
