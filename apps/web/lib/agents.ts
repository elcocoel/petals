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

/**
 * A worker's name, the one way the panel and the chat say it: its agent's, then its place after the first
 * (Codex, Codex 2, Codex 3). No place, or the first, is the agent alone.
 */
export const workerName = (name: string, n?: number | null) =>
  n && n > 1 ? `${readableAgent(name)} ${n}` : readableAgent(name);

/** Where Connect an agent was pressed, so its Copied shows there alone (design/side-panel.md, line 45). */
export type CopiedAt = 'top';

const BUSIEST: readonly AgentRow['state'][] = ['busy', 'waiting', 'away'];

/**
 * What the panel's top says of the agents (design/side-panel.md, line 46): each agent once, however many
 * workers it has, and the busiest of them; null with none connected.
 */
export function agentsAtTop(
  rows: readonly AgentRow[],
): { label: string; state: AgentRow['state']; title: string } | null {
  if (rows.length === 0) return null;
  const agents = [...new Set(rows.map((r) => r.agent))];
  return {
    // one agent by its name; more by how many, which fits the row (each worker is in its title)
    label: agents.length === 1 ? (agents[0] as string) : agentWords.several(agents.length),
    state: BUSIEST.find((s) => rows.some((r) => r.state === s)) ?? 'away',
    title: rows.map((r) => `${r.label}: ${r.status}`).join('\n'),
  };
}

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
  /** The panel's top, with more than one agent connected (design/side-panel.md, line 46). */
  several: (n: number) => `${n} agents`,
  /**
   * The one prompt's button, the same at the panel's top, in Your agents and on /connect (Elco, 11 Nov:
   * "connect an agent or connect more AIs or connect another AI"; a draft of the first).
   */
  copy: 'Connect an agent',
  copied: 'Copied. Paste it into each agent.',
  /** CONNECTORS's line, 9 Nov, routing a cloud chat to the connector since 10 Nov; `site` is this site's address and `key` a fresh agent link's token. */
  prompt: (site: string, key: string) =>
    `Be one of my agents in Petals. If you run on my computer, read ${site}/skill.md and set yourself up, then join with my agent key and wait for my jobs, as its Jobs section says. If you're the Claude app's chat or ChatGPT, run no download: use the Petals connector at ${site}/mcp, or tell me how to add it, then take my open jobs with my agent key. My agent key: ${key}`,
  /**
   * The one setup prompt, with no key, for before sign-in (Elco, 11 Nov, through PM): the landing's "Copy
   * for my agent" and a signed-out /make copy it. It walks the person to Petals one step at a time, skipping
   * what's done, and brings the agent in with the key Connect an agent copies once they're signed in, the
   * same join as `prompt`. Steps 1, 2, 3 and 5 are LANDING's words from section 4; `site` is this site's address.
   */
  setup: (site: string) =>
    [
      `Help me start using Petals (${site}). It maps who holds power in on-chain networks and draws it as flowers. Guide me one step at a time, and skip any step I've already done.`,
      '1. A NEAR wallet. If I have none, help me set one up (Meteor Wallet works) and get a little NEAR into it.',
      `2. Log in. I open ${site}, press Connect and approve the sign-in in my wallet. Signing in moves no funds and costs nothing.`,
      "3. Top up. Petals' agent runs on NEAR AI and is paid as I go. When my conversation with it asks for credit, I add some with Add 1 NEAR, or pay with another token from any chain.",
      `4. Bring yourself in. Read ${site}/skill.md. Once I'm logged in, I press Connect an agent at the top of Petals' side panel and paste here what it copies: it carries my agent key. Follow it, so you show under Your agents and can take the jobs Petals' agent hands out.`,
      "5. Talk to Petals. I name a community, a wallet or a contract, and Petals' agent maps how power moves in it.",
      'Never ask me for my seed phrase or private key.',
    ].join('\n\n'),
} as const;
