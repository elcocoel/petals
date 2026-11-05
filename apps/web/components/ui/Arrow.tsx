// The arrow of a Button, a TextLink or a Terminal line. Figma sets it in Geist Mono, but Google's Geist
// Mono has no U+2192 or U+2190 and the text fell back to Arial, so it's drawn. In em, so it scales with
// the label: 10 wide at Label, like Figma's.
export function Arrow({ accent, back }: { accent?: boolean; back?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 10 10"
      width="0.625em"
      height="0.625em"
      fill="none"
      stroke="currentColor"
      className={accent ? 'inline shrink-0 text-action-accent' : 'inline shrink-0'}
    >
      <path d={back ? 'M10 5H.5M4.5 1l-4 4 4 4' : 'M0 5h9.5M5.5 1l4 4-4 4'} />
    </svg>
  );
}
