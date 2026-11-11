// The person's own agents, connected to their whole account with one prompt (Elco, 9 Nov, the first full
// test: coordinator/agent-house-test.md). Each waits for its next job and is shown as waiting while it does.
// GET /api/v1/agents lists them (SYSTEMS); each copy of the prompt carries a new agent link of its own,
// and older ones keep working until revoked. Pure. The words are drafts (Elco, 9 Nov: "Ship the drafts,
// I'll change them later").

/**
 * An agent's worker as GET /api/v1/agents lists it (swarm step 1, 10 Nov: one entry per worker): the name
 * the agent called itself, and the worker's place among its kind, 1 for the first.
 */
export interface ConnectedAgent {
  name: string;
  /** The worker's place, 1 for the first; an agent from before workers is one entry, 1. */
  n?: number;
  /** The window or sub-agent, as petal.mjs named it when it joined; null for one from before workers. */
  worker?: string | null;
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

/** One row of the menu's list, a worker: who, and what it's doing. */
export interface AgentRow {
  key: string;
  /** What the server knows the agent by, for disconnecting it and all its workers. */
  name: string;
  /** The agent, as a person reads it: what disconnecting it ends. */
  agent: string;
  /** The worker: the agent, then its place after the first (Codex, Codex 2). */
  label: string;
  status: string;
  here: boolean;
  /** What it's doing, for the panel's few characters: on a job, waiting for one, or not connected. */
  state: 'busy' | 'waiting' | 'away';
}

/** A worker's name: its agent's, then its place after the first (Codex, Codex 2, Codex 3). */
export const workerName = (name: string, n = 1) =>
  n > 1 ? `${readableAgent(name)} ${n}` : readableAgent(name);

export function agentRows(agents: readonly ConnectedAgent[]): AgentRow[] {
  return agents.map((a) => ({
    key: `${a.name}:${a.n ?? 1}`,
    name: a.name,
    agent: readableAgent(a.name),
    label: workerName(a.name, a.n),
    status: a.job ? agentWords.on(a.job.title) : a.waiting ? agentWords.waiting : agentWords.away,
    here: Boolean(a.job) || a.waiting,
    state: a.job ? 'busy' : a.waiting ? 'waiting' : 'away',
  }));
}

/** Drafts. */
export const agentWords = {
  waiting: 'Waiting for a job',
  away: 'Not connected now',
  on: (title: string) => `On: ${title}`,
  /** The one prompt's button, the same in the side panel and on /connect (Elco's fix 1, 10 Nov). */
  copy: 'Copy for your agents',
  copied: 'Copied. Paste it into each agent.',
  /** CONNECTORS's line, 9 Nov, routing a cloud chat to the connector since 10 Nov; `site` is this site's address and `key` a fresh agent link's token. */
  prompt: (site: string, key: string) =>
    `Be one of my agents in Petals. If you run on my computer, read ${site}/skill.md and set yourself up, then join with my agent key and wait for my jobs, as its Jobs section says. If you're the Claude app's chat or ChatGPT, run no download: use the Petals connector at ${site}/mcp, or tell me how to add it, then take my open jobs with my agent key. My agent key: ${key}`,
} as const;
