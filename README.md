# linear-axi

AXI wrapper around the Linear MCP server. It keeps Linear behavior in the MCP server and adds an agent-friendly shell interface with compact TOON output.

## Install

```sh
npm install
npm link
```

By default the CLI reads the Linear MCP URL from `~/.codex/config.toml` and falls back to `https://mcp.linear.app/mcp`.

The default remote Linear MCP endpoint uses OAuth. Run `linear-axi auth login`, open the returned URL, then finish with `linear-axi auth finish --code <code>`. Set `LINEAR_AXI_MCP_URL` to use a different MCP endpoint, or `CODEX_CONFIG` to read the URL from another Codex config file. Set `LINEAR_AXI_MCP_TOKEN` or `LINEAR_MCP_TOKEN` only when your endpoint expects a bearer token. Set `LINEAR_AXI_AUTH_FILE` to store OAuth state somewhere other than the default config directory.

## Commands

The CLI is organized as `linear-axi <resource> <action>`. Internally each action forwards to the matching Linear MCP tool, then formats the result for agents. Run `linear-axi --help` or any command with `--help` for the focused flag reference.

```sh
linear-axi
linear-axi auth login
linear-axi auth finish --code <code>
linear-axi issues list --assignee me --limit 25
linear-axi issues view LIN-123 --full
linear-axi issues save --title "Fix auth" --team ENG
linear-axi issues save --id LIN-123 --state Done
linear-axi projects list --query roadmap
linear-axi teams list
linear-axi users list --query morris
linear-axi labels list --team ENG
linear-axi comments list --issue LIN-123
linear-axi comments save --issue LIN-123 --body "Ready for review."
linear-axi documents save --title "Spec" --team ENG --content-file spec.md
linear-axi milestones list --project "Roadmap"
linear-axi milestones view --project "Roadmap" "Beta"
linear-axi milestones save --project "Roadmap" --name "Beta"
linear-axi cycles list --team ENG --type current
linear-axi statuses list --team ENG
```

List commands use a compact schema by default. Add `--full` to list commands, or to `issues view`, when you need the complete MCP response. Text bodies can be passed directly or through `--description-file`, `--body-file`, and `--content-file`.

The default Linear MCP server does not expose releases or status mutations, so `linear-axi releases ...`, `linear-axi statuses save`, and `linear-axi statuses delete` return structured usage errors instead of calling the server.

## Development

```sh
npm test
npm run check
```
