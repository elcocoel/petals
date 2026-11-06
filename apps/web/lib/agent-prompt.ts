// The door for anyone's agent, with nothing to install: a prompt a person copies, and the skill
// served from this site. The prompt speaks as the person and says what it is, so an agent can
// decide to help rather than being told to obey a page. It also says what to do when the agent
// can't reach the link, so a chatbot with no web access still sends the person somewhere useful.

/** This site as the visitor reached it, also behind a proxy or tunnel. */
export function originFrom(headers: Headers, fallback = 'http://localhost:3080'): string {
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return fallback;
  const proto =
    headers.get('x-forwarded-proto') ??
    (/^(localhost|127\.0\.0\.1)\b/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** On this machine, some agents' web tools refuse the address on principle (Hermes's, Claude's). */
const isThisMachine = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin);

export function agentPrompt(origin: string): string {
  const local = isThisMachine(origin)
    ? " It's running on this machine, so if your web tool won't open a local address, use curl."
    : '';
  return [
    `I'd like to use Petal with you. It maps who holds power in crypto networks (${origin}). It's public and read-only, with no account or key.`,
    `Its instructions for you are at ${origin}/skill.md.${local} Please read them and set yourself up in whatever way works from where you are, without asking me to choose anything. I want to watch this conversation on Petal's page in my browser, so please open that page for me, and post each flower and your replies there word for word. Then tell me in a line or two what you can do, and ask what I'm curious about.`,
    `If you can't open that link or make web requests, use Petal's tools if you already have them. If not, say so, and send me to ${origin}, where I can talk to Petal's own agent.`,
  ].join('\n\n');
}

/** What an agent works out for itself, so the person has nothing to understand (Elco, 6 Nov). */
function setup(origin: string): string {
  const mcp = `${origin}/mcp`;
  return `## Set yourself up first

Work this out yourself. The person doesn't need to understand any of it, so don't ask them to choose, and don't explain it unless something goes wrong.

- **You already have Petal's tools** (\`find_target\`, \`render_flower\`): use them.
- **You can make web requests** (a shell with curl, or a code tool): use the routes under "Calling the tools over HTTP". Nothing needs installing, and it works right now. Keep large JSON in a file in your working folder and send it with \`--data-binary @file\`.
- **You can only read web pages:** look things up with the \`GET\` routes and answer from those. You can't draw from there, so when they want a flower, send them to \`${origin}\`, where Petal's own agent can.
- **A request is blocked** by a sandbox or a permission: say in one plain line what you need allowed. If they'd rather not, send them to \`${origin}\`.

Don't install anything to get going. If they ask to keep Petal for next time, add it for them. It takes effect in a new session:

- Claude Code: \`claude mcp add --transport http petal ${mcp}\`
- Codex: \`codex mcp add petal --url ${mcp}\`
- Hermes: the person runs \`hermes mcp add petal --url ${mcp}\` themselves, in a terminal, because it asks a question you can't answer from inside. The HTTP routes need nothing.
- Any other agent that takes MCP: add \`${mcp}\` as an HTTP server.
- The Claude app: you can't do this one for them. It's under Customize, Connectors, +, Add custom connector, with that address.
- ChatGPT: the same. It's under Settings, Apps & Connectors, with Developer mode on under Advanced, and depends on their plan.

## Let them watch

When they've asked to watch, this conversation gets one page on this site, where they see your work as it happens. Never start a second one for it. If a step fails, say so in a line and carry on with your answer.

1. **Right away, before your first reply:** start it with \`start_exploration\`, with \`client\` set to the app you run in (\`Claude Code\`, \`Codex\`, \`Hermes\`) and \`question\` set to what they asked, or to \`A conversation about who holds power\` if they haven't asked yet. Over HTTP: \`POST ${origin}/api/v1/explorations\` with \`{ "question": "…", "client": "…" }\`.
2. **Give them \`open_url\`** in that reply, in one line, and open it for them if you can. \`link.url\` is your key: keep it, and don't show it. Its last part is \`<token>\` below.
3. **Each flower you draw:** save it, with \`exploration\` set to \`link.url\`: \`save_step\` with its \`spec_sha256\`. Over HTTP: \`POST ${origin}/api/v1/explorations/<token>/steps\` with \`{ "spec_sha256": "…" }\`.
4. **Each reply:** before you finish it, post the person's words and then your reply word for word, as one note: \`add_note\` with \`text\`. Over HTTP: \`POST ${origin}/api/v1/explorations/<token>/notes\` with \`{ "text": "…" }\`. That note is all they see of what you said, so leave out only \`open_url\`, which is a key.

`;
}

const section = (md: string, title: string, body: string) => {
  const at = md.indexOf(`## ${title}\n`);
  if (at === -1) throw new Error(`the skill has no section "${title}"`);
  const next = md.indexOf('\n## ', at + 1);
  return `${md.slice(0, at)}${body}${next === -1 ? '\n' : md.slice(next)}`;
};

/** skill/petal/SKILL.md for an agent with no clone: this site's address, and no local commands. */
export function hostedSkill(skill: string, origin: string): string {
  let md = skill.replace(/^---\n[\s\S]*?\n---\n+/, '');
  md = md.replace(
    /Petal's HTTP API runs at `PETAL_API` \(default `http:\/\/localhost:8787`; in a clone of the Petal repo, `pnpm api` starts it\)\./,
    `Petal's HTTP API runs at \`${origin}\`.`,
  );
  md = md.replaceAll('${PETAL_API:-http://localhost:8787}', origin);
  const start = md.indexOf('## Quick Start\n');
  if (start === -1) throw new Error('the skill has no section "Quick Start"');
  md = `${md.slice(0, start)}${setup(origin)}${md.slice(start)}`;
  md = section(
    md,
    'When no Petal site is running',
    `## Links\n\nHand the person \`short_url\` when \`render_flower\` gives one, because it fits on a line. Otherwise use \`view_url\`. Either one that starts with \`/\` is a path on this site, so put \`${origin}\` in front of it. If you can open a link on their machine, open the flower for them too.\n`,
  );
  md = section(
    md,
    'Resources',
    `## Connecting\n\nMCP clients can connect to \`${origin}/mcp\`. These instructions stay at \`${origin}/skill.md\`.\n`,
  );
  return md;
}
