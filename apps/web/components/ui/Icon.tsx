// Every icon: one 18 by 18 box, one stroke. Home and plus are Workspace / Navigation rail 43:748; the
// next two are drawn to match them, because the rail has more in it than the frame does. The arrows are
// a Button's, a TextLink's or a Terminal line's, drawn because Google's Geist Mono has no U+2192 or
// U+2190. They sit in text, so they're sized in em: 10 wide at Label. The side panel's (Elco, 10 Nov)
// are drawn on the same box and shown at Icon small, beside UI words: the panel's fold, a project, a
// row that opens, closing something, and who a conversation is with. Petals' agent is a flower as
// Petals draws one, straight edges around a polygon with a line between each petal; a person's own agent
// is a terminal.
const PATHS = {
  home: 'M2.25 8.25L9 2.25L15.75 8.25M3.75 7.5V15H7.5V10.5H10.5V15H14.25V7.5',
  plus: 'M9 3V9M9 9V15M9 9H3M9 9H15',
  gallery: 'M3 3H7.5V7.5H3ZM10.5 3H15V7.5H10.5ZM3 10.5H7.5V15H3ZM10.5 10.5H15V15H10.5Z',
  connect: 'M6.75 2.25V6M11.25 2.25V6M4.5 6H13.5V8.25A4.5 4.5 0 0 1 4.5 8.25ZM9 12.75V15.75',
  sidebar: 'M2.25 3.75H15.75V14.25H2.25ZM6.75 3.75V14.25',
  project: 'M2.25 4.5H7.125L8.625 6H15.75V14.25H2.25Z',
  chevron: 'M7.125 4.5L11.625 9L7.125 13.5',
  close: 'M4.875 4.875L13.125 13.125M13.125 4.875L4.875 13.125',
  petals:
    'M9 2.25L14.85 5.625V12.375L9 15.75L3.15 12.375V5.625ZM9 2.25V15.75M3.15 5.625L14.85 12.375M14.85 5.625L3.15 12.375',
  agent: 'M2.25 3.75H15.75V14.25H2.25ZM5.25 7.125L7.5 9L5.25 10.875M9.375 10.875H12.75',
  arrow: 'M0 9H17.1M9.9 1.8L17.1 9L9.9 16.2',
  back: 'M18 9H0.9M8.1 1.8L0.9 9L8.1 16.2',
} as const;

export type IconName = keyof typeof PATHS;

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
  const inText = name === 'arrow' || name === 'back';
  const box = small ? 'size-icon-small' : 'size-icon-size';
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 18 18"
      width={inText ? '0.625em' : undefined}
      height={inText ? '0.625em' : undefined}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${inText ? 'inline' : box} ${accent ? 'text-action-accent' : ''}`}
    >
      <path className="figure-stroke" d={PATHS[name]} />
    </svg>
  );
}
