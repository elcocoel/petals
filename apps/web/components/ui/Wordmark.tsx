// Petals / Wordmark 12:12: three layers of live text at one origin. Sizes and axes come from the
// tokens, and each layer is em-based, so it scales as one. Only the front layer is read aloud.
const SIZES = {
  nav: 'wordmark-nav',
  workspace: 'wordmark-workspace',
  // 560 wide: on a phone it takes the nav's size rather than scroll the page.
  footer: 'wordmark-nav md:wordmark-footer',
  display: 'wordmark-display',
} as const;

export function Wordmark({ size = 'nav' }: { size?: keyof typeof SIZES }) {
  return (
    <span className={`wordmark ${SIZES[size]}`}>
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
