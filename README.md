# linear-axi

AXI wrapper around the Linear MCP server. It keeps Linear behavior in the MCP server and adds an agent-friendly shell interface with compact TOON output.

## Install

```sh
npm install
npm link
```

By default the CLI reads the Linear MCP URL from `[mcp_servers.linear].url` in `~/.codex/config.toml` and falls back to `https://mcp.linear.app/mcp`.

The default remote Linear MCP endpoint uses OAuth. Run `linear-axi auth login`, open the returned URL, and the CLI will capture the localhost callback and save tokens automatically. In a headless environment, run `linear-axi auth login --manual`, open the URL, copy the `code` from the failed localhost redirect, then finish with `linear-axi auth finish --code <code>`. Set `LINEAR_AXI_MCP_URL` to use a different MCP endpoint, or `CODEX_CONFIG` to read the URL from another Codex config file. Set `LINEAR_AXI_MCP_TOKEN` or `LINEAR_MCP_TOKEN` only when your endpoint expects a bearer token. Set `LINEAR_AXI_AUTH_FILE` to store OAuth state somewhere other than `${XDG_CONFIG_HOME:-~/.config}/linear-axi/oauth.json`.

## Commands

The CLI is organized as `linear-axi <resource> <action>`. Internally each action forwards to the matching Linear MCP tool, then formats the result for agents. Run `linear-axi --help` or any command with `--help` for the focused flag reference.

```sh
linear-axi
linear-axi auth login
linear-axi auth login --manual
linear-axi auth finish --code <code>
linear-axi issues list --assignee me --limit 25
linear-axi issues list --fields id,title,state,assignee
linear-axi issues view LIN-123 --full
linear-axi issues save --title "Fix auth" --team ENG --project "Roadmap"
linear-axi issues save --id LIN-123 --state Done
linear-axi projects list --query roadmap
linear-axi projects save --name "Roadmap" --team ENG
linear-axi teams list
linear-axi users list --query morris
linear-axi labels list --team ENG
linear-axi comments list --issue LIN-123
linear-axi comments save --issue LIN-123 --body "Ready for review."
linear-axi documents view <id>
linear-axi documents save --title "Spec" --team ENG --content-file spec.md
linear-axi milestones list --project "Roadmap"
linear-axi milestones view --project "Roadmap" "Beta"
linear-axi milestones save --project "Roadmap" --name "Beta"
linear-axi cycles list --team ENG --type current
linear-axi statuses list --team ENG
```

List commands use a compact schema by default. Issues, projects, teams, users, documents, labels, comments, and statuses include cursor hints when more results are available. The continuation hint preserves active filters, selected fields, limits, and shell quoting. Add `--fields id,name,status` to choose fields, `--cursor <cursor>` to resume a page, or `--full` when you need the complete MCP response.

Detail commands such as `issues view <id>` and `documents view <id>` return one item. Compact detail views include long-text previews and suggest `--full` only when content is truncated; `issues view all` is rejected because detail views require one issue id. Mutation commands return compact success objects with the id, title/name, URL, and next-step hints. Text bodies can be passed directly or through `--description-file`, `--body-file`, and `--content-file`.

The default Linear MCP server does not expose releases or status mutations, so `linear-axi releases ...`, `linear-axi statuses save`, and `linear-axi statuses delete` return structured usage errors instead of calling the server.

## Development

```sh
npm test
npm run check
```
