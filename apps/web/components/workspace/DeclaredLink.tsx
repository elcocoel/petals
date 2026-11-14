// One link a profile declares, as its row shows it: an address to follow, in a new tab off Petals (TextLink), when
// it can be one (lib/outside.ts linkHref: a full address, a bare host as https, a handle on its service's page);
// else the text as kept. Followed only when pressed: never fetched, checked or trusted. Props only.
import { linkHref, linkText } from '../../lib/outside.ts';
import { TextLink } from '../ui/TextLink.tsx';

export function DeclaredLink({ service, value }: { service: string; value: string }) {
  const href = linkHref(service, value);
  return (
    // an address as 'github.com/elcocoel', on one line, cut short with an ellipsis if it must be, whole on hover
    <span title={href ?? value} className="min-w-0 flex-1 truncate type-label">
      {href ? <TextLink href={href}>{linkText(href)}</TextLink> : value}
    </span>
  );
}
