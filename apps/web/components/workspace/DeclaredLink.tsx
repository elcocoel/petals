// One link a profile declares, as its row shows it: an address to follow, in a new tab off Petals (TextLink), when
// it can be one (lib/outside.ts linkHref: a full address, a bare host as https, a handle on its service's page);
// else the text as kept. Followed only when pressed: never fetched, checked or trusted. Props only.
import { linkHref } from '../../lib/outside.ts';
import { TextLink } from '../ui/TextLink.tsx';

export function DeclaredLink({ service, value }: { service: string; value: string }) {
  const href = linkHref(service, value);
  return (
    <span className="min-w-0 flex-1 type-label wrap-anywhere">
      {href ? <TextLink href={href}>{value}</TextLink> : value}
    </span>
  );
}
