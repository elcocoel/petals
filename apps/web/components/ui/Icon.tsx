// Every icon on the site, from one family: Phosphor (@phosphor-icons/react, pinned at 2.1.10), as Fire draws
// its own (Elco, 10 Nov: "let's define our icons family and stay within it - whatever is the latest one I
// was using for fire was great, let's go with that"). One weight, regular, as Fire's, and two sizes from the
// tokens: Icon size beside Label words, Icon small beside UI words in the side panel. The names below are
// Petals' roles; which glyph plays each is decided here and nowhere else, so Phosphor's own names never
// leave this file, as in Fire's phosphor-semantic-icons.ts. The arrows sit in text, so they're sized in em.
// SSR glyphs: they need no context, so a server component can draw them.
import type { Icon as Glyph } from '@phosphor-icons/react';
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  CaretRight,
  ChatCircle,
  Flower,
  FolderSimple,
  GearSix,
  House,
  IdentificationCard,
  MapTrifold,
  Plug,
  Plus,
  SidebarSimple,
  SignOut,
  SquaresFour,
  TerminalWindow,
  UserCircle,
  Wallet,
  X,
} from '@phosphor-icons/react/dist/ssr';

const GLYPHS = {
  home: House,
  plus: Plus,
  gallery: SquaresFour,
  connect: Plug,
  arrow: ArrowRight,
  back: ArrowLeft,
  /** The side panel's fold. */
  sidebar: SidebarSimple,
  project: FolderSimple,
  /** A row that opens: it turns down when open. */
  chevron: CaretRight,
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
  const inText = name === 'arrow' || name === 'back';
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
