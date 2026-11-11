// Where the site's words point, in one place. Landing anchors start with / so they work from any page.
import type { View } from '@petal/core/types';
import { flowerImage } from './flower-view.ts';

/** /make puts q in its box, unsent: one press asks it. */
export const askHref = (question: string) => `/make?q=${encodeURIComponent(question)}`;

/** The published shape the landing's live reading shows, and whose reading its findings quote. */
const LIVE_SHAPE = '9ac16c8917aa5ca579c8421a';

/**
 * The address other people's AI reaches Petals at, on every page, so what the landing hands out works
 * from anyone's machine: the site's own address since 11 Nov (T191; petal-flowers.vercel.app redirects here).
 */
export const publicOrigin = 'https://petals.elementarycomplexity.com';

export const siteLinks = {
  home: '/',
  make: '/make',
  /** A person's own place (specs/004-workspace, W3): where connecting a wallet lands. */
  lobby: '/lobby',
  /** A person's own profile page (#79): who they are and what backs them. */
  profile: '/profile',
  /** The grid of every map's tile (one name per thing: the Gallery). */
  gallery: '/gallery',
  /** The Power Map: the continuous map (coordinator/one-source.md, step 5). */
  map: '/map',
  connect: '/connect',
  /** The docs: the brain, the data and rendering protocols, connecting an agent, the API (DOCS, 11 Nov). */
  docs: '/docs',
  /** The doors on /connect (lib/doors.ts), which say plainly what each app asks you to do. */
  doors: {
    prompt: '/connect#prompt',
    claude: '/connect#claude-app',
    chatgpt: '/connect#chatgpt',
    claudeCode: '/connect#claude-code',
  },
  howItWorks: '/#how-it-works',
  liveShape: `/f/${LIVE_SHAPE}`,
  /** its picture, in the person's view */
  liveShapeImage: (view: View) => flowerImage(LIVE_SHAPE, view),
} as const;
