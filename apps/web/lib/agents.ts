// The person's own agents, connected to their whole account with one prompt. Each waits for its next job
// and is shown as waiting while it does. GET /api/v1/agents lists them; each copy of the prompt carries a
// new agent link of its own, and older ones keep working until revoked. Pure.
import { shortWhen } from './conversation-list.ts';

/**
 * An agent's worker as GET /api/v1/agents lists it (one entry per worker): the name
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
  /** An agent working in one of the person's conversations with no agent key: that conversation. */
  conversation?: { id: string; title: string } | null;
}

/** The agents people know, by the names they join with (the connector's `--as`). */
const KNOWN: Record<string, string> = {
  'claude-code': 'Claude Code',
  claude: 'Claude Code',
  codex: 'Codex',
  // the names the skill gives the cloud apps, through /mcp
  'claude-app': 'Claude app',
  chatgpt: 'ChatGPT',
  hermes: 'Hermes',
  cursor: 'Cursor',
};

/**
 * An agent's name as a person reads it (claude-code is Claude Code): a
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
  /** Where it works, for an agent in one of the person's conversations: that conversation. */
  href?: string;
  /** For an agent in one of the person's conversations: when it was last seen there, short (now, 12m, 3h). */
  when?: string;
}

/**
 * A worker's name, the one way the panel and the chat say it: its agent's, then its place after the first
 * (Codex, Codex 2, Codex 3). No place, or the first, is the agent alone.
 */
export const workerName = (name: string, n?: number | null) =>
  n && n > 1 ? `${readableAgent(name)} ${n}` : readableAgent(name);

/** Where Connect an agent was pressed, so its Copied shows there alone. */
export type CopiedAt = 'top';

const BUSIEST: readonly AgentRow['state'][] = ['busy', 'waiting', 'away'];

/**
 * What the panel's top says of the agents: each agent once, however many
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

export function agentRows(agents: readonly ConnectedAgent[], now = new Date()): AgentRow[] {
  return agents.map((a) =>
    a.conversation
      ? {
          key: `in:${a.conversation.id}`,
          name: a.name,
          agent: readableAgent(a.name),
          label: readableAgent(a.name),
          status: agentWords.in(a.conversation.title),
          here: false,
          state: 'away' as const,
          href: `/make?elsewhere=${encodeURIComponent(a.conversation.id)}`,
          // seen there, not 'working': the server remembers the last call, however long ago
          when: a.last_seen ? shortWhen(a.last_seen, now) : '',
        }
      : {
          key: `${a.name}:${a.n ?? 1}`,
          name: a.name,
          agent: readableAgent(a.name),
          label: workerName(a.name, a.n),
          status: a.job
            ? agentWords.on(a.job.title)
            : a.waiting
              ? agentWords.waiting
              : agentWords.away,
          here: Boolean(a.job) || a.waiting,
          state: a.job ? 'busy' : a.waiting ? 'waiting' : 'away',
        },
  );
}

export const agentWords = {
  waiting: 'Waiting for a job',
  away: 'Not connected now',
  on: (title: string) => `On: ${title}`,
  /** An agent working in one of the person's conversations. */
  in: (title: string) => `In: ${title}`,
  /** The panel's top, with more than one agent connected. */
  several: (n: number) => `${n} agents`,
  /** The one prompt's button, the same at the panel's top and in Your agents. */
  copy: 'Connect an agent',
  copied: 'Copied. Paste it into each agent.',
  /** The prompt to paste, routing a cloud chat to the connector; `site` is this site's address and `key` a fresh agent link's token. */
  prompt: (site: string, key: string) =>
    `Be one of my agents in Petals. If you run on my computer, read ${site}/skill.md and set yourself up, then join with my agent key and wait for my jobs, as its Jobs section says. If you're the Claude app's chat or ChatGPT, run no download: use the Petals connector at ${site}/mcp, or tell me how to add it, then take my open jobs with my agent key. My agent key: ${key}`,
  /**
   * The setup skill's paste, for any chatbot and the least technical person: the landing's "Copy for my
   * agent" and a signed-out /make copy it. It has no key and makes the chatbot no worker: it takes the person
   * by the hand to their first conversation. Every step is here, in the person's own voice, because most
   * chatbots can't be counted on to open a link. One that can reads {site}/setup (the brain's setup chapter),
   * with an introduction to Petals and the same steps, kept current. `site` is this site's address.
   */
  setup: (site: string) =>
    [
      `Take me by the hand and set me up to use Petals at ${site} in my browser. It maps who holds power in on-chain networks and draws it as flowers. Guide me one small step at a time, wait for me after each, and skip anything I've already done. If you can open links, first read ${site}/setup and use it, because it has a short introduction to Petals and these same steps, kept up to date. If you can't, here they are.`,
      '1. A NEAR wallet. If I have none, help me make one with Meteor Wallet (meteorwallet.app), in my browser on any computer. It shows me a recovery phrase: I write it on paper and keep it offline. A new wallet needs no NEAR to sign in to Petals.',
      `2. Sign in. I open ${site} and press Connect, then pick my wallet and approve the sign-in. It's a signature, not a payment: it moves no funds and costs nothing.`,
      "3. Credit. Petals' agent runs on NEAR AI and is paid as I go; a flower costs a few cents. I add credit in my lobby, under Balance: Add funds opens the dollars to add, then an Add button with the dollars and the NEAR they come to (such as Add $1.00 · 0.29 NEAR), which my wallet approves as one deposit into Petals' credit contract. If I have no NEAR, Pay with another token: I pick the token and its chain and give my address on that chain for refunds, press Get the address to send to, and send exactly that amount, in one transfer from any wallet, before the time shown. When the credit is added, it says so. If credit runs out in a conversation, the chat's Add credit leads back there.",
      `4. My first conversation. I open ${site}/make and name a community, a wallet or a contract I care about. Petals' agent reads the chain and draws its flower beside the chat. Then I can ask "Show me the source" or "Who's behind this petal?"`,
      "Later, if I want my own agents to help, Connect an agent at the top of Petals' side panel brings them in. I don't need it to start.",
      'Never ask me for my recovery phrase or a private key, and stop me if I start to paste one. Signing in and paying are always approved in my wallet.',
    ].join('\n\n'),
} as const;
