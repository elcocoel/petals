// The person's own agents, connected to their whole account with one prompt (Elco, 9 Nov, the first full
// test: coordinator/agent-house-test.md). Each waits for its next job and is shown as waiting while it does.
// GET /api/v1/agents lists them (SYSTEMS); each copy of the prompt carries a new agent link of its own,
// and older ones keep working until revoked. Pure. The words are drafts (Elco, 9 Nov: "Ship the drafts,
// I'll change them later").

/** An agent as GET /api/v1/agents lists it: the name it called itself, as a person reads it. */
export interface ConnectedAgent {
  name: string;
  /** It has a wait open right now. */
  waiting: boolean;
  last_seen?: string | null;
  /** One it took and hasn't reported. */
  job: { id: string; title: string; exploration?: string } | null;
}

/** The agents people know, by the names they join with (CONNECTORS's `--as`). */
const KNOWN: Record<string, string> = {
  'claude-code': 'Claude Code',
  claude: 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  cursor: 'Cursor',
};

/**
 * An agent's name as a person reads it (design/minimally-good.md, rule 5: claude-code is Claude Code): a
 * known one by its own name, any other with its hyphens as spaces and capitals, as given otherwise.
 */
export function readableAgent(name: string): string {
  const known = KNOWN[name.trim().toLowerCase()];
  if (known) return known;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name;
  return name
    .split('-')
    .map((w) => `${w.charAt(0).toUpperCase()}${w.slice(1)}`)
    .join(' ');
}

/** One row of the menu's list: who, and what it's doing. */
export interface AgentRow {
  key: string;
  name: string;
  label: string;
  status: string;
  here: boolean;
}

export function agentRows(agents: readonly ConnectedAgent[]): AgentRow[] {
  return agents.map((a) => ({
    key: a.name,
    /** what the server knows it by, for disconnecting it */
    name: a.name,
    label: readableAgent(a.name),
    status: a.job ? agentWords.on(a.job.title) : a.waiting ? agentWords.waiting : agentWords.away,
    here: Boolean(a.job) || a.waiting,
  }));
}

/** Drafts. */
export const agentWords = {
  heading: 'Your agents',
  /** Rule 2: what goes here, and the one thing to do. */
  none: 'None connected yet. Copy this into an agent to connect it.',
  waiting: 'Waiting for a job',
  away: 'Not connected now',
  on: (title: string) => `On: ${title}`,
  copy: 'Copy for your agents',
  copied: 'Copied. Paste it into each agent.',
  disconnect: 'Disconnect',
  /** CONNECTORS's line, 9 Nov, routing a cloud chat to the connector since 10 Nov; `site` is this site's address and `key` a fresh agent link's token. */
  prompt: (site: string, key: string) =>
    `Be one of my agents in Petals. If you run on my computer, read ${site}/skill.md and set yourself up, then join with my agent key and wait for my jobs, as its Jobs section says. If you're the Claude app's chat or ChatGPT, run no download: use the Petals connector at ${site}/mcp, or tell me how to add it, then take my open jobs with my agent key. My agent key: ${key}`,
} as const;
