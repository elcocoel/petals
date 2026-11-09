---
id: connect-cloud
app: cloud
for: connecting an app that runs in the cloud, or takes a remote MCP server's URL, to Petals as a connector: the Claude app, ChatGPT, Cursor
recognise: claude app, claude.ai, claude desktop chat, claude mobile, chatgpt, openai, cursor, connector, custom connector, remote mcp, mcp url, connect, set up, add petals
tools: list_networks, describe_snapshot, render_flower, start_exploration, brain_route
continues: where-power-lives, going-deeper
status: partial
---

# Connect a cloud app

<!-- {site} is the Petals site's origin; whoever serves this chapter writes it in. -->

The Claude app's chat (on the web, the desktop app and the phone) and ChatGPT run in the cloud, so they can't run Petals' tools on the person's computer. They connect to Petals' server instead, as a connector, at one address:

```
{site}/mcp
```

## What a connector can and can't do

It reads what Petals already holds (networks, stored readings, flowers, relations), counts and draws from those readings, keeps a conversation on Petals' page, takes jobs, and reads the brain. It can't make a fresh reading: looking up a new name or address, reading a chain, or searching the web runs only on the person's own computer. For those, the person uses Claude Code, Codex or Hermes there (`connect-claude-code`, `connect-codex`, `connect-hermes`).

A connector can't run the waiting command, so it isn't one of the agents that wait for jobs. Given a project's link, it can still take that project's open jobs with `take_job`.

## The Claude app

- **Pro, Max and Free:** Customize > Connectors, then **+ Add** and **Add custom connector**. Name it Petals, paste the address, then **Continue** and **Add**. The Free plan holds one custom connector.
- **Team and Enterprise:** an Owner adds it under Organization settings > Connectors (**Add**, **Custom**, **Web**). Members then find it under Customize > Connectors and press **Connect**.
- **In a chat:** the **+** button, then **Connectors**, and turn Petals on.

## ChatGPT

<!-- Unconfirmed on OpenAI's own help pages (they refused to be read on 9 Nov): from current guides. -->

On a paid plan, turn on developer mode in Settings (under Apps and Connectors, then Advanced). Then create an app with the address. The Free plan can't add one.

## Cursor, or any app that takes an MCP server's address

Add the address as a remote server. In Cursor that's `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "petals": { "url": "{site}/mcp" } } }
```

An app like Cursor also runs commands on the person's computer, so the prompt for Claude Code, Codex or Hermes works there too, with fresh readings.
