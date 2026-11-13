// Petals / Wordmark 12:12: three layers of live text at one origin. Sizes and axes come from the
// tokens, and each layer is em-based, so it scales as one. Only the front layer is read aloud.
const SIZES = {
  nav: 'wordmark-nav',
  workspace: 'wordmark-workspace',
  panel: 'wordmark-panel',
  // 560 wide: on a phone it takes the nav's size rather than scroll the page.
  footer: 'wordmark-nav md:wordmark-footer',
  // As wide as its column, a container's (mark.fill); the footer's size where that doesn't run.
  fill: 'wordmark-nav md:wordmark-footer',
} as const;

/** `mono`: in the band's greys, pressed into it (mark.mono). */
export function Wordmark({
  size = 'nav',
  mono = false,
}: {
  size?: keyof typeof SIZES;
  mono?: boolean;
}) {
  return (
    <span
      data-b="mark"
      data-kind="wordmark"
      data-size={size === 'fill' ? 'fill' : undefined}
      data-tone={mono ? 'mono' : undefined}
      className={`wordmark ${SIZES[size]}`}
    >
      <span aria-hidden="true" className="wordmark-back select-none">
        Petals
      </span>
      <span aria-hidden="true" className="wordmark-middle select-none">
        Petals
      </span>
      <span className="wordmark-front">Petals</span>
    </span>
  );
}
