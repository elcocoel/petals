// Mapped work as a list. One row per map, as the side panel's rows are: its picture small, its name in UI
// words with a quiet mono line under it, its chain at the end. The whole row opens the map, with the item's
// soft fill under the pointer. No boxes: no border around a row, a picture or the list. It takes the rows
// FlowerTile takes, so a place swaps one for the other.
import Link from 'next/link';
import { Mono } from './ui/Mono.tsx';

export interface MapRow {
  key: string;
  title: string;
  /** Its address shortened, how many readings, its newest date: lib/maps.ts's mapTile. */
  where: string;
  /** Its chain. */
  badge: string;
  image: string;
  href: string;
}

export function MapList({ rows, label }: { rows: readonly MapRow[]; label: string }) {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col p-0">
      {rows.map((r) => (
        <li key={r.key}>
          <Link
            href={r.href}
            // a list of every map mustn't ask the server ahead for each of them
            prefetch={false}
            title={r.title}
            data-b="item"
            className="flex w-full min-w-0 items-center gap-text-gap px-space-8 py-space-4 text-left text-primary no-underline hover:bg-tint hover:opacity-100"
          >
            {/* biome-ignore lint/performance/noImgElement: an SVG from our own API */}
            <img
              src={r.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="block size-drawing-48 shrink-0"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate type-ui">{r.title}</span>
              <Mono as="span" tone="muted">
                {r.where}
              </Mono>
            </span>
            <span className="shrink-0">
              <Mono as="span" tone="muted">
                {r.badge}
              </Mono>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
