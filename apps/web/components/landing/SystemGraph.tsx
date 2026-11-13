'use client';
// The system graph on the landing's Build it with us: how Petals fits together, stood upright in the ink band's
// boxes, from the system map (Figma "Systems map", 119:2271). You at the top, Petals in the middle, NEAR and
// other chains at the foot; along each line what travels there moves, and a part says what it is while it's
// pointed at. The parts sit in one grid of four columns, so the lines run straight; the lines, the regions and
// what travels are drawn behind them, measured from where the parts landed. With reduced motion nothing
// travels. The words are lib/system-graph.ts's. It takes the band's whole column, so the labels stay legible.
import { useLayoutEffect, useRef, useState } from 'react';
import {
  BANDS,
  type Box,
  type GraphBand,
  type GraphPart,
  LINES,
  PARTS,
  type PartId,
  route,
  SERVER,
} from '../../lib/system-graph.ts';

/** Where each part sits in the grid of four columns. */
const PLACE: Record<PartId, string> = {
  browser: 'col-start-1',
  wallet: 'col-start-2',
  cloud: 'col-start-3',
  agents: 'col-start-4',
  site: 'col-start-1 col-span-2',
  brain: 'col-start-1',
  agent: 'col-start-2',
  tools: 'col-start-3',
  jobs: 'col-start-4',
  flowers: 'col-start-1',
  payments: 'col-start-4',
  social: 'col-start-1',
  nearai: 'col-start-2',
  chains: 'col-start-3',
  intents: 'col-start-4',
};

/** The rows, top to bottom: a band's name, or its parts. */
const ROWS: ({ band: GraphBand } | { region: 'server' } | { parts: PartId[] })[] = [
  { band: 'you' },
  { parts: ['browser', 'wallet', 'cloud', 'agents'] },
  { band: 'petals' },
  { parts: ['site'] },
  { region: 'server' },
  { parts: ['brain', 'agent', 'tools', 'jobs'] },
  { parts: ['flowers', 'payments'] },
  { band: 'outside' },
  { parts: ['social', 'nearai', 'chains', 'intents'] },
];

/** How far the Petals region and the server reach past their parts, and where the rail runs. */
const PAD = { petals: 16, server: 8, rail: 32 };
/** What travels moves at one speed, in pixels a second. */
const SPEED = 64;

interface Laid {
  w: number;
  h: number;
  boxes: Partial<Record<PartId | 'server' | 'petals', Box>>;
}

const grow = (b: Box, by: number): Box => ({
  x: b.x - by,
  y: b.y - by,
  w: b.w + 2 * by,
  h: b.h + 2 * by,
});

const around = (boxes: Box[]): Box | undefined => {
  if (boxes.length === 0) return undefined;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bottom - y };
};

export function SystemGraph() {
  const frame = useRef<HTMLDivElement>(null);
  const [laid, setLaid] = useState<Laid | null>(null);
  const [still, setStill] = useState(true);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    setStill(reduce.matches);
    const measure = () => {
      const at = el.getBoundingClientRect();
      const box = (n: Element): Box => {
        const r = n.getBoundingClientRect();
        return { x: r.left - at.left, y: r.top - at.top, w: r.width, h: r.height };
      };
      const boxes: Laid['boxes'] = {};
      for (const n of el.querySelectorAll('[data-part]')) {
        boxes[n.getAttribute('data-part') as PartId] = box(n);
      }
      const of = (attr: string) => [...el.querySelectorAll(`[${attr}]`)].map(box);
      const server = around(of('data-server'));
      const petals = around(of('data-petals'));
      if (server) boxes.server = grow(server, PAD.server);
      if (petals) boxes.petals = grow(petals, PAD.petals);
      setLaid({ w: at.width, h: at.height, boxes });
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  const railX = (laid?.boxes.petals?.x ?? PAD.rail) - (PAD.rail - PAD.petals);

  return (
    // room on the left for the rail and its name, so nothing passes the column's edge
    <div ref={frame} className="relative w-full px-space-32 md:px-column-gap">
      {laid && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-visible"
          width={laid.w}
          height={laid.h}
          viewBox={`0 0 ${laid.w} ${laid.h}`}
        >
          {(['petals', 'server'] as const).map((r) => {
            const b = laid.boxes[r];
            return b ? (
              <rect
                key={r}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                fill={r === 'petals' ? 'var(--figure-accent)' : 'none'}
                fillOpacity={0.06}
                stroke="var(--hairline)"
                strokeWidth={1}
              />
            ) : null;
          })}
          {LINES.map((line, i) => {
            const a = laid.boxes[line.from];
            const b = laid.boxes[line.to];
            if (!a || !b) return null;
            const drawn = route(line, a, b, railX);
            const dur = `${Math.max(1.2, drawn.length / SPEED)}s`;
            const ways =
              line.travel === 'both' ? (['forward', 'back'] as const) : ([line.travel] as const);
            return (
              <g key={`${line.from}-${line.to}`}>
                <path d={drawn.d} fill="none" stroke="var(--hairline)" strokeWidth={1} />
                {!still &&
                  ways.map((way, k) => (
                    <circle key={way} r={2.5} fill="var(--figure-accent)">
                      <animateMotion
                        dur={dur}
                        begin={`${(i * 0.37 + k * 0.9).toFixed(2)}s`}
                        repeatCount="indefinite"
                        path={drawn.d}
                        keyPoints={way === 'back' ? '1;0' : '0;1'}
                        keyTimes="0;1"
                        calcMode="linear"
                      />
                    </circle>
                  ))}
                {line.label && (
                  <text
                    x={drawn.at.x}
                    y={drawn.at.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    // the rail's name runs along it, so it stays inside the column
                    transform={
                      line.route === 'rail' ? `rotate(-90 ${drawn.at.x} ${drawn.at.y})` : undefined
                    }
                    // on a phone the lines run too close for their names
                    className="hidden type-mono md:inline"
                    fill="var(--text-muted)"
                    stroke="var(--surface)"
                    strokeWidth={6}
                    paintOrder="stroke"
                  >
                    {line.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="relative grid grid-cols-4 gap-x-space-8 gap-y-space-32 md:gap-x-column-gap">
        {ROWS.map((row) => {
          if ('band' in row) {
            return (
              <p
                key={row.band}
                data-petals={row.band === 'petals' ? '' : undefined}
                className="col-span-4 my-0 type-mono text-muted"
              >
                {BANDS[row.band]}
              </p>
            );
          }
          if ('region' in row) {
            return (
              <p
                key="server"
                data-server=""
                data-petals=""
                className="col-span-4 my-0 type-mono text-muted"
              >
                {SERVER}
              </p>
            );
          }
          return row.parts.map((id) => <Part key={id} part={PARTS[id]} />);
        })}
      </div>
    </div>
  );
}

const IN_SERVER: ReadonlySet<PartId> = new Set([
  'brain',
  'agent',
  'tools',
  'jobs',
  'flowers',
  'payments',
]);

/** One part: a black box with its name; its words over or under it while it's pointed at. */
function Part({ part }: { part: GraphPart }) {
  const id = part.id as PartId;
  const last = PLACE[id].startsWith('col-start-4');
  const tip = part.band === 'outside' ? 'bottom-full mb-space-8' : 'top-full mt-space-8';
  return (
    <div
      data-part={id}
      data-server={IN_SERVER.has(id) ? '' : undefined}
      data-petals={part.band === 'petals' ? '' : undefined}
      className={`group relative ${PLACE[id]}`}
    >
      <div
        data-b="box"
        className={`flex h-full flex-col justify-end gap-space-4 border border-hairline bg-surface p-space-8 md:p-space-16 ${part.band === 'outside' ? 'border-dashed' : ''}`}
      >
        {part.note && <span className="hidden type-mono text-muted md:block">{part.note}</span>}
        <span className="type-caption md:type-label">{part.name}</span>
        <span className="sr-only">{part.words}</span>
      </div>
      <span
        aria-hidden="true"
        className={`pointer-events-none invisible absolute z-20 w-sidebar-width bg-action px-space-8 py-space-4 type-caption text-on-action group-hover:visible ${tip} ${last ? 'right-0' : 'left-0'}`}
      >
        {part.words}
      </span>
    </div>
  );
}
