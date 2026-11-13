// What a layer, or one reading or name in it, adds to the map in front (lib/mapping.ts, wave 8): each line its
// kind as a badge (New data, New period, New wallets, Match) and its words. Props only.
import type { ToMapLine } from '../lib/mapping.ts';
import { Badge } from './ui/Badge.tsx';

export function ToMapLines({ lines }: { lines: readonly ToMapLine[] }) {
  if (!lines.length) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-space-4 p-0 pt-space-4">
      {lines.map((l) => (
        <li key={l.key} className="flex items-baseline gap-space-8">
          <Badge>{l.tag}</Badge>
          <span className="type-caption">{l.words}</span>
        </li>
      ))}
    </ul>
  );
}
