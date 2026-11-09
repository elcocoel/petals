---
id: connect-hermes
app: hermes
for: connecting Hermes, Nous Research's agent, to Petals, in a terminal or over ACP, and keeping it for next time
recognise: hermes, hermes agent, nous, nous research, acp, connect, set up, install, mcp, add petals, keep petals
tools: start_exploration, add_note, render_flower
continues: start-from-an-address, where-power-lives
status: ready
---

# Connect Hermes

<!-- {site} is the Petals site's origin and {host} its host name; whoever serves this chapter writes them in. -->

Hermes runs Petals' tools on the person's own computer, in a terminal (`hermes`), or as an ACP agent in an app that speaks ACP (`hermes acp`).

## Set up, every session

Run these two commands as written, and nothing else first:

```bash
curl -fsSL {site}/petal.mjs --create-dirs -o ~/.petals/petal.mjs
node ~/.petals/petal.mjs start --client "Hermes" --question "<what they asked, or: A conversation about who holds power>"
```

- The first gets Petals' tools as one file. Run it every session: it takes a second and keeps the file current and from this site. If Hermes's web tool won't open the address, use curl.
- The second starts this conversation's page and opens it in their browser. Its `site` must be `{site}`; if it isn't, the file came from somewhere else, so fetch it again.
- It needs Node 22.13 or newer. If `node` is missing or older, say so in one line.
- Every tool is then a command: `node ~/.petals/petal.mjs help` lists them, JSON out.

## Keep Petals for next time

Only when they ask, add the file as an MCP server:

```bash
printf 'Y\n' | hermes mcp add petals --command "$(command -v node)" --args "$HOME/.petals/petal.mjs" mcp
```

It goes into Hermes's own settings, so it holds in every session. `/reload-mcp` loads it into an open session.

## Waiting for jobs

As one of the person's agents (the skill's Jobs section), run `node ~/.petals/petal.mjs jobs wait` with the terminal tool's `timeout` at 600, its longest in the foreground: ten minutes. The default 180 seconds cuts the wait short. It comes back just under ten minutes, with a job or none; run it again either way.

## In the box on Petals' page

Petals' helper runs Hermes over ACP (`hermes acp`) in the page's chat, and `hermes chat` in its terminal box. Neither loads MCP servers for one session, so there the tools are commands in Hermes's shell: `node ~/.petals/petal.mjs <command>`. Its notes are in `~/.petals/work`.

## When it can't start

- **Hermes isn't installed:** install it from Nous Research's Hermes Agent guide.
- **Hermes isn't set up yet** (the page's chat says only "Internal error"): the person runs `hermes setup` once in a terminal to choose a provider and a model.
