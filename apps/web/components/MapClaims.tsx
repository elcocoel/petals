// What Petals' own mapping says about the map you're in (lib/map-claims.ts): how authored claims show on the
// map. Insights, as a tool panel with a utilitarian look taken from the side panel. Folded to its bar with how
// many until asked. Open, each account under one of the side panel's heads, its petal's name and how many; each
// claim its words, two lines until it's pressed, then how it's known as a badge and who said it, quiet.
// Pressed, its fields, each named: by which tool and when it was said, what it rests on and doesn't claim, an
// inference's method, each piece of evidence with who found it and when. Long addresses read at their ends,
// whole on hover. Never "verified". Props only.
import { type MapClaimGroup, mapClaimWords as words, wordsOf } from '../lib/map-claims.ts';
import { Badge } from './ui/Badge.tsx';
import { LineRow } from './ui/LineRow.tsx';
import { Mono } from './ui/Mono.tsx';
import { Overlay } from './ui/Overlay.tsx';
import { SectionHead } from './ui/SectionHead.tsx';
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

/** One named field of an opened claim: its name small and quiet, then what it holds. */
function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-space-4">
      <Mono as="span" tone="muted">
        {name}
      </Mono>
      <div className="type-ui text-primary wrap-anywhere">{children}</div>
    </div>
  );
}

export function MapClaims({
  groups,
  open,
  onOpen,
  empty,
  fold,
  bare = false,
}: {
  groups: readonly MapClaimGroup[];
  /** The claim whose fields are open, by its key. */
  open: string | null;
  onOpen: (key: string) => void;
  /** What it says when there's nothing to list (a chosen wallet nothing is said about). */
  empty?: string | undefined;
  fold: { open: boolean; onToggle: () => void };
  /** Its rows alone, for a box that frames it (the map's floating boxes). */
  bare?: boolean;
}) {
  const count = groups.reduce((n, g) => n + g.lines.length, 0);
  const body = (
    <>
      {/* edge to edge, so the heads reach the panel's sides as the side panel's do */}
      <div className="-mx-space-8 flex max-h-figure-height flex-col overflow-y-auto overscroll-none px-space-8">
        {groups.length === 0 && empty && (
          <p className="my-0 px-space-8 py-space-8 type-ui text-muted">{empty}</p>
        )}
        {groups.map((g) => (
          <section key={g.account} aria-label={g.name} className="flex flex-col">
            <SectionHead size="panel" title={`${g.name} · ${g.lines.length}`} />
            <ul className="m-0 flex list-none flex-col divide-y divide-hairline p-0">
              {g.lines.map((l) => (
                <li key={l.key}>
                  <LineRow expanded={open === l.key} onClick={() => onOpen(l.key)}>
                    {/* two lines until it's pressed: a claim can be a paragraph */}
                    <span
                      className={`type-ui text-primary wrap-anywhere ${open === l.key ? '' : 'line-clamp-2'}`}
                    >
                      <Said text={l.says} />
                    </span>
                    <span className="flex flex-wrap items-center gap-space-8">
                      <Badge>{l.kind}</Badge>
                      {l.tag && (
                        <Mono as="span" tone="muted">
                          {l.tag}
                        </Mono>
                      )}
                      <Mono as="span" tone="muted">
                        {l.who}
                      </Mono>
                    </span>
                  </LineRow>
                  {open === l.key && (
                    <div className="flex flex-col gap-space-8 px-space-8 pt-space-4 pb-space-16">
                      <Field name={words.fields.by}>
                        {l.tool ? `${l.who} (${l.tool})` : l.who}
                      </Field>
                      <Field name={words.fields.said}>{l.when}</Field>
                      {l.basis && (
                        <Field name={words.fields.basis}>
                          <Said text={l.basis} />
                        </Field>
                      )}
                      {l.limits && (
                        <Field name={words.fields.limits}>
                          <Said text={l.limits} />
                        </Field>
                      )}
                      {l.more.map(([k, v]) => (
                        <Field key={k} name={k}>
                          <Said text={v} />
                        </Field>
                      ))}
                      {l.method && <Field name={words.fields.method}>{l.method}</Field>}
                      {l.evidence.length > 0 && (
                        <Field name={words.fields.evidence}>
                          <ul className="m-0 flex list-none flex-col gap-space-8 p-0">
                            {l.evidence.map((e, i) => (
                              // a claim's evidence is a list in its order, and two pieces can say the same
                              // biome-ignore lint/suspicious/noArrayIndexKey: the pieces have no ids of their own
                              <li key={i} className="flex flex-col">
                                <span>
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
                        </Field>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
  // in a box floating over the map (LandscapeCanvas) the box is its frame; elsewhere, one of the overlays
  if (bare) return <div className="flex flex-col px-space-8 pb-space-8">{body}</div>;
  return (
    <Overlay title={fold.open ? words.title : words.folded(count)} fold={fold} tool>
      {body}
    </Overlay>
  );
}
