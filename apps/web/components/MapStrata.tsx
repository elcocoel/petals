// A map's layers as strata in its Information box (lib/map-strata.ts), showing that a map is made by many
// people: the newest on top, each a row with its stratum, a band in its first author's colour, then its switch,
// what it holds, who published it and when, and, quiet in mono, its kind, what it covers and when it was read. A
// switch takes the layer off the map you see, or puts it back. One just published in your name is lit. Above
// them, the version you're seeing: the rule that composed it and the publications it was composed from; under each
// layer, the layers it was built on, a layer of this map linked to its row. Under them, the map's versions, newest
// first (lib/map-history.ts): who published each and when, what it added and dropped, the version it came after,
// and its proof, so anyone can check it. Props only.
import { Fragment } from 'react';
import {
  type HistoryLayer,
  type HistoryRow,
  layerWords,
  historyWords as said,
} from '../lib/map-history.ts';
import {
  authorsLine,
  type StrataLayer,
  shortHash,
  standingSwatch,
  strataLine,
  strataWords as words,
} from '../lib/map-strata.ts';
import { Mono } from './ui/Mono.tsx';
import { Switch } from './ui/Switch.tsx';
import { TextLink } from './ui/TextLink.tsx';

export function MapStrata({
  layers,
  on,
  onToggle,
  joined,
  swatches,
  version,
  history,
}: {
  /** oldest first, as they were added */
  layers: readonly StrataLayer[];
  /** the layers switched on, by id */
  on: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** the layers a publication just brought, in the person's name, lit for the moment */
  joined?: ReadonlySet<string> | undefined;
  /** each first author's colour (lib/map-strata.ts authorSwatches); by standing where none is given */
  swatches?: ReadonlyMap<string, string> | undefined;
  /** the version you're seeing: the rule that composed it and the publications it was composed from, by hash */
  version?: { rule: string; from: readonly string[] } | undefined;
  /** the map's versions, newest first, as its record keeps them */
  history?: readonly HistoryRow[] | undefined;
}) {
  const newestFirst = [...layers].reverse();
  const versions = new Set(history?.map((h) => h.hash));
  // a layer of this map, linked to its row; any other by its hash
  const layerLink = (l: HistoryLayer) =>
    l.title ? (
      <TextLink href={`#layer-${l.id}`} variant="mono">
        {l.title}
      </TextLink>
    ) : (
      layerWords(l)
    );
  const listed = (ls: readonly HistoryLayer[]) =>
    ls.map((l, i) => (
      <Fragment key={l.id}>
        {i > 0 && ', '}
        {layerLink(l)}
      </Fragment>
    ));
  return (
    <div className="flex flex-col gap-space-8 wrap-anywhere">
      {version && version.from.length > 0 && (
        <Mono as="p" tone="muted">
          {`${words.version(version.rule, version.from.length)}: `}
          {version.from.map((h, i) => (
            <Fragment key={h}>
              {i > 0 && ', '}
              {versions.has(h) ? (
                <TextLink href={`#version-${h}`} variant="mono">
                  {shortHash(h)}
                </TextLink>
              ) : (
                shortHash(h)
              )}
            </Fragment>
          ))}
        </Mono>
      )}
      <ol className="m-0 flex list-none flex-col p-0">
        {newestFirst.map((l) => (
          <li
            key={l.id}
            id={`layer-${l.id}`}
            className={`flex items-stretch gap-space-8 py-space-4 ${joined?.has(l.id) ? 'bg-tint' : ''}`}
          >
            {/* its stratum: its first author's colour (or its standing's), the full height of the row */}
            <span
              aria-hidden="true"
              className="w-space-4 shrink-0"
              data-swatch={swatches?.get(l.firstBy ?? '') ?? standingSwatch(l.standing)}
            />
            <span className="flex shrink-0 items-start pt-space-4">
              <Switch label={words.on(l.title)} on={on.has(l.id)} onChange={() => onToggle(l.id)} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="type-ui text-primary wrap-anywhere">{l.title}</span>
              {/* who: the heart of it, who mapped it, in the words' colour */}
              <span className="type-ui text-primary wrap-anywhere">{authorsLine(l.authors)}</span>
              <Mono as="span" tone="muted">
                {strataLine(l)}
              </Mono>
              {l.from.length > 0 && (
                <Mono as="span" tone="muted">
                  {`${words.builtOn} `}
                  {l.from.map((f, i) => (
                    <Fragment key={f.id}>
                      {i > 0 && ', '}
                      {f.title ? (
                        <TextLink href={`#layer-${f.id}`} variant="mono">
                          {f.title}
                        </TextLink>
                      ) : (
                        shortHash(f.id)
                      )}
                    </Fragment>
                  ))}
                </Mono>
              )}
              {joined?.has(l.id) && (
                <Mono as="span" tone="accent">
                  {words.joined}
                </Mono>
              )}
            </span>
          </li>
        ))}
      </ol>
      {history && history.length > 0 && (
        <div className="flex flex-col gap-space-4">
          <Mono as="p" tone="muted">
            {said.title}
          </Mono>
          <ol className="m-0 flex list-none flex-col p-0">
            {history.map((h) => (
              <li key={h.hash} id={`version-${h.hash}`} className="flex flex-col py-space-4">
                <span className="type-ui text-primary wrap-anywhere">
                  {[said.version(h.seq), said.by(h.by), h.signed ? null : said.imported, h.day]
                    .filter(Boolean)
                    .join(', ')}
                </span>
                <Mono as="span" tone="muted">
                  {h.added.length > 0 && (
                    <>
                      {`${said.added} `}
                      {listed(h.added)}
                    </>
                  )}
                  {h.added.length > 0 && h.dropped.length > 0 && ' · '}
                  {h.dropped.length > 0 && (
                    <>
                      {`${said.dropped} `}
                      {listed(h.dropped)}
                    </>
                  )}
                  {h.added.length === 0 && h.dropped.length === 0 && said.nothingNew}
                  {' · '}
                  {h.after ? (
                    <>
                      {`${said.after} `}
                      {h.after.seq !== null ? (
                        <TextLink href={`#version-${h.after.hash}`} variant="mono">
                          {said.version(h.after.seq)}
                        </TextLink>
                      ) : (
                        shortHash(h.after.hash)
                      )}
                    </>
                  ) : (
                    said.first
                  )}
                </Mono>
                {h.proof ? (
                  <details>
                    <summary className="type-caption text-muted">
                      {said.check(h.proof.standard)}
                    </summary>
                    <div className="flex flex-col gap-space-4 py-space-4">
                      {(
                        [
                          [said.signedText, h.proof.message],
                          [said.key, h.proof.public_key],
                          [said.signature, h.proof.signature],
                          [said.recipient, h.proof.recipient],
                          [said.nonce, h.proof.nonce],
                          [said.manifest, h.proof.manifest],
                        ] as const
                      )
                        .filter(([, v]) => Boolean(v))
                        .map(([label, v]) => (
                          <Mono key={label} as="p" tone="muted">
                            {`${label}: ${v}`}
                          </Mono>
                        ))}
                    </div>
                  </details>
                ) : (
                  <span className="type-caption text-muted">{said.unsigned}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
