// Every icon: one 18 by 18 box, one stroke. Home and plus are Workspace / Navigation rail 43:748; the
// next two are drawn to match them, because the rail has more in it than the frame does. The arrows are
// a Button's, a TextLink's or a Terminal line's, drawn because Google's Geist Mono has no U+2192 or
// U+2190. They sit in text, so they're sized in em: 10 wide at Label.
const PATHS = {
  home: 'M2.25 8.25L9 2.25L15.75 8.25M3.75 7.5V15H7.5V10.5H10.5V15H14.25V7.5',
  plus: 'M9 3V9M9 9V15M9 9H3M9 9H15',
  gallery: 'M3 3H7.5V7.5H3ZM10.5 3H15V7.5H10.5ZM3 10.5H7.5V15H3ZM10.5 10.5H15V15H10.5Z',
  connect: 'M6.75 2.25V6M11.25 2.25V6M4.5 6H13.5V8.25A4.5 4.5 0 0 1 4.5 8.25ZM9 12.75V15.75',
  arrow: 'M0 9H17.1M9.9 1.8L17.1 9L9.9 16.2',
  back: 'M18 9H0.9M8.1 1.8L0.9 9L8.1 16.2',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, accent }: { name: IconName; accent?: boolean }) {
  const inText = name === 'arrow' || name === 'back';
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
      className={`shrink-0 ${inText ? 'inline' : 'size-icon-size'} ${accent ? 'text-action-accent' : ''}`}
    >
      <path className="figure-stroke" d={PATHS[name]} />
    </svg>
  );
}
