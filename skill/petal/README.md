# The Petal skill

`SKILL.md` teaches any agent (Claude Code, Codex, IronClaw) to make a Petal flower: find the network, take the snapshot, quote only the tools' figures, propose and validate a spec, render it, and hand back the link. It is in the Agent Skills format, like NEAR's [`near/agent-skills`](https://github.com/near/agent-skills): frontmatter with `name` and `description`, then instructions.

The skill calls Petal's HTTP API with `curl`, which works in all three agents. Where the `petal` MCP server is configured, the agent calls the same tools by name instead.

In the commands below, `<repo>` is the root of your clone of the Petal repo (locally, the `build/` folder).

## Before you start

You need Node 24 (the repo's `.nvmrc`) and pnpm 10.

```bash
cd <repo>
nvm use && pnpm install
pnpm api                                   # Petal's HTTP API on http://localhost:8787
curl -s http://localhost:8787/api/v1/health
```

To use an API somewhere else, set `PETAL_API` to its base URL in the agent's environment. The skill falls back to `http://localhost:8787`.

## Claude Code

Install the skill for every project:

```bash
mkdir -p ~/.claude/skills/petal
cp <repo>/skill/petal/SKILL.md ~/.claude/skills/petal/
```

To install it for one project only, copy `SKILL.md` to `.claude/skills/petal/` in that project instead. To keep it in step with the repo, symlink the folder: `ln -s <repo>/skill/petal ~/.claude/skills/petal`.

The MCP server is optional. It gives Claude Code the tools by name, so it doesn't need `curl`:

```bash
claude mcp add petal -- pnpm -s --dir <repo> petal mcp
```

- `-s` keeps pnpm's script banner off stdout. MCP over stdio needs a clean stdout, and the banner would corrupt it.
- **Node 24 must be first on the PATH that Claude Code gives the server.** Claude Code starts `pnpm` with its own environment, and pnpm runs whichever `node` comes first on that PATH. A login shell can find an older `node` before nvm's, and then the server fails to start. If that happens, pass a PATH with Node 24 first (run this where nvm is loaded):

  ```bash
  claude mcp add petal -e PATH="$(dirname "$(nvm which 24)"):/usr/bin:/bin" \
    -- pnpm -s --dir <repo> petal mcp
  ```

- Or, while `pnpm api` is running, use the HTTP endpoint. It needs no local Node setup on the agent's side: `claude mcp add --transport http petal http://localhost:8787/mcp`.

Check it: `claude mcp list` shows `petal` as connected, and `/mcp` in a session lists its tools (`mcp__petal__list_networks`, ...).

Then ask: **who stands behind NEAR's validators?** The agent should run the tools in order (networks, snapshot, figures, propose, validate, render). It should answer with a `view_url`, the legend and an interpretation. If you ask it to publish, it calls `prepare_publish` and gives you a `sign_url` to sign in your own wallet. It never asks for a key.

## Codex

```bash
mkdir -p ~/.codex/skills/petal
cp <repo>/skill/petal/SKILL.md ~/.codex/skills/petal/
codex mcp add petal -- pnpm -s --dir <repo> petal mcp            # optional
```

The Node 24 rule above applies here too. Give the server a PATH with `--env PATH=...`, or use the HTTP endpoint with `codex mcp add petal --url http://localhost:8787/mcp`. If Codex's sandbox blocks the skill's `curl` calls to localhost, use the MCP server or allow network access for the session.

## IronClaw

```bash
mkdir -p ~/.ironclaw/skills/petal
cp <repo>/skill/petal/SKILL.md ~/.ironclaw/skills/petal/
```

IronClaw uses the skill over HTTP, so `pnpm api` must run where IronClaw can reach it. Otherwise set `PETAL_API`. IronClaw loads MCP servers only through a packaged extension. `skill/ironclaw/` will hold one that wraps `/mcp`. It is a hedge for later, and the skill works without it.

## Keeping it current

The rules in `SKILL.md` (the block between the `petal:shared` markers) are the same text as Petal's own agent prompt, `packages/agent/src/prompt.md`. Edit them there. `node skill/build.ts` copies the block into `SKILL.md`, and `node skill/build.ts --check` says whether the two agree. The coordinator syncs the wording at merge. After you pull, copy `SKILL.md` again, unless you symlinked it.

## Without an agent

The same tools work from a terminal, in process, with JSON output:

```bash
pnpm petal help
pnpm petal figures near-validators                  # the figures the default flower quotes
pnpm petal render near-validators --segments backers --out flower.svg
```
