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

/** One row of the menu's list: who, and what it's doing. */
export interface AgentRow {
  key: string;
  label: string;
  status: string;
  here: boolean;
}

export function agentRows(agents: readonly ConnectedAgent[]): AgentRow[] {
  return agents.map((a) => ({
    key: a.name,
    label: a.name,
    status: a.job ? agentWords.on(a.job.title) : a.waiting ? agentWords.waiting : agentWords.away,
    here: Boolean(a.job) || a.waiting,
  }));
}

/** Drafts. */
export const agentWords = {
  heading: 'Your agents',
  waiting: 'Waiting for a job',
  away: 'Not connected now',
  on: (title: string) => `On: ${title}`,
  copy: 'Copy for your agents',
  copied: 'Copied. Paste it into each agent.',
  /** CONNECTORS's line, 9 Nov; `site` is this site's address and `key` a fresh agent link's token. */
  prompt: (site: string, key: string) =>
    `Be one of my agents in Petals. Read ${site}/skill.md and set yourself up, then join with my agent key and wait for my jobs, as its Jobs section says. My agent key: ${key}`,
} as const;
