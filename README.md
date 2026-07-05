# linear-axi

`linear-axi` is a command-line interface that lets coding agents work with Linear more easily than an MCP server by re-exporting the same functionality behind a new interface designed with care. 

The project follows the [AXI](https://axi.md/) pattern: an Agent eXperience. 

![linear-axi terminal demo](docs/demo.gif)

## Install

Install the linear-axi skill in the [Agent Skills](https://agentskills.io) format with the [Vercel skill installer](https://github.com/vercel-labs/skills):

```sh
npx skills add AnonymousMorris/linear-axi -g
```

That is enough for agents that support skills. The skill teaches the agent to run `linear-axi` through `npx -y linear-axi`, so the CLI is resolved on demand. You still need access to a Linear MCP endpoint. The default endpoint uses OAuth; run `npx -y linear-axi auth login` when authorization is needed, or use the manual flow documented below for headless environments.

`-g` installs the skill globally. Drop `-g` to install it only for the current project.

To install the skill from a local checkout before the GitHub repository is public or updated, run:

```sh
npx skills add . -g
```

To verify discovery without installing anything:

```sh
npx skills add . --skill linear-axi --list
```

To install the CLI directly from a checkout:

```sh
npm install
npm link
```

## Configuration

By default, the CLI reads the Linear MCP URL from `[mcp_servers.linear].url` in `~/.codex/config.toml` and falls back to `https://mcp.linear.app/mcp` (current official remote MCP by linear).

The default remote Linear MCP endpoint uses OAuth. Run `linear-axi auth login`, open the returned URL, and the CLI will capture the localhost callback and save tokens automatically. In a headless environment, run `linear-axi auth login --manual`, open the URL, copy the `code` from the failed localhost redirect, then finish with `linear-axi auth finish --code <code>`. Run `linear-axi auth logout` to remove the saved OAuth state; it is safe to rerun and does not unset bearer-token environment variables. Set `LINEAR_AXI_MCP_URL` to use a different MCP endpoint, or `CODEX_CONFIG` to read the URL from another Codex config file. Set `LINEAR_AXI_MCP_TOKEN` or `LINEAR_MCP_TOKEN` only when your endpoint expects a bearer token. Set `LINEAR_AXI_AUTH_FILE` to store OAuth state somewhere other than `${XDG_CONFIG_HOME:-~/.config}/linear-axi/oauth.json`.

## Project setup

Run this once from a Git repository to bind the repo to its Linear project:

```sh
linear-axi init --project "Roadmap"
```

This writes `.linear-project` at the Git root as JSON, for example `{ "project": "Roadmap" }`. After that, project-scoped commands such as `linear-axi`, `linear-axi issues list`, `linear-axi issues create ...`, `linear-axi documents list`, `linear-axi documents create ...`, and `linear-axi milestones list` use that project automatically. Pass `--project <project>` on a project-scoped command to override the repo default once. Use `--all-projects` on issue and document list commands when you intentionally want a workspace-wide list. Re-run `linear-axi init --project "<project>" --force` to replace the saved value.

## Commands

The CLI is organized as `linear-axi <resource> <action>`. Internally, each action forwards to the matching Linear MCP tool, then formats the result for agents. Run `linear-axi --help` for the top-level command list, `linear-axi <resource> --help` for grouped subcommand flags, or `linear-axi <resource> <action> --help` for the focused flag reference.

```sh
linear-axi
linear-axi init --project "Roadmap"
linear-axi auth login
linear-axi auth login --manual
linear-axi auth finish --code <code>
linear-axi auth logout
linear-axi issues list --assignee me --limit 25
linear-axi issues list --assignee me --all-projects
linear-axi issues list --fields id,title,state,assignee
linear-axi issues view LIN-123 --full
linear-axi issues create --title "Fix auth" --team ENG --project "Roadmap"
linear-axi issues update --id LIN-123 --state Done
linear-axi projects list --query roadmap
linear-axi projects create --name "Roadmap" --team ENG
linear-axi projects update --id <id> --summary "Updated scope"
linear-axi teams list
linear-axi users list --query morris
linear-axi labels list --team ENG
linear-axi comments list --issue LIN-123
linear-axi comments create --issue LIN-123 --body "Ready for review."
linear-axi documents view <id>
linear-axi documents create --title "Spec" --team ENG --content-file spec.md
linear-axi documents update --id <id> --content "Updated"
linear-axi milestones list --project "Roadmap"
linear-axi milestones view --project "Roadmap" "Beta"
linear-axi milestones create --project "Roadmap" --name "Beta"
linear-axi milestones update --project "Roadmap" --id <id> --targetDate <yyyy-mm-dd>
linear-axi cycles list --team ENG --type current
linear-axi statuses list --team ENG
```

## Output behavior

The default `linear-axi` dashboard shows setup hints until the current Git repo is bound to a Linear project. Use `projects list` to find the project name, then save it with `init`.

```bash
> linear-axi
description: Linear project dashboard
workspace: Acme
project: not initialized
repo: my-repo
status: No default Linear project is configured for this repository
help[4]:
  Run `linear-axi projects list` to find Linear projects
  Run `linear-axi init --project "<project>"` to bind this repo
  Run `linear-axi issues list --assignee me --all-projects` to list your assigned issues across Linear
  Run `linear-axi <command> <subcommand>` — commands: auth, issues, projects, teams, users, comments, documents
```

After initialization, the dashboard shows the configured repo project plus a project-scoped count of issues assigned to you instead of listing issue rows.

```bash
> linear-axi
workspace: Acme
project: Roadmap
repo: my-repo
issues: 3 assigned to me in project
```

List commands use a compact schema by default. Empty lists render as `items: []`, counts render as `0 returned` or `1 returned (more available)`, and general resource lists include field-selection hints. Project and issue lists put status first, group matching statuses together, prioritize In Progress/Started before Planned/Todo and Backlog, and keep ids last. Comments lists suggest creating a comment and add a `--full` hint only when body previews are truncated; statuses lists suggest `--full`. Issues, projects, teams, users, documents, labels, comments, and statuses include cursor hints when more results are available. The continuation hint preserves active filters, selected fields, limits, and shell quoting. Add `--fields id,name,status` to choose fields, `--cursor <cursor>` to resume a page, or `--full` when you need the complete MCP response. Hints are reserved for discovery, pagination, truncation, required follow-up steps such as OAuth, and error recovery.

```bash
> linear-axi projects list --query roadmap --limit 25
count: 1 returned (more available)
cursor: next-page
projects[1]{status,name,id}:
  In Progress,Roadmap,p1
help[2]:
  Run `linear-axi projects list --fields id,name,status` to choose fields
  Run `linear-axi projects list --limit 25 --query roadmap --cursor next-page` to continue
```

Detail commands such as `issues view <id>` and `documents view <id>` return one item. Compact detail views include long-text previews and suggest `--full` only when content is truncated; `issues view all` is rejected because detail views require one issue id. Missing detail targets and failed pre-mutation existence checks return structured `NOT_FOUND` errors with search or create hints. Issue, project, document, and comment mutations return compact success objects with the id, title/name, URL, and no success hints except the conditional `comments list --full` escape hatch when a created comment body preview is truncated. Use `create` for new objects and `update` for edits. Other operational failures include an `OPERATION_ERROR` code. Updates verify the target exists before mutating, and comment creates verify the issue exists before adding the comment. Issue and project creates check for existing same-name items and return conflict hints when a likely duplicate already exists. Text bodies can be passed directly or through `--description-file`, `--body-file`, and `--content-file`.

```bash
> linear-axi issues create --title "Fix auth" --team ENG --project Roadmap
issue:
  id: LIN-123
  title: Fix auth
  state: Todo
  project: Roadmap
  team: Engineering
  url: https://linear.app/acme/issue/LIN-123/fix-auth
```

```bash
> linear-axi issues view LIN-404
error: issue not found: LIN-404
code: NOT_FOUND
help[2]:
  Run `linear-axi issues list --query LIN-404` to search for the issue
  Run `linear-axi issues create --title "Title" --team "<team>"` to create a new issue
```

Unknown commands and subcommands return structured usage errors with recovery hints instead of calling the Linear MCP server.

```bash
> linear-axi releases list
error: unknown command: releases
code: VALIDATION_ERROR
help[5]:
  Run `linear-axi`
  Run `linear-axi init --project "<project>"`
  Run `linear-axi issues list`
  Run `linear-axi projects list`
  Run `linear-axi teams list`
```

## Development

`src/cli.js` is the runtime/router layer. Resource command handlers live in `src/commands/`, with shared command behavior in `src/commands/shared.js` and lower-level formatting, MCP, argument, and repo-project helpers in `src/lib/`.

```sh
npm run build:skill
npm test
npm run check
npm run demo
```

The committed `skills/linear-axi/SKILL.md` is generated by `npm run build:skill`; `npm run check` fails if it drifts from the shared skill source. The npm package includes `skills/linear-axi/`, so published releases ship the same installable Agent Skill documented in Install.

`npm run demo` renders `docs/demo.gif` from `docs/demo.tape` using [VHS](https://github.com/charmbracelet/vhs), then makes the GIF background opaque with ImageMagick. The tape uses the local executable path, so it can be regenerated from a checkout without installing `linear-axi` globally.
