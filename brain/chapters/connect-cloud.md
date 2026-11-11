---
id: connect-cloud
app: cloud
for: connecting an app that runs in the cloud, or takes a remote MCP server's URL, to Petals as a connector: the Claude app, ChatGPT, Cursor
recognise: claude app, claude.ai, claude desktop chat, claude mobile, chatgpt, openai, cursor, connector, custom connector, remote mcp, mcp url, connect, set up, add petals, cloud sandbox, code execution, blocked domain
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

A connector can't run the waiting command, so it doesn't wait for jobs in the background. It takes them when the person asks:

- **With the person's agent key** (it starts `petal_agent_`, from "Copy for your agents"): when they ask you to take their open jobs, call `take_job` with `agent_key` and `as`, a short name for your app such as `claude-app` or `chatgpt`. It gives the next job sent to that name or to anyone, in any of their projects, with that project's `link`. Do the job, and pass the link as `exploration` to `save_step` after each `render_flower`, so each flower lands in that project, and to `add_note` and `report_job`. Pass its `view` to each `render_flower`, so every flower is drawn as the person sees it. Save who or what you find behind addresses with `add_annotation`, with the link and `as`, and give their ids to `report_job` as `annotations`. If a call says the job was stopped or handed to another worker, drop it, report nothing, and take the next one. Call `take_job` again until it gives none.
- **With one project's link:** call `take_job` with it as `exploration`, the same way.

## A cloud sandbox isn't the person's computer

The Claude app and ChatGPT can run code in a sandbox in the cloud. Having a shell there doesn't make the setup for Claude Code, Codex or Hermes apply: downloading Petals' file and running it there fails, because the sandbox can't reach Petals. Use the connector. If it isn't added yet, give the person the address above and their app's steps below, before trying any download.

When a sandbox says a domain is blocked, that's its network rule, not a question the person can answer in the chat. Don't retry it, try another host, or offer a button the app doesn't have. The person or their organisation's administrator controls that access, and a connector has its own permissions, apart from the sandbox's network.

## Approving the connector's tools

Claude offers "Allow always" for a connector's tools, within the organisation's rules. ChatGPT can remember an approval for a tool within a conversation, and a new conversation or a refresh can ask again. Say so when it helps, and never change these settings for the person, or call a write a read: saving a note or a layer, and taking or reporting a job, change the project.

Checked 10 Nov 2026: [Claude's network access](https://support.claude.com/en/articles/12111783-create-and-edit-files-with-claude), [Claude's connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [ChatGPT's custom MCP servers](https://developers.openai.com/api/docs/guides/custom-mcp-server).

## The Claude app

- **Pro, Max and Free:** Customize > Connectors, then **+ Add** and **Add custom connector**. Name it Petals, paste the address, then **Continue** and **Add**. The Free plan holds one custom connector.
- **Team and Enterprise:** an Owner adds it under Organization settings > Connectors (**Add**, **Custom**, **Web**). Members then find it under Customize > Connectors and press **Connect**.
- **In a chat:** the **+** button, then **Connectors**, and turn Petals on.

## ChatGPT

In ChatGPT's Plugins, choose **+**, then **Add custom MCP server**. Give it a name and the address above, review its connection and sign-in settings, then create and install it. In a conversation, choose it with **@**. What's offered depends on the account and the workspace's rules: if the person doesn't see this, ask what they see instead of assuming they can turn it on.

## Cursor, or any app that takes an MCP server's address

Add the address as a remote server. In Cursor that's `~/.cursor/mcp.json`:

```json
{ "mcpServers": { "petals": { "url": "{site}/mcp" } } }
```

An app like Cursor also runs commands on the person's computer, so the prompt for Claude Code, Codex or Hermes works there too, with fresh readings.

## On Petals' connect page

What the person reads on `{site}/connect`, next to the address above:

- **The Claude app:** Add Petals as a connector: Customize > Connectors, then + Add and Add custom connector. Name it Petals and paste this address. On a Team or Enterprise plan, an Owner adds it first, under Organization settings > Connectors. It reads and draws what Petals already holds, and takes your jobs when you ask it to. For new readings, use Claude Code.
- **ChatGPT:** Add Petals as a custom MCP server: in ChatGPT’s Plugins, choose +, then Add custom MCP server, and paste this address. It reads and draws what Petals already holds, and takes your jobs when you ask it to. For new readings, use Codex.
- **Anything else:** Any agent that can run commands on your computer can use the prompt above. An app that takes an MCP server’s address, such as Cursor, can add Petals with this one instead: it reads and draws what Petals already holds.
