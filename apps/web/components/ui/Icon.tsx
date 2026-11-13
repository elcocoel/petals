// Every icon on the site, from one family: Phosphor (@phosphor-icons/react, pinned at 2.1.10), as Fire draws
// its own (Elco, 10 Nov: "let's define our icons family and stay within it - whatever is the latest one I
// was using for fire was great, let's go with that"). One weight, regular, as Fire's, and two sizes from the
// tokens: Icon size beside Label words, Icon small beside UI words in the side panel. The names below are
// Petals' roles; which glyph plays each is decided here and nowhere else, so Phosphor's own names never
// leave this file, as in Fire's phosphor-semantic-icons.ts. The arrows sit in text, so they're sized in em.
// SSR glyphs: they need no context, so a server component can draw them.
import type { Icon as Glyph } from '@phosphor-icons/react';
import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ArrowUUpLeft,
  CaretDown,
  CaretRight,
  ChatCircle,
  DotsThree,
  Flower,
  FolderSimple,
  GearSix,
  GithubLogo,
  House,
  IdentificationCard,
  List,
  MapTrifold,
  Pause,
  Play,
  Plug,
  Plus,
  SidebarSimple,
  SignOut,
  SquaresFour,
  Star,
  TelegramLogo,
  TerminalWindow,
  Trash,
  TwitterLogo,
  UserCircle,
  Wallet,
  X,
  YoutubeLogo,
} from '@phosphor-icons/react/dist/ssr';

const GLYPHS = {
  home: House,
  plus: Plus,
  gallery: SquaresFour,
  connect: Plug,
  arrow: ArrowRight,
  // a source outside Petals, linked beside what it gave (Elco, 12 Nov: "the little diagonal arrow")
  outside: ArrowUpRight,
  back: ArrowLeft,
  /** The side panel's fold. */
  sidebar: SidebarSimple,
  project: FolderSimple,
  /** A row that opens: it turns down when open. */
  chevron: CaretRight,
  /** The same row, open: a control that folds it again, drawn turned, so its own tooltip never turns. */
  down: CaretDown,
  close: X,
  /** A conversation with Petals' agent. */
  petals: Flower,
  /** A conversation with, or a line for, the person's own agent. */
  agent: TerminalWindow,
  /** The side panel's sections (Elco, 10 Nov: "each of them is a set of tools"), and what they hold. */
  conversation: ChatCircle,
  profile: UserCircle,
  settings: GearSix,
  balance: Wallet,
  map: MapTrifold,
  /** The public profile a person declares on NEAR Social. */
  card: IdentificationCard,
  /** Signing out. */
  leave: SignOut,
  /** Putting something back as it was. */
  undo: ArrowCounterClockwise,
  // the nav's links, folded on a phone
  menu: List,
  // a story that plays by itself, stopped and started (the hero, 11 Nov)
  pause: Pause,
  play: Play,
  /** A row's menu of what can be done with it. */
  more: DotsThree,
  archive: Archive,
  unarchive: ArrowUUpLeft,
  /** Removing something for good. */
  remove: Trash,
  // a star given to Petals on GitHub, and the socials under the hero's buttons
  star: Star,
  github: GithubLogo,
  telegram: TelegramLogo,
  twitter: TwitterLogo,
  youtube: YoutubeLogo,
} as const satisfies Record<string, Glyph>;

export type IconName = keyof typeof GLYPHS;

/** The family's one weight. */
const WEIGHT = 'regular';

export function Icon({
  name,
  accent,
  small,
}: {
  name: IconName;
  accent?: boolean;
  /** Beside UI words, in the side panel. */
  small?: boolean;
}) {
  const Drawn = GLYPHS[name];
  const inText = name === 'arrow' || name === 'back' || name === 'outside';
  const box = inText ? 'inline' : small ? 'size-icon-small' : 'size-icon-size';
  return (
    <Drawn
      aria-hidden="true"
      focusable="false"
      weight={WEIGHT}
      // in text, an arrow as long as a Label word's capital is high
      size={inText ? '0.875em' : undefined}
      data-icon={name}
      className={`shrink-0 ${box} ${accent ? 'text-action-accent' : ''}`}
    />
  );
}
