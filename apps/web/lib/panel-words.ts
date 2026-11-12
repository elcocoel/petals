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
  backers: 'Who backs it',
  // each wallet's activity over its DAO's proposals (SYSTEMS's sys/activity; Elco, wave 2: "time is absent")
  last_active: 'Last active',
  votes_cast: 'Most active',
  voted: 'Voted or never',
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
  legendColours:
    'Each DAO colours its own values, the most common first: inside one, what each colour stands for',
  /** What a line between two flowers on the map is (Elco, 12 Nov, walk 2: "a little bit mysterious"). Drafts. */
  legendLines: 'Lines',
  /**
   * The map's two boxes (Elco, 12 Nov, walk 3: "one is the tools and things that the user can change by hand and
   * the other ones are informational"), and Information's part on what the map shows. Drafts.
   */
  tools: 'Tools',
  information: 'Information',
  infoSeen: 'On the map',
  /**
   * What each mark on the map is, far to near (Elco, 12 Nov, walk 3: "what these circles and lines mean"), in LOOK's
   * words of what it draws. Drafts.
   */
  seen: [
    {
      label: 'A round shape, far away',
      says: 'A DAO. Its outline swells where its biggest holders are; its mark in the middle.',
    },
    {
      label: 'Lines',
      says: 'Wallets two maps both hold. The thicker the line, the more of them; its number says how many.',
    },
    {
      label: 'The mark in the middle',
      says: "The DAO's logo; without one, its chain's, or its first letter in a thin ring. It steps back once you're inside.",
    },
    {
      label: 'The dashed ring',
      says: 'The DAO a click put in the middle. The others stand round it, nearest those sharing the most wallets with it.',
    },
    {
      label: 'The ring at the petals’ feet',
      says: 'Where the petals stand. With many petals it reads as a circle.',
    },
    {
      label: 'The thin circle round a DAO',
      says: 'Its outer edge, just past where a petal holding everything would reach. Drawn on DAOs whose proposals are read.',
    },
    {
      label: 'Short arcs on a petal',
      says: 'Proposals that wallet put up, oldest nearest. A grey arc with a number is more than three, folded: a click opens it.',
    },
    {
      label: 'Coloured dots at the petals’ feet',
      says: 'How each wallet voted on the proposal pointed at: mint for, pink against, grey abstained or neither. No dot, no vote.',
    },
    {
      label: 'The hollow dot at the end of a name',
      says: 'The petal that name belongs to.',
    },
  ],
  /** A map's floating box folds to its bar and opens again (Elco, 12 Nov: the map's panels move like /make's). */
  boxFold: 'Fold to its bar',
  boxOpen: 'Open',
  /** The legend's two sections, and the map's own rows (Elco, 12 Nov, walk 2: "a tool panel"). Drafts. */
  legendDimensions: 'Dimensions',
  legendMap: 'Map',
  /** Tools' sections (Elco, 12 Nov, wave 2: "the visual organization of this tool panel is still failing us"). Drafts. */
  toolsChains: 'Chains',
  legendPetals: 'Petals',
  legendMore: (n: number) => `More dimensions · ${n}`,
  legendOnMap: 'On the map',
  legendBlocs: 'Voting blocs',
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
    /**
     * What each dimension does, a quiet line under its name in Tools (Elco, 12 Nov, wave 3: "I don't understand all
     * of these options here"). Drafts.
     */
    does: {
      order: 'How the petals go round the circle',
      height: 'How far each petal reaches',
      width: 'How wide each petal is',
      colour: "What a petal's colour says",
      outline: "What a petal's edge says",
      texture: "What a petal's fill pattern says",
      markings: 'Marks drawn on a petal',
      segments: 'What a petal is cut into',
      lines: 'What joins one petal to another',
      labels: 'What names each petal',
    } as Record<string, string>,
    /** Under a number's scale. A draft. */
    scaleDoes: 'How the number grows into the size',
    /** Over Colour's values in Tools. A draft. */
    colourMeans: 'Each colour means',
    /** While the map is drawn again in a change (wave 3). A draft. */
    drawing: 'Updating the map',
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
