import { fieldHint } from "../lib/linear-format.js";
import { DEFAULT_LIMIT } from "./shared.js";

export function topHelp() {
  return `usage: linear-axi [command] [args] [flags]
commands[12]:
  (none)=dashboard, init, auth, issues, projects, teams, users, comments, documents, milestones, cycles, statuses, labels
flags[3]:
  --help, -h, -v/-V/--version
examples:
  linear-axi
  linear-axi init --project "Roadmap"
  linear-axi auth login
  linear-axi issues list --assignee me --all-projects --limit 25
  linear-axi projects create --name "Roadmap" --team ENG
  linear-axi documents view <id>
  linear-axi issues update --id LIN-123 --state Done
  linear-axi comments create --issue LIN-123 --body "Ready for review."
  linear-axi update --check
env[5]:
  LINEAR_AXI_MCP_URL, LINEAR_AXI_MCP_TOKEN, LINEAR_MCP_TOKEN, LINEAR_AXI_AUTH_FILE, CODEX_CONFIG
`;
}

export function initHelp() {
  return `usage: linear-axi init --project <project> [--force]
description: Validate and save the current Git repository's default Linear project in .linear-project.
flags:
  --project <project>  Linear project id, name, or slug to use by default
  --force             replace an existing .linear-project value
examples:
  linear-axi init --project "Roadmap"
  linear-axi init --project p_123 --force
`;
}

export function groupHelp(name, subcommands) {
  const examples = {
    issues: [
      "linear-axi issues list --assignee me --all-projects --limit 25",
      "linear-axi issues view LIN-123",
      'linear-axi issues create --title "Fix auth" --team ENG',
      "linear-axi issues update --id LIN-123 --state Done",
      "linear-axi issues delete --id LIN-123",
    ],
    projects: [
      "linear-axi projects list --limit 25",
      'linear-axi projects create --name "Roadmap" --team ENG',
      'linear-axi projects update --id <id> --summary "Updated scope"',
      'linear-axi issues create --title "Task" --team ENG --project "Roadmap"',
    ],
    documents: [
      "linear-axi documents list --all-projects --limit 25",
      "linear-axi documents view <id>",
      'linear-axi documents create --title "Spec" --team ENG --content-file spec.md',
      'linear-axi documents update --id <id> --content "Updated"',
    ],
    comments: [
      "linear-axi comments list --issue LIN-123",
      'linear-axi comments create --issue LIN-123 --body "Ready for review."',
      "linear-axi comments delete --id <id>",
    ],
    auth: [
      "linear-axi auth login",
      "linear-axi auth login --manual",
      "linear-axi auth finish --code <code>",
      "linear-axi auth logout",
    ],
    milestones: [
      'linear-axi milestones list --project "Roadmap"',
      'linear-axi milestones view --project "Roadmap" "Beta"',
      'linear-axi milestones create --project "Roadmap" --name "Beta"',
      'linear-axi milestones update --project "Roadmap" --id <id> --targetDate <yyyy-mm-dd>',
      'linear-axi milestones delete --project "Roadmap" --id <id>',
    ],
    cycles: ["linear-axi cycles list --team ENG --type current"],
    statuses: ["linear-axi statuses list --team ENG"],
  };
  const flags = groupFlagHelp(name);
  return `usage: linear-axi ${name} <subcommand> [flags]
subcommands[${subcommands.length}]:
  ${subcommands.join(", ")}
${flags ? `${flags}\n` : ""}examples:
${(examples[name] ?? [`linear-axi ${name} list`]).map((example) => `  ${example}`).join("\n")}
`;
}

export function listAliasHelp(alias) {
  const projectScopedList = ["issues", "documents"].includes(alias);
  const projectScopeHelp = ["issues", "documents"].includes(alias)
    ? `  --all-projects
`
    : "";
  const projectScopeNote = ["issues", "documents"].includes(alias)
    ? `notes:
  issues and documents require a valid repo default project from .linear-project, --project, or --all-projects.
`
    : "";
  return `usage: linear-axi ${alias} list [filters] [--full]
flags:
  --limit <n> default ${DEFAULT_LIMIT}
  --cursor <cursor>
  --query <text>
  --name <name>
  --team <name-or-id>
  --teamId <team-id>
  --state <name-or-type>
  --assignee <user>
  --delegate <user>
  --member <user>
  --project <project>
${projectScopeHelp}  --cycle <cycle>
  --label <label>
  --parentId <issue-id>
  --priority <number>
  --createdAt <filter>
  --updatedAt <filter>
  --orderBy createdAt|updatedAt
  --includeArchived
  --includeMembers
  --includeMilestones
  --includeStages
  --includeTeams
  --fields <comma-separated-fields>
  --full
examples:
  linear-axi ${alias} list ${projectScopedList ? "--all-projects " : ""}--limit 25
  linear-axi ${alias} list --fields ${fieldHint(alias)}
  linear-axi ${alias} list --query "auth" --full
${projectScopeNote}`;
}

export function commentListHelp() {
  return `usage: linear-axi comments list --issue <id> [--full]
flags:
  --limit <n> default ${DEFAULT_LIMIT}
  --cursor <cursor>
  --orderBy createdAt|updatedAt
  --full
examples:
  linear-axi comments list --issue LIN-123
  linear-axi comments list --issue LIN-123 --full
`;
}

export function commentCreateHelp() {
  return `usage: linear-axi comments create --issue <id> (--body <text> | --body-file <path>)
examples:
  linear-axi comments create --issue LIN-123 --body "Ready for review."
`;
}

export function commentDeleteHelp() {
  return `usage: linear-axi comments delete --id <id>
description: Delete a Linear comment by id.
examples:
  linear-axi comments delete --id <id>
`;
}

export function documentCreateHelp() {
  return `usage: linear-axi documents create --title <title> [parent] [--content <markdown> | --content-file <path>]
flags:
  --title <title>
  --team <team>
  --project <project>
  --issue <issue>
  --initiative <initiative>
  --cycle <cycle>
  --color <color>
  --icon <icon>
  --content <markdown>
  --content-file <path>
examples:
  linear-axi documents create --title "Spec" --team ENG --content-file spec.md
`;
}

export function documentUpdateHelp() {
  return `usage: linear-axi documents update --id <id> [fields]
flags:
  --id <id>
  --title <title>
  --team <team>
  --project <project>
  --issue <issue>
  --initiative <initiative>
  --cycle <cycle>
  --color <color>
  --icon <icon>
  --content <markdown>
  --content-file <path>
examples:
  linear-axi documents update --id <id> --content "Updated"
`;
}

export function documentViewHelp() {
  return `usage: linear-axi documents view <id> [--full]
examples:
  linear-axi documents view <id>
  linear-axi documents view <id> --full
`;
}

export function projectCreateHelp() {
  return `usage: linear-axi projects create --name <name> --team <team> [fields]
flags:
  --name <name>
  --team <team>
  --teamId <team-id>
  --summary <text>
  --description <markdown>
  --state <state>
  --status <status>
  --lead <user>
  --startDate <yyyy-mm-dd>
  --targetDate <yyyy-mm-dd>
examples:
  linear-axi projects create --name "Roadmap" --team ENG
`;
}

export function projectUpdateHelp() {
  return `usage: linear-axi projects update --id <id> [fields]
flags:
  --id <id>
  --name <name>
  --team <team>
  --teamId <team-id>
  --summary <text>
  --description <markdown>
  --state <state>
  --status <status>
  --lead <user>
  --startDate <yyyy-mm-dd>
  --targetDate <yyyy-mm-dd>
examples:
  linear-axi projects update --id <id> --summary "Updated scope"
`;
}

export function milestoneListHelp() {
  return `usage: linear-axi milestones list [--project <project>] [--full]
flags:
  --project <project>  overrides the repo default project
  --full
examples:
  linear-axi milestones list
  linear-axi milestones list --project "Roadmap"
`;
}

export function milestoneViewHelp() {
  return `usage: linear-axi milestones view [--project <project>] <milestone>
flags:
  --project <project>  overrides the repo default project
examples:
  linear-axi milestones view "Beta"
  linear-axi milestones view --project "Roadmap" "Beta"
`;
}

export function milestoneCreateHelp() {
  return `usage: linear-axi milestones create [--project <project>] --name <name>
flags:
  --name <name>
  --project <project>  overrides the repo default project
  --description <markdown>
  --targetDate <yyyy-mm-dd>
examples:
  linear-axi milestones create --name "Beta"
  linear-axi milestones create --project "Roadmap" --name "Beta"
`;
}

export function milestoneUpdateHelp() {
  return `usage: linear-axi milestones update --project <project> --id <id> [fields]
flags:
  --id <id>
  --name <name>
  --project <project>  overrides the repo default project
  --description <markdown>
  --targetDate <yyyy-mm-dd>
examples:
  linear-axi milestones update --project "Roadmap" --id <id> --targetDate <yyyy-mm-dd>
`;
}

export function milestoneDeleteHelp() {
  return `usage: linear-axi milestones delete --project <project> --id <id>
description: Delete a Linear milestone by id.
flags:
  --id <id>
  --project <project>  overrides the repo default project
examples:
  linear-axi milestones delete --project "Roadmap" --id <id>
`;
}

export function cycleListHelp() {
  return `usage: linear-axi cycles list --team <team> [--type current|previous|next|all] [--full]
flags:
  --team <team>
  --teamId <team-id>
  --type current|previous|next|all
  --full
examples:
  linear-axi cycles list --team ENG --type current
`;
}

export function statusListHelp() {
  return `usage: linear-axi statuses list --team <team> [--full]
flags:
  --team <team>
  --teamId <team-id>
  --type <type>
  --project <project>
  --initiative <initiative>
  --user <user>
  --limit <n>
  --cursor <cursor>
  --orderBy createdAt|updatedAt
  --createdAt <filter>
  --updatedAt <filter>
  --includeArchived
  --full
examples:
  linear-axi statuses list --team ENG
  linear-axi statuses list --team ENG --full
`;
}

export function issueViewHelp() {
  return `usage: linear-axi issues view <id> [--full]
examples:
  linear-axi issues view LIN-123
  linear-axi issues view LIN-123 --full
`;
}

export function issueCreateHelp() {
  return `usage: linear-axi issues create --title <title> --team <team> [fields]
flags:
  --title <title>
  --team <team>
  --state <state>
  --assignee <user>
  --project <project>
  --cycle <cycle>
  --parentId <issue-id>
  --label <label> repeatable
  --priority <number>
  --estimate <number>
  --dueDate <yyyy-mm-dd>
  --description <markdown>
  --description-file <path>
examples:
  linear-axi issues create --title "Fix auth" --team ENG
  linear-axi issues create --title "Task" --team ENG --project "Roadmap"
`;
}

export function issueUpdateHelp() {
  return `usage: linear-axi issues update --id <id> [fields]
flags:
  --id <id>
  --title <title>
  --team <team>
  --state <state>
  --assignee <user>
  --project <project>
  --cycle <cycle>
  --parentId <issue-id>
  --label <label> repeatable
  --priority <number>
  --estimate <number>
  --dueDate <yyyy-mm-dd>
  --description <markdown>
  --description-file <path>
examples:
  linear-axi issues update --id LIN-123 --state Done
`;
}

export function issueDeleteHelp() {
  return `usage: linear-axi issues delete --id <id>
description: Delete a Linear issue by id.
examples:
  linear-axi issues delete --id LIN-123
`;
}

export function authLoginHelp() {
  return `usage: linear-axi auth login [--manual] [--timeout <ms>]
flags:
  --manual print the authorization URL and exit so you can paste the code into auth finish
  --timeout <ms> default 300000
examples:
  linear-axi auth login
  linear-axi auth login --manual
`;
}

export function authFinishHelp() {
  return `usage: linear-axi auth finish --code <code>
examples:
  linear-axi auth finish --code <code>
`;
}

export function authLogoutHelp() {
  return `usage: linear-axi auth logout
description: Remove saved Linear MCP OAuth credentials without changing bearer-token environment variables.
examples:
  linear-axi auth logout
`;
}

const GROUP_FLAG_HELP = {
  issues: [
    "flags{list}:\n  --assignee <user>, --state <state>, --team <team>, --project <project>, --all-projects, --query <text>, --label <label>, --limit <n> (default 50), --fields <a,b,c>, --full",
    "flags{view}:\n  --full (show complete description without truncation)",
    "flags{create}:\n  --title <text> (required), --team <team> (required), --description <markdown> or --description-file <path>, --state <state>, --assignee <user>, --project <project>, --label <label>",
    "flags{update}:\n  --id <id> (required), --title <text>, --description <markdown> or --description-file <path>, --state <state>, --assignee <user>, --project <project>, --label <label>",
    "flags{delete}:\n  --id <id> (required)",
  ],
  projects: [
    "flags{list}:\n  --query <text>, --team <team>, --state <state>, --limit <n> (default 50), --fields <a,b,c>, --full",
    "flags{create}:\n  --name <text> (required), --team <team> or --teamId <id> (required), --summary <text>, --description <markdown>, --status <status>, --lead <user>",
    "flags{update}:\n  --id <id> (required), --name <text>, --team <team> or --teamId <id>, --summary <text>, --description <markdown>, --status <status>, --lead <user>",
  ],
  documents: [
    "flags{list}:\n  --project <project>, --all-projects, --query <text>, --team <team>, --limit <n> (default 50), --fields <a,b,c>, --full",
    "flags{view}:\n  --full (show complete content without truncation)",
    "flags{create}:\n  --title <text> (required), --team <team>, --project <project>, --issue <issue>, --content <markdown> or --content-file <path>",
    "flags{update}:\n  --id <id> (required), --title <text>, --team <team>, --project <project>, --issue <issue>, --content <markdown> or --content-file <path>",
  ],
  comments: [
    "flags{list}:\n  --issue <id> (required), --limit <n> (default 50), --cursor <cursor>, --full",
    "flags{create}:\n  --issue <id> (required), --body <text> or --body-file <path> (required)",
    "flags{delete}:\n  --id <id> (required)",
  ],
  milestones: [
    "flags{list}:\n  --project <project> (required), --full",
    "flags{view}:\n  --project <project> (required), <milestone>",
    "flags{create}:\n  --name <text> (required), --project <project>",
    "flags{update}:\n  --id <id> (required), --project <project> (required), --targetDate <yyyy-mm-dd>",
    "flags{delete}:\n  --id <id> (required), --project <project>",
  ],
};

function groupFlagHelp(name) {
  return GROUP_FLAG_HELP[name]?.join("\n") ?? "";
}
