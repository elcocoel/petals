// Every word in the side panel (WorkMenu, on /make and /lobby), in one place, so the panel says one thing
// one way, never two buttons in different words claiming to do the same thing.
import { agentWords } from './agents.ts';

/** The side panel's sections, as WorkMenu draws them and useWorkMenu keeps which one is open. */
export type SectionKey = 'conversations' | 'projects' | 'agents';

/** What every flower has (core's EVERY_FLOWER), in plainer words. */
const PIECE_WORDS: Record<string, string> = {
  share: 'Share of the whole',
  amount: 'Amount held',
  kind: 'Kind of account',
  identity: 'Who it is',
  name: 'Its name',
  name_kind: 'Kind of name',
  backers: 'Who backs it',
  // each wallet's activity over its DAO's proposals, so time is present on the map
  last_active: 'Last active',
  votes_cast: 'Most active',
  voted: 'Voted or never',
  // a token's vesting, any token's: each
  // petal cut into unlocked, next unlock and later under Segments; its next unlock as a date; its allocation where a
  // reading names allocations
  vesting: 'Vesting',
  next_unlock: 'Next unlock',
  tranche: 'Allocation',
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
  },
  /** The person's icon in the bar: the lobby, where the account and its settings are kept. */
  account: 'Lobby',
  newConversation: 'New conversation',
  /** The legend's head: the person's view as a key. */
  legend: 'Legend',
  /** Under its Colour, on a map: each flower keys its own kinds (by how many petals carry each). */
  legendColours:
    'Each DAO colours its own values, the most common first: inside one, what each colour stands for',
  /** What a line between two flowers on the map is. */
  legendLines: 'Lines',
  /**
   * The map's two boxes (one holds the tools the person changes by hand, the other is informational), and
   * Information's part on what the map shows.
   */
  tools: 'Tools',
  information: 'Information',
  infoSeen: 'On the map',
  /**
   * What each mark on the map is, far to near, in the words of what the look draws.
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
  /** A map's floating box folds to its bar and opens again (the map's panels move like /make's). */
  boxFold: 'Fold to its bar',
  boxOpen: 'Open',
  /** The legend's two sections, and the map's own rows. */
  legendDimensions: 'Dimensions',
  legendMap: 'Map',
  /** Tools' sections. */
  toolsChains: 'Chains',
  legendPetals: 'Petals',
  legendMore: (n: number) => `More dimensions · ${n}`,
  legendOnMap: 'On the map',
  legendBlocs: 'Voting blocs',
  legendGravity: 'Gravity',
  legendVotes: 'Votes',
  /** What the map's Tools turn on and off (insights, pricing and the rest). */
  legendWorth: 'Treasury and price',
  legendInsights: 'Insights',
  legendLinesSay:
    'Wallets two maps both hold. The thicker the line, the more of them; its number says how many.',
  /**
   * Settings: how each dimension draws data, for every petal you look
   * at. The dimensions' names are the view's own (view/v2).
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
     * A piece of data as a person reads it: what every
     * flower has in plainer words; any other piece by its own name.
     */
    piece: (name: string) =>
      PIECE_WORDS[name] ?? `${name.charAt(0).toUpperCase()}${name.slice(1)}`.replaceAll('_', ' '),
    none: 'None',
    /** At a choice's end: the one everyone sees until they choose. */
    isDefault: 'default',
    scale: 'Scale',
    /** How a number grows into a petal's size: as it is, or softened. */
    scales: { sqrt: 'Softened', linear: 'As it is', log: 'Much softened' },
    /** A dimension no data takes yet, on hover. */
    nothingFits: 'No data takes this yet',
    /** Highlight, on hover, until a chosen group comes with the data. */
    highlightSoon: 'Comes with a chosen group of petals',
    reset: 'Put the default back',
    /**
     * What each dimension does, a quiet line under its name in Tools.
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
    /** Under a number's scale. */
    scaleDoes: 'How the number grows into the size',
    /** Over Colour's values in Tools. */
    colourMeans: 'Each colour means',
    /** Choosing colours, and a grade. */
    colourOf: (value: string) => `Colour for ${value}`,
    asItComes: 'As it comes',
    colourGrade: 'Lighter to darker',
    gradeHue: 'Its colour',
    /** While the map is drawn again in a change. */
    drawing: 'Updating the map',
    failed: (reason: string) => `Not saved: ${reason}`,
  },
  projects: 'Projects',
  newProject: 'New project',
  /** The new project's row, waiting for its name. */
  nameProject: 'Name the project',
  /** An open project with nothing in it yet. */
  emptyProject: 'Nothing in it yet',
  /** A conversation's menu. */
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
  /** The delete dialog, in the server's words of what goes and what stays. */
  removeTitle: (title: string) => `Delete “${title}”?`,
  removeBody:
    "This can't be undone. Its steps, notes and jobs go, and its links stop working. Drawings on the map, your kept layers and your credit stay.",
  removeYes: 'Delete it',
  removeNo: 'Cancel',
  /** How many conversations a project holds. */
  count: (n: number) => String(n),
  conversations: 'Conversations',
  /** What goes here, and the way to it is the first row of the panel. */
  noConversations: 'Your conversations show here',
  /** Your agents with nothing connected: connecting one is at the panel's top. */
  noAgents: 'Agents you connect show here',
  agents: 'Your agents',
  /** The one way to connect one: it copies the one prompt, with a fresh agent key. */
  connect: agentWords.copy,
  copied: agentWords.copied,
  disconnect: (agent: string) => `Disconnect ${agent}`,
  /** The top's way to end every agent at once (line 46): one waiting keeps spending on inference. */
  disconnectAll: 'Disconnect all agents',
  /** An agent's state, in a few characters at its row's end; the full line shows on hover. */
  state: { busy: 'on a job', working: 'working', waiting: 'waiting', away: 'away' },
  /** Read aloud for a working square. */
  working: 'Working',
  /** Who a conversation is with, shown on hover after its title. */
  withPetals: "With Petals' agent",
  withOwn: 'With your own agent',
} as const;
