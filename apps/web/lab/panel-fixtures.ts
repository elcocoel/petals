// The side panel's states for /lab/panel, the basic stress test an interface should handle: nothing yet, a
// first afternoon, and forty conversations in six projects with three agents. Titles are written the way
// Petals' agent will name a conversation: a few plain words for its subject. The rows go through the same
// functions the pages use.
import { agentRows, type ConnectedAgent } from '../lib/agents.ts';
import {
  type ConversationRow,
  conversationRows,
  type ListedConversation,
  type ListedProject,
} from '../lib/conversation-list.ts';
import type { SocialState } from '../lib/lobby-view.ts';
import type { SectionKey } from '../lib/panel-words.ts';

export const PANEL_NOW = new Date('2026-11-10T16:00:00.000Z');

const ago = (minutes: number) => new Date(PANEL_NOW.getTime() - minutes * 60_000).toISOString();
const H = 60;
const D = 24 * H;

type Line = [
  title: string,
  minutes: number,
  folder: string | null,
  by: 'petals' | 'own',
  running?: boolean,
];

const FORTY: Line[] = [
  ['Top ten validators by stake', 0, 'p1', 'petals', true],
  ["Who custodies Binance's NEAR", 12, 'p1', 'own', true],
  ['Ref treasury outflows in October', 40, 'p2', 'petals'],
  ['Stake moved after the fee change', 2 * H, 'p1', 'petals'],
  ['Moloch share holders today', 3 * H, 'p3', 'petals'],
  ["Validators whose stake comes from one exchange's custody wallets", 4 * H, null, 'petals'],
  ['Ref multisig signers', 5 * H, 'p2', 'own'],
  ['Aurora bridge custodians', 7 * H, 'p4', 'petals'],
  ['Who votes in NEAR governance', 9 * H, null, 'own'],
  ['Ragequits since summer', 1 * D, 'p3', 'own'],
  ['Bridge inflows by chain', 1 * D + 2 * H, 'p4', 'petals'],
  ['SWEAT holders over a million', 1 * D + 5 * H, 'p5', 'own'],
  ['Lido on NEAR, what is left', 1 * D + 8 * H, null, 'petals'],
  ['Validator commission changes', 2 * D, 'p6', 'petals'],
  ['Delegators who left Figment', 2 * D + 3 * H, 'p6', 'petals'],
  ['The foundation wallets', 2 * D + 6 * H, null, 'petals'],
  ['Meta Pool stake by pool', 3 * D, null, 'own'],
  ['Treasury grants paid in Q3', 3 * D + 4 * H, 'p2', 'petals'],
  ['Exchanges holding NEAR', 3 * D + 9 * H, 'p1', 'own'],
  ['Moloch proposals that passed', 4 * D, 'p3', 'petals'],
  ['Wallets behind the token', 4 * D + 6 * H, null, 'petals'],
  ['SWEAT staking contracts', 5 * D, 'p5', 'petals'],
  ['Who runs the Aurora DAO', 5 * D + 5 * H, 'p4', 'own'],
  ['Unstaking queue this week', 6 * D, null, 'petals'],
  ['NEAR on Ethereum, by holder', 6 * D + 8 * H, null, 'own'],
  ['Payout addresses of the top pools', 8 * D, 'p6', 'petals'],
  ['Octopus validators', 9 * D, null, 'petals'],
  ['A test of the map search', 9 * D + 2 * H, null, 'petals'],
  ['Stake held by lockup contracts', 10 * D, null, 'own'],
  ['Who backs the Ref token', 11 * D, 'p2', 'petals'],
  ['Pools with one big delegator', 12 * D, 'p1', 'petals'],
  ['Moloch members who never voted', 13 * D, 'p3', 'own'],
  ['Sweat Foundation wallets', 14 * D, 'p5', 'petals'],
  ['Rainbow bridge relayers', 15 * D, 'p4', 'petals'],
  ['Chunk producers by region', 17 * D, null, 'petals'],
  ['Old validators gone quiet', 19 * D, null, 'own'],
  ['Who paid for the hackathon prizes', 21 * D, null, 'petals'],
  ['Social accounts with most followers', 24 * D, null, 'petals'],
  ['Stake in the first week of mainnet', 330 * D, null, 'petals'],
  ['Genesis allocations', 360 * D, null, 'own'],
];

const listed = (lines: Line[]): ListedConversation[] =>
  lines.map(([title, minutes, folder, by, running], i) => ({
    id: `c${i}`,
    run_id: by === 'petals' ? `r${i}` : null,
    title,
    status: running ? 'running' : by === 'own' ? 'elsewhere' : 'done',
    updated_at: ago(minutes),
    folder,
  }));

const PROJECTS: ListedProject[] = [
  { id: 'p1', name: 'NEAR stake', parent: null, position: 0 },
  { id: 'p2', name: 'Ref Finance treasury', parent: null, position: 1 },
  { id: 'p3', name: 'Moloch DAO shares', parent: null, position: 2 },
  { id: 'p4', name: 'Aurora bridge', parent: null, position: 3 },
  { id: 'p5', name: 'Sweat economy', parent: null, position: 4 },
  { id: 'p6', name: 'Validator payouts', parent: null, position: 5 },
];

const AGENTS: ConnectedAgent[] = [
  {
    name: 'claude-code',
    n: 1,
    waiting: false,
    job: { id: 'j1', title: "Who custodies Binance's NEAR" },
  },
  { name: 'claude-code', n: 2, waiting: true, job: null },
  { name: 'codex', n: 1, waiting: true, job: null },
  { name: 'hermes', n: 1, waiting: false, job: null },
];

export interface PanelFixture {
  name: string;
  rows: ConversationRow[];
  projects: ListedProject[];
  opened: string[];
  agents: ReturnType<typeof agentRows>;
  /** The section the panel opens scrolled to, or null for the panel collapsed to the bar. */
  section: SectionKey | null;
  you: { account: string | null; social: SocialState };
}

const NEW_PERSON = {
  account: '446815176e3ea9c5e07d2d1fbf2e5843288b060eca0a3d31a54b39e98c9d1ef5',
  social: { kind: 'none' } as SocialState,
};
const ELCO_LIKE = {
  account: 'researcher.near',
  social: {
    kind: 'profile',
    profile: { name: 'A researcher', about: null, avatar: null, links: [] },
    source: 'petals',
  } as SocialState,
};

const forty = {
  rows: conversationRows(listed(FORTY), { runId: 'r3' }, PANEL_NOW),
  projects: PROJECTS,
  opened: ['p1', 'p2'],
  agents: agentRows(AGENTS),
};

export const PANEL_STATES = {
  empty: {
    name: 'Nothing yet',
    rows: [],
    projects: [],
    opened: [],
    agents: [],
    section: 'conversations',
    you: NEW_PERSON,
  },
  five: {
    name: 'A first afternoon',
    rows: conversationRows(
      listed(FORTY.slice(0, 5).map(([t, m, , by, r]) => [t, m, null, by, r] as Line)),
      { runId: 'r2' },
      PANEL_NOW,
    ),
    projects: [],
    opened: [],
    agents: agentRows([{ name: 'claude-code', waiting: true, job: null }]),
    section: 'conversations',
    you: NEW_PERSON,
  },
  forty: { name: 'Forty, in six projects', ...forty, section: 'projects', you: ELCO_LIKE },
  profile: { name: 'Profile', ...forty, section: 'profile', you: ELCO_LIKE },
  settings: { name: 'Settings', ...forty, section: 'settings', you: ELCO_LIKE },
  folded: { name: 'Collapsed to the bar', ...forty, section: null, you: ELCO_LIKE },
} satisfies Record<string, PanelFixture>;

export type PanelState = keyof typeof PANEL_STATES;
