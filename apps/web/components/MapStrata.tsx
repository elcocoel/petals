// A map's layers as strata in its Information box (lib/map-strata.ts; Elco, wave 8: "seeing that a map is made by
// many people"): the newest on top, each a row with its stratum, a band in its first author's colour, then its switch, what
// it holds and, quiet in mono, how it stands, what it covers, who kept it and when. Under them, the map up to any
// layer: a slider from the first layer to all, and Watch it grow, which steps through them. A layer above the slider's
// step is faded; one just published in your name is lit. Props only.
import {
  authorsLine,
  type StrataLayer,
  standingSwatch,
  strataLine,
  strataWords as words,
} from '../lib/map-strata.ts';
import { Button } from './ui/Button.tsx';
import { Mono } from './ui/Mono.tsx';
import { Range } from './ui/Range.tsx';
import { Switch } from './ui/Switch.tsx';

export function MapStrata({
  layers,
  on,
  onToggle,
  upTo,
  onUpTo,
  replaying,
  onReplay,
  joined,
  swatches,
}: {
  /** oldest first, as they were added */
  layers: readonly StrataLayer[];
  /** the layers switched on, by id */
  on: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** how many of them, from the oldest, the map shows now */
  upTo: number;
  onUpTo: (k: number) => void;
  replaying: boolean;
  onReplay: () => void;
  /** the layers a publication just brought, in the person's name, lit for the moment */
  joined?: ReadonlySet<string> | undefined;
  /** each first author's colour (lib/map-strata.ts authorSwatches); by standing where none is given */
  swatches?: ReadonlyMap<string, string> | undefined;
}) {
  const n = layers.length;
  const newestFirst = layers.map((l, i) => ({ l, at: i + 1 })).reverse();
  return (
    <div className="flex flex-col gap-space-8">
      <ol className="m-0 flex list-none flex-col p-0">
        {newestFirst.map(({ l, at }) => (
          <li
            key={l.id}
            className={`flex items-stretch gap-space-8 py-space-4 ${at > upTo ? 'opacity-40' : ''} ${joined?.has(l.id) ? 'bg-tint' : ''}`}
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
              {/* who: the heart of it (Elco: 'ownership over valuable mapping'), in the words' colour */}
              <span className="type-ui text-primary wrap-anywhere">{authorsLine(l.authors)}</span>
              <Mono as="span" tone="muted">
                {strataLine(l)}
              </Mono>
              {joined?.has(l.id) && (
                <Mono as="span" tone="accent">
                  {words.joined}
                </Mono>
              )}
            </span>
          </li>
        ))}
      </ol>
      {n > 1 && (
        <div className="flex flex-col gap-space-4">
          <Range
            label={words.upTo(upTo, n)}
            min={1}
            max={n}
            step={1}
            value={upTo}
            shown={`${upTo} / ${n}`}
            onChange={(v) => onUpTo(Math.round(v))}
            onSet={() => undefined}
          />
          <span className="flex items-center justify-between gap-space-8">
            <span className="type-ui text-muted">{words.upTo(upTo, n)}</span>
            <Button variant="quiet" onClick={onReplay}>
              {replaying ? words.stop : words.replay}
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}
