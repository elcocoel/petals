---
id: connect-codex
app: codex
for: connecting Codex to Petals, in a terminal, and keeping it for next time
recognise: codex, codex cli, openai codex, connect, set up, install, mcp, add petals, keep petals
tools: start_exploration, add_note, render_flower
continues: start-from-an-address, where-power-lives
status: ready
---

# Connect Codex

<!-- {site} is the Petals site's origin and {host} its host name; whoever serves this chapter writes them in. -->

Codex runs Petals' tools on the person's own computer, in a terminal (`codex`). It signs in with a ChatGPT account, so a ChatGPT user who wants fresh readings can use Codex.

## Set up, every session

Run these two commands as written, and nothing else first:

```bash
curl -fsSL {site}/petal.mjs --create-dirs -o ~/.petals/petal.mjs
node ~/.petals/petal.mjs start --client "Codex" --question "<what they asked, or: A conversation about who holds power>"
```

- The first gets Petals' tools as one file. Run it every session: it takes a second and keeps the file current and from this site.
- The second starts this conversation's page and opens it in their browser. Its `site` must be `{site}`; if it isn't, the file came from somewhere else, so fetch it again.
- It needs Node 22.13 or newer. If `node` is missing or older, say so in one line.
- Every tool is then a command: `node ~/.petals/petal.mjs help` lists them, JSON out.

## The first time it runs

- **Codex's sandbox refused it** (the file reads public chain sites, so it needs the network on every command): run it again with escalated permissions, so the person gets Codex's approval. A sandbox's refusal isn't the person's no.
- **For the whole session,** so no command needs approving again, the person starts Codex with the network allowed in its workspace sandbox: `codex -c sandbox_workspace_write.network_access=true`. For every session, they add it to `~/.codex/config.toml`, under `[sandbox_workspace_write]`, as `network_access = true`. Waiting for jobs needs this.
- **Only the folder was refused:** keep the file in the working folder and set `PETALS_HOME` to a folder beside it, the same on every command.

## Keep Petals for next time

Only when they ask, add the file as an MCP server:

```bash
codex mcp add petals -- "$(command -v node)" "$HOME/.petals/petal.mjs" mcp
```

It goes into Codex's own settings (`~/.codex/config.toml`), so it holds in every folder, and takes effect in a new session. `codex mcp list` shows it. Codex replaces a server of the same name without asking, so check `codex mcp list` first.

## Waiting for jobs

As one of the person's agents (the skill's Jobs section), run `node ~/.petals/petal.mjs jobs wait`, with the network allowed as above. If Codex hands the command back before it ends, keep waiting on it until it prints a job or none, then run it again.

## In the box on Petals' page

Petals' helper starts Codex in the terminal box with the tools already loaded, as the `petals` MCP server for that session, and its notes in `~/.petals/work`. Codex isn't in the page's chat box yet: there, choose Claude Code or Hermes.

## When it can't start

- **Codex isn't installed:** `npm install -g @openai/codex`.
- **It isn't signed in:** the person runs `codex` once in a terminal and signs in there, with their ChatGPT account or an API key.
