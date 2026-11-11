// What Petals' own mapping says about the map you're in (lib/map-claims.ts; Elco, 11 Nov: "we need to design
// how authored claims show on the map"): one of the overlays, quiet until asked, folded to its bar with how
// many there are. Open, each account under its petal's name, each claim as the flower's box says one: its
// words, then how it's known and who said it, quiet in mono. Pressing a claim says which tool made it and when,
// and what it rests on: what a note rests on and doesn't claim, an inference's method, each piece of evidence
// with who found it and when. Never "verified". Props only.
import type { MapClaimGroup } from '../lib/map-claims.ts';
import { mapClaimWords as words } from '../lib/map-claims.ts';
import { Mono } from './ui/Mono.tsx';
import { Overlay } from './ui/Overlay.tsx';
import { TextLink } from './ui/TextLink.tsx';

/** A row that answers as the panel's do (NavItem's fill), but holds a claim's lines. */
const ROW =
  'flex h-auto w-full flex-col items-start gap-space-4 bg-transparent px-space-8 py-space-8 text-left whitespace-normal text-primary hover:bg-tint hover:opacity-100 aria-expanded:bg-tint';

export function MapClaims({
  groups,
  open,
  onOpen,
  fold,
}: {
  groups: readonly MapClaimGroup[];
  /** The claim whose evidence is open, by its key. */
  open: string | null;
  onOpen: (key: string) => void;
  fold: { open: boolean; onToggle: () => void };
}) {
  const count = groups.reduce((n, g) => n + g.lines.length, 0);
  return (
    <Overlay title={fold.open ? words.title : words.folded(count)} fold={fold}>
      <div className="flex max-h-figure-height flex-col gap-space-8 overflow-y-auto overscroll-none">
        {groups.map((g) => (
          <section key={g.account} aria-label={g.name} className="flex flex-col">
            <p className="my-0 flex min-w-0 items-baseline justify-between gap-space-8 px-space-8 py-space-4">
              <span className="min-w-0 truncate type-ui text-muted" title={g.account}>
                {g.name}
              </span>
              <Mono as="span" tone="muted">
                {g.lines.length}
              </Mono>
            </p>
            <ul className="m-0 flex list-none flex-col p-0">
              {g.lines.map((l) => (
                <li key={l.key}>
                  <button
                    type="button"
                    data-b="item"
                    aria-expanded={open === l.key}
                    onClick={() => onOpen(l.key)}
                    className={ROW}
                  >
                    {/* two lines until it's pressed: a claim can be a paragraph */}
                    <span
                      className={`type-ui wrap-anywhere ${open === l.key ? '' : 'line-clamp-2'}`}
                    >
                      {l.says}
                    </span>
                    <Mono as="span" tone="muted">
                      {[l.tag, l.kind, l.who].filter(Boolean).join(' · ')}
                    </Mono>
                  </button>
                  {open === l.key && (
                    <div className="flex flex-col gap-space-4 px-space-8 pb-space-8">
                      <Mono as="span" tone="muted">
                        {words.made(l.tool, l.when)}
                      </Mono>
                      <Mono as="span" tone="muted">
                        {words.rests}
                      </Mono>
                      {l.basis && (
                        <p className="my-0 type-ui wrap-anywhere">
                          <span className="text-muted">{words.basis} </span>
                          {l.basis}
                        </p>
                      )}
                      {l.limits && (
                        <p className="my-0 type-ui wrap-anywhere">
                          <span className="text-muted">{words.limits} </span>
                          {l.limits}
                        </p>
                      )}
                      {l.more.map(([k, v]) => (
                        <p key={k} className="my-0 type-ui wrap-anywhere">
                          <span className="text-muted">{k} </span>
                          {v}
                        </p>
                      ))}
                      {l.method && (
                        <Mono as="span" tone="muted">
                          {`${words.method}  ${l.method}`}
                        </Mono>
                      )}
                      <ul className="m-0 flex list-none flex-col gap-space-4 p-0">
                        {l.evidence.map((e, i) => (
                          // a claim's evidence is a list in its order, and two pieces can say the same
                          // biome-ignore lint/suspicious/noArrayIndexKey: the pieces have no ids of their own
                          <li key={i} className="flex flex-col">
                            <span className="type-ui wrap-anywhere">
                              {e.link ? (
                                <TextLink href={e.link} rel="noreferrer" target="_blank">
                                  {e.says ?? e.what}
                                </TextLink>
                              ) : (
                                (e.says ?? e.what)
                              )}
                            </span>
                            <Mono as="span" tone="muted">
                              {[e.says ? e.what : null, e.found].filter(Boolean).join(' · ')}
                            </Mono>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Overlay>
  );
}
