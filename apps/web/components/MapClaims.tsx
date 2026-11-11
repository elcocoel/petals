// What Petals' own mapping says about the map you're in (lib/map-claims.ts; Elco, 11 Nov: "we need to design
// how authored claims show on the map"): one of the overlays, quiet until asked, folded to its bar with how
// many there are. Open, each account under its petal's name (pressed, that petal lights on the flower), long
// addresses in the words at their ends and whole on hover, each claim as the flower's box says one: its
// words, then how it's known and who said it, quiet in mono. Pressing a claim says which tool made it and when,
// and what it rests on: what a note rests on and doesn't claim, an inference's method, each piece of evidence
// with who found it and when. Never "verified". Props only.
import { type MapClaimGroup, mapClaimWords as words, wordsOf } from '../lib/map-claims.ts';
import { LineRow } from './ui/LineRow.tsx';
import { Mono } from './ui/Mono.tsx';
import { NavItem } from './ui/NavItem.tsx';
import { Overlay } from './ui/Overlay.tsx';
import { TextLink } from './ui/TextLink.tsx';

/** A claim's words, each long address or hash at its ends and whole on hover. */
function Said({ text }: { text: string }) {
  return (
    <>
      {wordsOf(text).map((w, i) =>
        w.whole ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: runs of one text, in their order
          <span key={i} title={w.whole}>
            {w.text}
          </span>
        ) : (
          w.text
        ),
      )}
    </>
  );
}

export function MapClaims({
  groups,
  open,
  onOpen,
  lit = null,
  onAccount,
  fold,
}: {
  groups: readonly MapClaimGroup[];
  /** The claim whose evidence is open, by its key. */
  open: string | null;
  onOpen: (key: string) => void;
  /** The account lit on the flower, and the hand that lights one: pressing a petal's name lights it there. */
  lit?: string | null;
  onAccount?: ((account: string) => void) | undefined;
  fold: { open: boolean; onToggle: () => void };
}) {
  const count = groups.reduce((n, g) => n + g.lines.length, 0);
  return (
    <Overlay title={fold.open ? words.title : words.folded(count)} fold={fold}>
      <div className="flex max-h-figure-height flex-col gap-space-8 overflow-y-auto overscroll-none">
        {groups.map((g) => (
          <section key={g.account} aria-label={g.name} className="flex flex-col">
            {g.petal && onAccount ? (
              <NavItem
                onClick={() => onAccount(g.account)}
                chosen={lit === g.account}
                label={g.name}
                trail={String(g.lines.length)}
                muted
              />
            ) : (
              <p className="my-0 flex min-w-0 items-baseline justify-between gap-space-8 px-space-8 py-space-4">
                <span className="min-w-0 truncate type-ui text-muted" title={g.account}>
                  {g.name}
                </span>
                <Mono as="span" tone="muted">
                  {g.lines.length}
                </Mono>
              </p>
            )}
            <ul className="m-0 flex list-none flex-col p-0">
              {g.lines.map((l) => (
                <li key={l.key}>
                  <LineRow expanded={open === l.key} onClick={() => onOpen(l.key)}>
                    {/* two lines until it's pressed: a claim can be a paragraph */}
                    <span
                      className={`type-ui wrap-anywhere ${open === l.key ? '' : 'line-clamp-2'}`}
                    >
                      <Said text={l.says} />
                    </span>
                    <Mono as="span" tone="muted">
                      {[l.tag, l.kind, l.who].filter(Boolean).join(' · ')}
                    </Mono>
                  </LineRow>
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
                          <Said text={l.basis} />
                        </p>
                      )}
                      {l.limits && (
                        <p className="my-0 type-ui wrap-anywhere">
                          <span className="text-muted">{words.limits} </span>
                          <Said text={l.limits} />
                        </p>
                      )}
                      {l.more.map(([k, v]) => (
                        <p key={k} className="my-0 type-ui wrap-anywhere">
                          <span className="text-muted">{k} </span>
                          <Said text={v} />
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
                                <Said text={e.says ?? e.what} />
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
