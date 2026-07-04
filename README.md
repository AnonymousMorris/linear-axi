# linear-axi

AXI wrapper around the Linear MCP server. It keeps Linear behavior in the MCP server and adds an agent-friendly shell interface with compact TOON output.

## Install

```sh
npm install
npm link
```

By default the CLI reads the Linear MCP URL from `[mcp_servers.linear].url` in `~/.codex/config.toml` and falls back to `https://mcp.linear.app/mcp`.

The default remote Linear MCP endpoint uses OAuth. Run `linear-axi auth login`, open the returned URL, and the CLI will capture the localhost callback and save tokens automatically. In a headless environment, run `linear-axi auth login --manual`, open the URL, copy the `code` from the failed localhost redirect, then finish with `linear-axi auth finish --code <code>`. Set `LINEAR_AXI_MCP_URL` to use a different MCP endpoint, or `CODEX_CONFIG` to read the URL from another Codex config file. Set `LINEAR_AXI_MCP_TOKEN` or `LINEAR_MCP_TOKEN` only when your endpoint expects a bearer token. Set `LINEAR_AXI_AUTH_FILE` to store OAuth state somewhere other than `${XDG_CONFIG_HOME:-~/.config}/linear-axi/oauth.json`.

## Project setup

Run this once from a Git repository to bind the repo to its Linear project:

```sh
linear-axi init --project "Roadmap"
```

This writes `.linear-project` at the Git root as JSON, for example `{ "project": "Roadmap" }`. After that, project-scoped commands such as `linear-axi`, `linear-axi issues list`, `linear-axi issues save ...`, `linear-axi documents list`, `linear-axi documents save ...`, and `linear-axi milestones list` use that project automatically. Pass `--project <project>` on a project-scoped command to override the repo default once. Re-run `linear-axi init --project "<project>" --force` to replace the saved value.

## Commands

The CLI is organized as `linear-axi <resource> <action>`. Internally each action forwards to the matching Linear MCP tool, then formats the result for agents. Run `linear-axi --help` or any command with `--help` for the focused flag reference.

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

List commands use a compact schema by default. Issues, projects, teams, users, documents, labels, comments, and statuses include cursor hints when more results are available. The continuation hint preserves active filters, selected fields, limits, and shell quoting. Add `--fields id,name,status` to choose fields, `--cursor <cursor>` to resume a page, or `--full` when you need the complete MCP response.

Detail commands such as `issues view <id>` and `documents view <id>` return one item. Compact detail views include long-text previews and suggest `--full` only when content is truncated; `issues view all` is rejected because detail views require one issue id. Mutation commands return compact success objects with the id, title/name, URL, and next-step hints. Use `create` for new objects and `update` for edits; old resource `save` commands return structured usage guidance instead of mutating. Updates verify the target exists before mutating, and comment creates verify the issue exists before adding the comment. Issue and project creates check for existing same-name items and return conflict hints when a likely duplicate already exists. Text bodies can be passed directly or through `--description-file`, `--body-file`, and `--content-file`.

The default Linear MCP server does not expose releases or status mutations, so `linear-axi releases ...`, `linear-axi statuses save`, and `linear-axi statuses delete` return structured usage errors instead of calling the server.

## Development

```sh
npm test
npm run check
```
