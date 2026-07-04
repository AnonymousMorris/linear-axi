# linear-axi

AXI wrapper around the Linear MCP server. It keeps Linear behavior in the MCP server and adds an agent-friendly shell interface with compact TOON output.

## Install

```sh
npm install
npm link
```

By default the CLI reads the Linear MCP URL from `~/.codex/config.toml` and falls back to `https://mcp.linear.app/mcp`.

The default remote Linear MCP endpoint uses OAuth. Run `linear-axi auth login`, open the returned URL, then finish with `linear-axi auth finish --code <code>`. Set `LINEAR_AXI_MCP_URL` to use a different MCP endpoint. Set `LINEAR_AXI_MCP_TOKEN` or `LINEAR_MCP_TOKEN` only when your endpoint expects a bearer token.

## Commands

```sh
linear-axi
linear-axi auth login
linear-axi issues list --assignee me --limit 25
linear-axi issues save --id LIN-123 --state Done
linear-axi projects list --query roadmap
linear-axi teams list
linear-axi comments list --issue LIN-123
linear-axi comments save --issue LIN-123 --body "Ready for review."
linear-axi documents save --title "Spec" --team ENG --content-file spec.md
linear-axi milestones list --project "Roadmap"
linear-axi statuses list --team ENG
linear-axi statuses save --type project --project "Roadmap" --health onTrack --body "Shipped."
```

The CLI is organized as `linear-axi <resource> <action>`. Internally each action forwards to the matching Linear MCP tool, then formats the result for agents.

## Development

```sh
npm test
npm run check
```
