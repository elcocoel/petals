// Every word in the side panel (WorkMenu, on /make and /lobby), in one place, so the panel says one thing
// one way (Elco, 10 Nov: "two buttons with different languages kind of claiming to do the same thing").
// Drafts, PANEL's, listed for Elco; "Lobby", "Projects" and "Conversations" are Elco's own words.
import { agentWords } from './agents.ts';

/** The side panel's sections, as WorkMenu draws them and useWorkMenu keeps which one is open. */
export type SectionKey = 'conversations' | 'projects' | 'agents' | 'lobby' | 'profile' | 'settings';

/** What every flower has (core's EVERY_FLOWER), in plainer words. Drafts. */
const PIECE_WORDS: Record<string, string> = {
  share: 'Share of the whole',
  amount: 'Amount held',
  kind: 'Kind of account',
  identity: 'Who it is',
  name: 'Its name',
  name_kind: 'Kind of name',
};

export const panelWords = {
  /** What a screen reader hears for the panel. */
  panel: 'Your work',
  /** The one collapse control, as it is now, read aloud and in its tooltip. */
  fold: 'Hide the panel',
  unfold: 'Show the panel',
  /** The sections, as their icons are read aloud and shown on hover, and as each one's head. */
  sections: {
    conversations: 'Conversations',
    projects: 'Projects',
    agents: 'Your agents',
    lobby: 'Lobby',
    profile: 'Profile',
    settings: 'Settings',
  },
  newConversation: 'New conversation',
  /** The Lobby section's rows: each opens its card on /lobby. */
  balance: 'Balance',
  onTheMap: 'On the map',
  /** The Profile section: the public profile's state, a few characters at its row's end. */
  socialState: {
    petals: 'In Petals',
    profile: 'NEAR Social',
    reading: '…',
    unread: 'No answer',
  },
  signOut: 'Disconnect',
  /** The legend's head (design/legend.md): the person's view as a key. */
  legend: 'Legend',
  /** Under its Colour, on a map: each flower keys its own kinds (#76's keys, by how many petals carry each). */
  legendColours: "Each flower's own: its most common kind first",
  /** What a line between two flowers on the map is (Elco, 12 Nov, walk 2: "a little bit mysterious"). Drafts. */
  legendLines: 'Lines',
  /**
   * The map's two boxes (Elco, 12 Nov, walk 3: "one is the tools and things that the user can change by hand and
   * the other ones are informational"), and Information's part on what the map shows. Drafts.
   */
  tools: 'Tools',
  information: 'Information',
  infoSeen: 'On the map',
  /** A map's floating box folds to its bar and opens again (Elco, 12 Nov: the map's panels move like /make's). */
  boxFold: 'Fold to its bar',
  boxOpen: 'Open',
  /** The legend's two sections, and the map's own rows (Elco, 12 Nov, walk 2: "a tool panel"). Drafts. */
  legendDimensions: 'Dimensions',
  legendMap: 'Map',
  legendGravity: 'Gravity',
  legendVotes: 'Votes',
  /** What the map's Tools turn on and off (Elco, walk 3: "insights on and off ... pricing etc"). Drafts. */
  legendWorth: 'Treasury and price',
  legendInsights: 'Insights',
  legendLinesSay:
    'Wallets two maps both hold. The thicker the line, the more of them; its number says how many.',
  /**
   * Settings (coordinator/one-source.md, step 7): how each dimension draws data, for every petal you look
   * at. The dimensions' names are the view's own (view/v2); the rest are drafts.
   */
  settings: {
    dimensions: {
      height: 'Height',
      width: 'Width',
      order: 'Order',
      colour: 'Colour',
      outline: 'Outline',
      texture: 'Texture',
      markings: 'Markings',
      segments: 'Segments',
      lines: 'Lines',
      labels: 'Labels',
      highlight: 'Highlight',
    },
    /**
     * A piece of data as a person reads it (Elco, 12 Nov, walk 3: "the dimensions copy is confusing"): what every
     * flower has in plainer words, drafts; any other piece by its own name.
     */
    piece: (name: string) =>
      PIECE_WORDS[name] ?? `${name.charAt(0).toUpperCase()}${name.slice(1)}`.replaceAll('_', ' '),
    none: 'None',
    /** At a choice's end: the one everyone sees until they choose. */
    isDefault: 'default',
    scale: 'Scale',
    /** How a number grows into a petal's size: as it is, or softened. Drafts (walk 3: clearer words). */
    scales: { sqrt: 'Softened', linear: 'As it is', log: 'Much softened' },
    /** A dimension no data takes yet, on hover. */
    nothingFits: 'No data takes this yet',
    /** Highlight, on hover, until a chosen group comes with the data. A draft. */
    highlightSoon: 'Comes with a chosen group of petals',
    reset: 'Put the default back',
    failed: (reason: string) => `Not saved: ${reason}`,
  },
  projects: 'Projects',
  newProject: 'New project',
  /** The new project's row, waiting for its name. */
  nameProject: 'Name the project',
  /** An open project with nothing in it yet. */
  emptyProject: 'Nothing in it yet',
  /** A conversation's menu (design/side-panel.md, lines 24 to 29). Drafts. */
  more: (title: string) => `More for “${title}”`,
  moveToProject: 'Move to project…',
  archive: 'Archive',
  unarchive: 'Unarchive',
  remove: 'Delete',
  /** The move dialog. */
  moveTitle: (title: string) => `Move “${title}”`,
  findProject: 'Find a project',
  noProjectFound: (words: string) => `No project has “${words}”`,
  outOfProject: 'No project',
  close: 'Close',
  /** Said after a move, to a screen reader. */
  moved: (title: string, project: string | null) =>
    project ? `Moved “${title}” to ${project}` : `Took “${title}” out of its project`,
  /** Archived, at the end of Conversations, with how many. */
  archived: 'Archived',
  /** The delete dialog, in SYSTEMS's words of what goes and what stays. */
  removeTitle: (title: string) => `Delete “${title}”?`,
  removeBody:
    "This can't be undone. Its steps, notes and jobs go, and its links stop working. Drawings on the map, your kept layers and your credit stay.",
  removeYes: 'Delete it',
  removeNo: 'Cancel',
  /** How many conversations a project holds. */
  count: (n: number) => String(n),
  conversations: 'Conversations',
  /** Rule 2: what goes here, and the way to it is the first row of the panel. */
  noConversations: 'Your conversations show here',
  /** Your agents with nothing connected: connecting one is at the panel's top. A draft. */
  noAgents: 'Agents you connect show here',
  agents: 'Your agents',
  /** The one way to connect one: it copies the one prompt, with a fresh agent key. */
  connect: agentWords.copy,
  copied: agentWords.copied,
  disconnect: (agent: string) => `Disconnect ${agent}`,
  /** The top's way to end every agent at once (line 46): one waiting keeps spending on inference. */
  disconnectAll: 'Disconnect all agents',
  /** An agent's state, in a few characters at its row's end; the full line shows on hover. */
  state: { busy: 'on a job', waiting: 'waiting', away: 'away' },
  /** Read aloud for a working square. */
  working: 'Working',
  /** Who a conversation is with, shown on hover after its title. */
  withPetals: "With Petals' agent",
  withOwn: 'With your own agent',
} as const;
