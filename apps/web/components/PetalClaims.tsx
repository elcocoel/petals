'use client';
// What's said about the selected petal's account, and a way to add a note or a name to it
// (annotation-layer.md, steps 3 and 7): each claim with what it says, how it's known (stated, sourced,
// inferred: never "verified"), where it rests and who said it. Signed in only: a visitor sees nothing here.
// It sits under the petal's details in the flower's box, so /make, /f, /draft and the map all have it.
import { claimWords } from '../lib/claim-lines.ts';
import { usePetalClaims } from '../viewmodels/usePetalClaims.ts';
import { Button } from './ui/Button.tsx';
import { Field } from './ui/Field.tsx';
import { Mono } from './ui/Mono.tsx';
import { TextLink } from './ui/TextLink.tsx';

export function PetalClaims({
  account,
  conversation,
}: {
  /** The petal's account, as claims name it. */
  account: string | null;
  /** The conversation it's said in, kept in its project; none on a flower's own page. */
  conversation?: string | null;
}) {
  const c = usePetalClaims(account, conversation ?? null);
  if (!account || !c.signedIn) return null;
  return (
    <section className="flex w-full flex-col gap-text-gap">
      <h4 className="m-0 type-ui text-muted">{claimWords.heading}</h4>
      {c.lines.length === 0 ? (
        <p className="my-0 type-ui text-muted">{claimWords.none}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-text-gap p-0">
          {c.lines.map((l) => (
            <li key={l.key} className="flex flex-col gap-space-4">
              <p className="my-0 type-ui wrap-anywhere">
                {l.link ? (
                  <TextLink href={l.link} rel="noreferrer" target="_blank">
                    {l.link}
                  </TextLink>
                ) : (
                  l.says
                )}
              </p>
              <Mono as="span" tone="muted">
                {[l.kind, l.rests, claimWords.by(l.who)].filter(Boolean).join('  ·  ')}
                {l.source && (
                  <>
                    {'  ·  '}
                    <TextLink variant="mono" href={l.source} rel="noreferrer" target="_blank">
                      {claimWords.source}
                    </TextLink>
                  </>
                )}
              </Mono>
              {l.quote && <p className="my-0 type-ui text-muted wrap-anywhere">“{l.quote}”</p>}
            </li>
          ))}
        </ul>
      )}
      <Field
        id="petal-note"
        label={claimWords.add}
        value={c.words}
        onChange={c.setWords}
        lines="several"
        maxLength={4000}
        scale="app"
      />
      <div className="flex flex-wrap items-center gap-space-8">
        <Button
          variant="compact"
          disabled={c.saving || !c.words.trim()}
          onClick={() => c.save('note')}
        >
          {c.saving ? claimWords.saving : claimWords.saveNote}
        </Button>
        <Button
          variant="quiet"
          disabled={c.saving || !c.words.trim()}
          onClick={() => c.save('name')}
        >
          {claimWords.saveName}
        </Button>
      </div>
      {c.failed && <p className="error my-0">{c.failed}</p>}
    </section>
  );
}
