// Search on the Power Map (#105; lib/map-search.ts): a field at the top of the chain list, and while something's
// typed, the maps it finds in the chains' place, each a row (LineRow) with its name, what matched under it and
// its chain, quiet in mono. Pressing one goes into its flower. Enter asks for the best order; Escape clears it.
// Props only.
import { type SearchRow, mapSearchWords as words } from '../lib/map-search.ts';
import { Field } from './ui/Field.tsx';
import { LineRow } from './ui/LineRow.tsx';
import { Mono } from './ui/Mono.tsx';

export function MapSearch({
  q,
  onType,
  onOrder,
  onClear,
  rows,
  status,
  onGo,
}: {
  q: string;
  onType: (q: string) => void;
  /** Enter: the best order. */
  onOrder: () => void;
  onClear: () => void;
  /** The maps found, or null while nothing's back for these words. */
  rows: readonly SearchRow[] | null;
  /** One quiet line over the rows: on its way, nothing found, words alone; or none. */
  status: string | null;
  onGo: (row: SearchRow) => void;
}) {
  return (
    <div className="flex flex-col gap-space-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onOrder();
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape' || !q) return;
          // the map's own Escape leaves a flower; here it only clears the words
          e.stopPropagation();
          onClear();
        }}
      >
        <Field
          id="map-search"
          label={words.label}
          hideLabel
          placeholder={words.placeholder}
          value={q}
          onChange={onType}
          maxLength={200}
          scale="app"
        />
      </form>
      {status && (
        <Mono as="span" tone="muted">
          {status}
        </Mono>
      )}
      {rows && rows.length > 0 && (
        <ul className="m-0 flex max-h-figure-height list-none flex-col overflow-y-auto overscroll-none p-0">
          {rows.map((r) => (
            <li key={r.map}>
              <LineRow expanded={false} onClick={() => onGo(r)}>
                <span className="w-full truncate type-ui">{r.name}</span>
                {r.matched && (
                  <span className="line-clamp-2 type-ui text-muted wrap-anywhere">{r.matched}</span>
                )}
                <Mono as="span" tone="muted">
                  {r.chain}
                </Mono>
              </LineRow>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
