// A source outside Petals, linked beside the value it gave (Elco, 12 Nov: "link the source next to data we
// didn't gather (simple tiny link icon next to it might do - the little diagonal arrow that signals that this is
// an outside source")): the icon family's diagonal arrow, quiet, in the words' size, opening the source where
// the value was read. Props only.
import { Icon } from './Icon.tsx';

export function SourceLink({
  href,
  name,
}: {
  /** Where the value was read. */
  href: string;
  /** The source's name, for a screen reader and on hover. */
  name: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`${name}: ${href}`}
      aria-label={`${name}, an outside source`}
      data-b="link"
      className="inline-flex items-center px-space-4 align-baseline text-muted no-underline hover:text-primary"
    >
      <Icon name="outside" />
    </a>
  );
}
