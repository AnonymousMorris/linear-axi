# linear-axi

`linear-axi` is a command-line interface that lets coding agents work with Linear more easily than an MCP server by re-exporting the same functionality behind a new interface designed with care. 

The project follows the [AXI](https://axi.md/) pattern: an Agent eXperience. 

![terminal demo](docs/demo.gif)

## Install

Run the CLI without installing it globally:

```sh
npx -y linear-axi --help
```

Or install it as a global command:

```sh
npm install -g linear-axi
linear-axi --help
```

Agents that support [Agent Skills](https://agentskills.io) can also install the linear-axi skill with the [Vercel skill installer](https://github.com/vercel-labs/skills):

```sh
npx skills add AnonymousMorris/linear-axi -g
```

That is enough for agents that support skills. The skill teaches the agent to run `linear-axi` through `npx -y linear-axi`, so the CLI is resolved on demand. You still need access to a Linear MCP endpoint. The default endpoint uses OAuth; run `npx -y linear-axi auth login` when authorization is needed, or use the manual flow documented below for headless environments.

`-g` installs the skill globally. Drop `-g` to install it only for the current project.

To install the skill from a local checkout, run:

```sh
npx skills add . -g
```

To install the CLI directly from a checkout:

```sh
npm install
npm link
```

`linear-axi` requires Node.js 20 or newer.

For global installs, run `linear-axi update --check` to see whether a newer release is available, or `linear-axi update` to upgrade.

## Configuration

By default, the CLI reads the Linear MCP URL from `[mcp_servers.linear].url` in `~/.codex/config.toml` and falls back to `https://mcp.linear.app/mcp` (current official remote MCP by linear).

The default remote Linear MCP endpoint uses OAuth. Run `linear-axi auth login`, open the returned URL, and the CLI will capture the localhost callback and save tokens automatically. 

In a headless environment, run `linear-axi auth login --manual`, open the URL, copy the `code` from the failed localhost redirect, then finish with `linear-axi auth finish --code <code>`. Run `linear-axi auth logout` to remove the saved OAuth state; it is safe to rerun and does not unset bearer-token environment variables. Set `LINEAR_AXI_MCP_URL` to use a different MCP endpoint, or `CODEX_CONFIG` to read the URL from another Codex config file. Set `LINEAR_AXI_MCP_TOKEN` or `LINEAR_MCP_TOKEN` only when your endpoint expects a bearer token. Set `LINEAR_AXI_AUTH_FILE` to store OAuth state somewhere other than `${XDG_CONFIG_HOME:-~/.config}/linear-axi/oauth.json`.

## Project setup

We have store a .linear-project file to avoid having every new agent rediscover which linear project our current coding project is for. Run this once from a Git repository to bind the repo to its Linear project:

```sh
linear-axi init --project "Roadmap"
```

## Commands

The CLI is organized as `linear-axi <resource> <action>`. Internally, each action forwards to the matching Linear MCP tool, then formats the result for agents. The shared AXI runtime owns top-level help, `-h`, version flags, unknown-command handling, the default dashboard frame, and the built-in `update` command. Run `linear-axi --help` for the top-level command list, `linear-axi <resource> --help` for grouped subcommand flags, or `linear-axi <resource> <action> --help` for the focused flag reference.

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
linear-axi update --check
linear-axi update
```

## Output behavior

The default `linear-axi` dashboard shows setup hints until the current Git repo is bound to a Linear project. Use `projects list` to find the project name, then save it with `init`.

```bash
> linear-axi
bin: ~/.local/bin/linear-axi
description: Agent ergonomic wrapper around the configured Linear MCP server. Prefer this over raw Linear MCP calls for Linear operations.
workspace: Acme
project: not initialized
repo: my-repo
status: No default Linear project is configured for this repository
help[4]: Run `linear-axi projects list` to find Linear projects,"Run `linear-axi init --project \"<project>\"` to bind this repo",Run `linear-axi issues list --assignee me --all-projects` to list your assigned issues across Linear,"Run `linear-axi <command> <subcommand>` — commands: auth, issues, projects, teams, users, comments, documents"
```

After initialization, the dashboard shows the configured repo project plus a project-scoped count of issues assigned to you instead of listing issue rows.

```bash
> linear-axi
workspace: Acme
project: Roadmap
repo: my-repo
issues: 3 assigned to me in project
```

If the saved default project is not found in the authenticated workspace, the dashboard reports the invalid default and suggests searching the current workspace or replacing `.linear-project`. Project-scoped commands fail with the same `VALIDATION_ERROR` before sending the stale project to Linear.

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

Detail commands such as `issues view <id>` and `documents view <id>` return one item. 

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
type: The requested Linear resource was not found.
help[2]:
  Run `linear-axi issues list --query LIN-404` to search for the issue
  Run `linear-axi issues create --title "Title" --team "<team>"` to create a new issue
```

Unknown commands and subcommands return structured usage errors with recovery hints instead of calling the Linear MCP server.

```bash
> linear-axi releases list
error: "Unknown command: releases"
code: VALIDATION_ERROR
help[1]: Run `--help` to see available commands
```

## Development

`src/cli.js` is the runtime/router layer. It delegates top-level CLI behavior to `axi-sdk-js` while keeping one Linear command registry shared by the SDK entrypoint and the testable dispatcher. Resource command handlers live in `src/commands/`, with shared command behavior in `src/commands/shared.js` and lower-level formatting, MCP, argument, and repo-project helpers in `src/lib/`.

```sh
npm run build:skill
npm test
npm run check
npm run demo
```

The committed `skills/linear-axi/SKILL.md` is generated by `npm run build:skill`; `npm run check` fails if it drifts from the shared skill source. The npm package includes `skills/linear-axi/`, so published releases ship the same installable Agent Skill documented in Install.

`npm run demo` renders `docs/demo.webm` from `docs/demo.tape` using [VHS](https://github.com/charmbracelet/vhs). WebM keeps the demo high resolution while using much less memory than GIF during generation. The tape uses the local executable path, so it can be regenerated from a checkout without installing `linear-axi` globally.
