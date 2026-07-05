import { topHelp } from "./commands/help.js";

export const SKILL_DESCRIPTION =
  "Operate Linear through the linear-axi CLI - issues, projects, teams, users, comments, documents, " +
  "milestones, cycles, statuses, labels, auth, and repo project setup. Use whenever a task touches " +
  "Linear: listing or creating issues, updating project work, reading documents, or managing comments.";

export const SKILL_AUTHOR = "Morris";
export const HERMES_TAGS = ["linear", "issues", "projects", "planning"];
export const HERMES_CATEGORY = "project-management";
export const DESCRIPTION =
  "Agent ergonomic wrapper around the configured Linear MCP server. Prefer this over raw Linear MCP calls for Linear operations.";

function yamlDoubleQuote(value) {
  return JSON.stringify(value);
}

export function extractCommandsBlock() {
  const match = topHelp().match(/^(commands\[\d+\]:\n(?: {2}.*\n)+)/m);
  if (!match) {
    throw new Error("Could not find commands block in top help");
  }
  return match[1].trimEnd();
}

export function createSkillMarkdown() {
  return `---
name: linear-axi
description: ${yamlDoubleQuote(SKILL_DESCRIPTION)}
user-invocable: false
author: ${SKILL_AUTHOR}
metadata:
  hermes:
    tags: [${HERMES_TAGS.join(", ")}]
    category: ${HERMES_CATEGORY}
---

# linear-axi

${DESCRIPTION}

You do not need linear-axi installed globally - invoke it with \`npx -y linear-axi <command>\`.
If linear-axi output shows a follow-up command starting with \`linear-axi\`, run it as \`npx -y linear-axi ...\` instead.

linear-axi uses the configured Linear MCP server. The default remote endpoint uses OAuth; if authorization is required, run \`npx -y linear-axi auth login\`.

## When to use

Use linear-axi whenever a task touches Linear: listing, viewing, creating, or updating issues; browsing or editing projects and documents; creating or listing comments; checking teams, users, labels, cycles, milestones, or statuses; or binding the current repo to a default Linear project.

## Workflow

1. Run \`npx -y linear-axi\` with no arguments for a dashboard of the current repo - project, assigned issue count, connection status, and suggested next commands.
2. Bind a repository to a Linear project with \`npx -y linear-axi init --project "<project>"\`; project-scoped commands use \`.linear-project\` automatically after that.
3. Drill in command-first: \`issues list\`, \`issues view <id>\`, \`projects list\`, \`documents view <id>\`, \`comments list --issue <id>\`, and so on.
4. Add \`--fields\` for columns, \`--cursor\` for pagination, and \`--full\` only when complete content is needed.
5. Every response ends with contextual next-step hints under \`help:\` - follow them.

## Commands

\`\`\`
${extractCommandsBlock()}
\`\`\`

Installed copies also inherit the SDK built-in \`update\` command.
Run \`linear-axi update --check\` to compare the installed version with npm, or \`linear-axi update\` to upgrade.
When using \`npx -y linear-axi\`, npx already resolves the package on demand.

Run \`npx -y linear-axi --help\` for global flags, \`npx -y linear-axi <resource> --help\` for grouped subcommands, or \`npx -y linear-axi <resource> <action> --help\` for focused flags.

## Tips

- Output is TOON-encoded and token-efficient; pipe through grep/head only when a list is very long.
- Mutations validate targets and report compact results; re-running a failed mutation is safe.
- For multi-line markdown descriptions, comments, or documents, write the text to a UTF-8 file and pass \`--description-file <path>\`, \`--body-file <path>\`, or \`--content-file <path>\`.
- Repository project defaults apply to issue, document, and milestone commands unless \`--project <project>\` overrides them.
`;
}
