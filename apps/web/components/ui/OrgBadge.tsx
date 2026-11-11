// One badge for an organisation (design/org-badge.md; Elco, 11 Nov: "we need this badge that is opaque that
// can withstand being surrounded by a lot of information"; board #86). Its logo, round as the map draws it,
// or its token symbol in mono where there's no logo, then its name, then what kind of thing it is, quiet in
// mono (any value, several at once: #97; no colour or shape is a type's): one row high, on a solid fill of the
// ground it's on with a hairline edge, so nothing behind it shows through. Information only, as Badge is:
// no hover and no press of its own, square corners in v1.
import { Logo } from './Logo.tsx';
import { Mono } from './Mono.tsx';

export function OrgBadge({
  name,
  symbol = null,
  logo = null,
  types = [],
}: {
  name: string;
  /** Its token symbol: shown where there's no logo. */
  symbol?: string | null;
  /** An image of its logo (a URL or a data URL), drawn round. */
  logo?: string | null;
  /** What kind of thing it is (a DAO, a multisig, any value the data gives), in its order. */
  types?: readonly string[];
}) {
  const sym = symbol?.trim() || null;
  // a name that's only its symbol is said once, by the symbol
  const nameIsSymbol = !logo && sym !== null && sym.toLowerCase() === name.trim().toLowerCase();
  return (
    <span
      title={[name, ...types].join(' · ')}
      className="inline-flex h-row-height max-w-full min-w-0 shrink-0 items-center gap-space-8 border border-hairline bg-surface px-space-8 whitespace-nowrap text-primary"
    >
      {logo ? (
        <Logo src={logo} />
      ) : sym ? (
        <span className="shrink-0">
          <Mono as="span" tone={nameIsSymbol ? 'primary' : 'muted'}>
            {sym}
          </Mono>
        </span>
      ) : null}
      {!nameIsSymbol && <span className="min-w-0 truncate type-ui">{name}</span>}
      {types.length > 0 && (
        // it takes only the room the name leaves, so it's cut first (design/org-badge.md, line 9)
        <span className="min-w-0 grow basis-0 truncate type-mono text-muted">
          {types.join(' · ')}
        </span>
      )}
    </span>
  );
}
