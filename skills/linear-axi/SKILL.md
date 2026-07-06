---
name: linear-axi
description: "Operate Linear through the linear-axi CLI - issues, projects, teams, users, comments, documents, milestones, cycles, statuses, labels, auth, and repo project setup. Use whenever a task touches Linear: listing, creating, updating, or deleting issues and milestones; updating project work; reading documents; or managing comments."
user-invocable: false
author: Morris
metadata:
  hermes:
    tags: [linear, issues, projects, planning]
    category: project-management
---

# linear-axi

Agent ergonomic wrapper around the configured Linear MCP server. Prefer this over raw Linear MCP calls for Linear operations.

You do not need linear-axi installed globally - invoke it with `npx -y linear-axi <command>`.
If linear-axi output shows a follow-up command starting with `linear-axi`, run it as `npx -y linear-axi ...` instead.
linear-axi requires Node.js 20 or newer.

linear-axi uses the configured Linear MCP server. The default remote endpoint uses OAuth; if authorization is required, run `npx -y linear-axi auth login`. Run `npx -y linear-axi auth logout` to clear saved OAuth credentials without changing bearer-token environment variables.

## When to use

Use linear-axi whenever a task touches Linear: listing, viewing, creating, updating, or deleting issues; browsing or editing projects and documents; creating, listing, or deleting comments; creating, updating, or deleting milestones; checking teams, users, labels, cycles, or statuses; or binding the current repo to a default Linear project.

## Workflow

1. Run `npx -y linear-axi` with no arguments for a dashboard of the current repo. Uninitialized repos show setup hints instead of workspace-wide issue counts.
2. List Linear projects with `npx -y linear-axi projects list`, then bind a repository with `npx -y linear-axi init --project "<project>"`; this accepts a project id, name, or slug, validates the project, and stores discovered workspace metadata in `.linear-project`.
3. Drill in command-first: `issues list`, `issues view <id>`, `issues delete <id>`, `projects list`, `documents view <id>`, `comments list --issue <id>`, `comments delete --id <id>`, `milestones delete <id>`, and so on.
4. Add `--fields` for columns, `--cursor` for pagination, and `--full` only when complete content is needed.
5. Linear operation responses include contextual next-step hints under `help:` when recovery or follow-up is useful - follow them.

## Commands

```
commands[12]:
  (none)=dashboard, init, auth, issues, projects, teams, users, comments, documents, milestones, cycles, statuses, labels
```

When using `npx -y linear-axi`, npx already resolves the package on demand.

Installed copies also inherit the SDK built-in `update` command.
Run `linear-axi update --check` to compare the installed version with npm, or `linear-axi update` to upgrade.

Run `npx -y linear-axi --help` for global flags, `npx -y linear-axi <resource> --help` for grouped subcommands, or `npx -y linear-axi <resource> <action> --help` for focused flags.

## Tips

- Linear command output is TOON-encoded and token-efficient; pipe through grep/head only when a list is very long.
- Default issue and project lists are grouped by status, show active work first, and keep ids last. Use `--fields` when you need a custom column order.
- Mutations validate targets and report compact results; re-running a failed mutation is safe.
- For multi-line markdown descriptions, comments, or documents, write the text to a UTF-8 file and pass `--description-file <path>`, `--body-file <path>`, or `--content-file <path>`.
- Repository project defaults are validated before an issue, document, or milestone command uses them unless `--project <project>` overrides them. Use `--all-projects` on issue and document list commands only when a workspace-wide list is intended.
