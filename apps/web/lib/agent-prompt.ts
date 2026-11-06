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

export function agentPrompt(origin: string): string {
  return [
    `I'd like your help exploring who holds power in crypto networks, using Petal (${origin}). It's a public, read-only API with no account or key.`,
    `Petal's instructions for agents are at ${origin}/skill.md. Please read them and use them to help me. Then tell me in a line or two what you can do, and ask what I'm curious about.`,
    `If you can't open that link or make web requests from here, say so, and send me to ${origin}, where I can talk to Petal's own agent.`,
  ].join('\n\n');
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
  md = section(
    md,
    'When no Petal site is running',
    `## Links\n\nA \`view_url\` that starts with \`/\` is a path on this site. Hand the person \`${origin}\` followed by that path.\n`,
  );
  md = section(
    md,
    'Resources',
    `## Connecting\n\nMCP clients can connect to \`${origin}/mcp\`. These instructions stay at \`${origin}/skill.md\`.\n`,
  );
  return md;
}
