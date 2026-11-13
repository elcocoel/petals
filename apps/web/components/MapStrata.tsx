// A map's layers as strata in its Information box (lib/map-strata.ts), showing that a map is made by many
// people: the newest on top, each a row with its stratum, a band in its first author's colour, then its switch,
// what it holds, who published it and when, and, quiet in mono, its kind, what it covers and when it was read. A
// switch takes the layer off the map you see, or puts it back. One just published in your name is lit. Above
// them, the version you're seeing: the rule that composed it and the publications it was composed from; under each
// layer, the layers it was built on, a layer of this map linked to its row. Props only.
import { Fragment } from 'react';
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
}) {
  const newestFirst = [...layers].reverse();
  return (
    <div className="flex flex-col gap-space-8 wrap-anywhere">
      {version && version.from.length > 0 && (
        <Mono as="p" tone="muted">
          {`${words.version(version.rule, version.from.length)}: ${version.from.map(shortHash).join(', ')}`}
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
    </div>
  );
}
