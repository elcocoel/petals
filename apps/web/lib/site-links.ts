// Where the site's words point, in one place. Landing anchors start with / so they work from any page.

/** /make puts q in its box, unsent: one press asks it. */
export const askHref = (question: string) => `/make?q=${encodeURIComponent(question)}`;

/** The published shape the landing's live reading shows, and whose reading its findings quote. */
const LIVE_SHAPE = '9ac16c8917aa5ca579c8421a';

/**
 * The address other people's AI reaches Petals at, on every page, so what the landing hands out works
 * from anyone's machine. It changes here when the site gets its own address (T191).
 */
export const publicOrigin = 'https://petal-flowers.vercel.app';

export const siteLinks = {
  home: '/',
  make: '/make',
  /** A person's own place (specs/004-workspace, W3): where connecting a wallet lands. */
  lobby: '/lobby',
  gallery: '/gallery',
  connect: '/connect',
  /** The doors on /connect (lib/doors.ts), which say plainly what each app asks you to do. */
  doors: {
    prompt: '/connect#prompt',
    claude: '/connect#claude-app',
    chatgpt: '/connect#chatgpt',
    claudeCode: '/connect#claude-code',
  },
  howItWorks: '/#how-it-works',
  liveShape: `/f/${LIVE_SHAPE}`,
  liveShapeImage: `/api/v1/flowers/${LIVE_SHAPE}/svg`,
  /** No address yet. In-page, so nothing is invented; the coordinator holds the list. */
  noDestination: '#',
} as const;
