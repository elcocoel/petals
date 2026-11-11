// The outline bench's key (annotation-layer.md, step 7; Elco's (b), 11 Nov): which piece of data the
// outline shows, chosen as Settings would, and each value with the line the look gave it, in the order the
// lines were given. No value has a line of its own (Elco, 11 Nov); a value past the outline's three has none.
// Props only.
import type { OutlineKey as Key } from '@petal/core/wedge/outline';
import { BarBox } from '../../components/ui/BarBox.tsx';
import { Mono } from '../../components/ui/Mono.tsx';
import { NavItem } from '../../components/ui/NavItem.tsx';
import { panelWords } from '../../lib/panel-words.ts';

const words = panelWords.settings;

/** A short run of a value's line, as the flower draws it round a petal. */
function Line({ dash }: { dash: string }) {
  return (
    <svg aria-hidden="true" className="h-space-8 w-space-32 shrink-0" viewBox="0 0 32 8">
      <line
        x1="0"
        y1="4"
        x2="32"
        y2="4"
        stroke="var(--text-primary)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        {...(dash ? { strokeDasharray: dash } : {})}
      />
    </svg>
  );
}

export function OutlineKey({
  shows,
  choices,
  keys,
  unlined,
  hrefFor,
}: {
  /** the piece of data the outline shows, or null for none */
  shows: string | null;
  /** the data it can show on this flower */
  choices: readonly string[];
  keys: readonly Key[];
  unlined: readonly string[];
  /** the bench's address with the outline on this piece of data, or none */
  hrefFor: (data: string | null) => string;
}) {
  return (
    <BarBox
      kind="float"
      className="fixed top-space-16 left-space-16 w-sidebar-width bg-surface"
      bar={<Mono>{words.dimensions.outline}</Mono>}
    >
      <ul className="m-0 flex list-none flex-col p-0">
        {choices.map((data) => (
          <li key={data}>
            <NavItem href={hrefFor(data)} current={shows === data} label={words.piece(data)} />
          </li>
        ))}
        <li>
          <NavItem href={hrefFor(null)} current={shows === null} label={words.none} />
        </li>
      </ul>
      {(keys.length > 0 || unlined.length > 0) && (
        <ul className="m-0 flex list-none flex-col border-t border-primary p-0">
          {keys.map((k) => (
            <li
              key={k.value}
              className="flex h-row-height items-center gap-space-8 px-space-8 type-ui"
            >
              <Line dash={k.dash} />
              <span className="min-w-0 flex-1 truncate text-primary">{k.value}</span>
            </li>
          ))}
          {unlined.map((value) => (
            <li key={value}>
              <NavItem label={value} trail="no line" muted />
            </li>
          ))}
        </ul>
      )}
    </BarBox>
  );
}
