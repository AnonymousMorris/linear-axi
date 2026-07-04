# linear-axi

`linear-axi` is a command-line interface that lets coding agents work with Linear through a normal shell command. It wraps the Linear MCP server, keeps Linear-specific behavior in that server, and formats responses for agents as compact TOON instead of verbose JSON.

The project follows the [AXI](https://axi.md/) pattern: an Agent eXperience Interface is a CLI designed for autonomous agents to call, parse, and recover from without interactive prompts. That means `linear-axi` favors small default schemas, structured errors, explicit next-step hints, and output that is useful as context in an agent session.

Use it when you want an agent to list, inspect, create, or update Linear work from a repo without hand-driving the Linear UI or teaching the agent the raw MCP protocol.

![linear-axi terminal demo](docs/demo.gif)

## Install

```sh
npm install
npm link
```

## Configuration

By default, the CLI reads the Linear MCP URL from `[mcp_servers.linear].url` in `~/.codex/config.toml` and falls back to `https://mcp.linear.app/mcp`.

The default remote Linear MCP endpoint uses OAuth. Run `linear-axi auth login`, open the returned URL, and the CLI will capture the localhost callback and save tokens automatically. In a headless environment, run `linear-axi auth login --manual`, open the URL, copy the `code` from the failed localhost redirect, then finish with `linear-axi auth finish --code <code>`. Set `LINEAR_AXI_MCP_URL` to use a different MCP endpoint, or `CODEX_CONFIG` to read the URL from another Codex config file. Set `LINEAR_AXI_MCP_TOKEN` or `LINEAR_MCP_TOKEN` only when your endpoint expects a bearer token. Set `LINEAR_AXI_AUTH_FILE` to store OAuth state somewhere other than `${XDG_CONFIG_HOME:-~/.config}/linear-axi/oauth.json`.

## Project setup

Run this once from a Git repository to bind the repo to its Linear project:

```sh
linear-axi init --project "Roadmap"
```

This writes `.linear-project` at the Git root as JSON, for example `{ "project": "Roadmap" }`. After that, project-scoped commands such as `linear-axi`, `linear-axi issues list`, `linear-axi issues create ...`, `linear-axi documents list`, `linear-axi documents create ...`, and `linear-axi milestones list` use that project automatically. Pass `--project <project>` on a project-scoped command to override the repo default once. Re-run `linear-axi init --project "<project>" --force` to replace the saved value.

## Commands

The CLI is organized as `linear-axi <resource> <action>`. Internally, each action forwards to the matching Linear MCP tool, then formats the result for agents. Run `linear-axi --help` for the top-level command list, `linear-axi <resource> --help` for grouped subcommand flags, or `linear-axi <resource> <action> --help` for the focused flag reference.

```sh
linear-axi
linear-axi init --project "Roadmap"
linear-axi auth login
linear-axi auth login --manual
linear-axi auth finish --code <code>
linear-axi issues list --assignee me --limit 25
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

The default `linear-axi` dashboard stays compact: it shows the configured repo project, or the Git/workspace name when no project is configured, plus a count of issues assigned to you instead of listing issue rows.

List commands use a compact schema by default. Empty lists render as `items: []`, counts render as `0 returned` or `1 returned (more available)`, and non-empty lists include only the field-selection hint unless a continuation cursor is available. Issues, projects, teams, users, documents, labels, comments, and statuses include cursor hints when more results are available. The continuation hint preserves active filters, selected fields, limits, and shell quoting. Add `--fields id,name,status` to choose fields, `--cursor <cursor>` to resume a page, or `--full` when you need the complete MCP response.

Detail commands such as `issues view <id>` and `documents view <id>` return one item. Compact detail views include long-text previews and suggest `--full` only when content is truncated; `issues view all` is rejected because detail views require one issue id. Missing detail targets and failed pre-mutation existence checks return structured `NOT_FOUND` errors with search or create hints. Mutation commands return compact success objects with the id, title/name, URL, and next-step hints. Use `create` for new objects and `update` for edits; old resource `save` commands return structured `VALIDATION_ERROR` usage guidance instead of mutating. Other operational failures include an `OPERATION_ERROR` code. Updates verify the target exists before mutating, and comment creates verify the issue exists before adding the comment. Issue and project creates check for existing same-name items and return conflict hints when a likely duplicate already exists. Text bodies can be passed directly or through `--description-file`, `--body-file`, and `--content-file`.

The default Linear MCP server does not expose releases or status mutations, so `linear-axi releases ...`, `linear-axi statuses save`, and `linear-axi statuses delete` return structured usage errors instead of calling the server.

## Development

`src/cli.js` is the runtime/router layer. Resource command handlers live in `src/commands/`, with shared command behavior in `src/commands/shared.js` and lower-level formatting, MCP, argument, and repo-project helpers in `src/lib/`.

```sh
npm test
npm run check
npm run demo
```

`npm run demo` renders `docs/demo.gif` from `docs/demo.tape` using [VHS](https://github.com/charmbracelet/vhs), then makes the GIF background opaque with ImageMagick. The tape uses the local executable path, so it can be regenerated from a checkout without installing `linear-axi` globally.
