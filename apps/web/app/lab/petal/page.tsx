// The petal look's bench (#76; design/flower-art-direction/default-system-vnext.md, V1, Elco 11 Nov): the art
// direction drawn by the live flower on real data, each flower at its normal size and at map distance. ?show=
// raidguild (the flower it was drawn on, with the accepted highlight), keys (that flower in each key and grey, the
// highlight checked on every colour), near (NEAR's recorded backer segments, highlighted), and the two choices
// #76 left open, as proposals: tail (how "everyone else" shows) and height (a reference across flowers). In production it
// stays hidden unless PETAL_LAB=1, like the lab, and nothing here reaches a product page until Elco has seen it.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FlowerCanvas } from '../../../flower/FlowerCanvas.tsx';
import { type LookFlower, petalBench } from '../../../lab/petal/bench.ts';
import { heightProposals, tailProposals } from '../../../lab/petal/proposals.ts';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Petal look · Lab · Petals',
  robots: { index: false },
  icons: { icon: 'data:,' },
};

type Query = Record<string, string | string[] | undefined>;

const SHOWS = [
  { id: 'raidguild', label: 'RaidGuild' },
  { id: 'keys', label: 'Six colours' },
  { id: 'near', label: 'NEAR segments' },
  { id: 'tail', label: 'Everyone else?' },
  { id: 'height', label: 'Height across flowers?' },
] as const;
type Show = (typeof SHOWS)[number]['id'];

/** One live flower in a box of its own, positioned by the caller: the flower fills it as it fills a window. */
function Live({ flower, className }: { flower: LookFlower; className: string }) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <FlowerCanvas fill="area" reading={flower.reading} look={flower.look} />
    </div>
  );
}

/**
 * A key's colour. It's data from core's look (wedge/keys.ts), handed over as the flower's fills are, so it can't
 * be a token: the swatch shows exactly what the petals are painted with.
 */
function Swatch({ hex }: { hex: string }) {
  const paint = { background: hex }; // token-exempt: the look's key colour, data from core
  return <span className="inline-block size-swatch-size shrink-0" style={paint} />;
}

function Key({ flower }: { flower: LookFlower }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-space-4 p-0">
      {flower.key.map((k) => (
        <li key={k.label} className="flex items-center gap-space-8 type-caption">
          <Swatch hex={k.hex} />
          <span>{k.label}</span>
          <span className="whitespace-nowrap type-mono text-muted">{k.petals} petals</span>
        </li>
      ))}
    </ul>
  );
}

function Facts({ flower }: { flower: LookFlower }) {
  return (
    <div className="flex flex-col gap-space-4">
      {flower.facts.map((f) => (
        <p key={f} className="m-0 type-caption text-muted">
          {f}
        </p>
      ))}
      <p className="m-0 type-caption">{flower.highlight}</p>
    </div>
  );
}

/** The two map-distance sizes: where the petals hand over to the silhouette, and well past it. */
function Distances({ flower }: { flower: LookFlower }) {
  return (
    <div className="flex flex-col gap-space-8">
      <p className="m-0 type-label">At map distance</p>
      <div className="flex items-end gap-space-16">
        <Live flower={flower} className="relative h-drawing-240 w-drawing-144" />
        <Live flower={flower} className="relative h-drawing-144 w-drawing-72" />
      </div>
    </div>
  );
}

function Nav({ show }: { show: Show }) {
  return (
    <nav className="flex flex-wrap gap-x-space-16 gap-y-space-4 whitespace-nowrap type-caption">
      {SHOWS.map((s) =>
        s.id === show ? (
          <span key={s.id} className="font-semibold">
            {s.label}
          </span>
        ) : (
          <Link key={s.id} href={`/lab/petal?show=${s.id}`} className="text-muted">
            {s.label}
          </Link>
        ),
      )}
    </nav>
  );
}

/** One flower filling the room, with its facts, key and map distances beside it. */
function One({ show, flower }: { show: Show; flower: LookFlower }) {
  return (
    <main className="fixed inset-0 flex bg-surface text-primary">
      <Live flower={flower} className="relative min-w-0 flex-1" />
      <aside className="flex w-sidebar-width shrink-0 flex-col gap-space-16 overflow-y-auto border-hairline border-l p-space-16">
        <Nav show={show} />
        <h1 className="m-0 type-heading">{flower.reading.title}</h1>
        <Facts flower={flower} />
        <Key flower={flower} />
        <Distances flower={flower} />
      </aside>
    </main>
  );
}

/** The page's head: where you are, and a line about what's on it. */
function Head({ show, line }: { show: Show; line?: string | undefined }) {
  return (
    <header className="flex flex-wrap items-baseline gap-x-space-32 gap-y-space-8 border-hairline border-b p-space-16">
      <Nav show={show} />
      {line && <p className="m-0 type-caption">{line}</p>}
    </header>
  );
}

/** A choice, side by side with the others: its name and words over its flower. */
function Choice({ title, words, flower }: { title: string; words: string[]; flower: LookFlower }) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col border-hairline border-r border-b">
      <div className="flex flex-col gap-space-4 p-space-16">
        {title && <h2 className="m-0 type-label">{title}</h2>}
        {words.map((w) => (
          <p key={w} className="m-0 type-caption text-muted">
            {w}
          </p>
        ))}
      </div>
      <Live flower={flower} className="relative min-h-0 flex-1" />
    </section>
  );
}

async function Tail({ show }: { show: Show }) {
  const choices = await tailProposals();
  return (
    <main className="fixed inset-0 flex flex-col bg-surface text-primary">
      <Head show={show} line={choices[0]?.flower.highlight} />
      <div className="grid min-h-0 flex-1 grid-cols-3">
        {choices.map((c) => (
          <Choice key={c.title} title={c.title} words={c.words} flower={c.flower} />
        ))}
      </div>
    </main>
  );
}

async function Height({ show }: { show: Show }) {
  const scales = await heightProposals();
  return (
    <main className="fixed inset-0 flex flex-col bg-surface text-primary">
      <Head show={show} line="Three real flowers, no highlight, so only height is compared." />
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2">
        {scales.flatMap((scale) =>
          scale.flowers.map(({ flower }, i) => (
            <Choice
              key={`${scale.title} ${flower.reading.title}`}
              title={i === 0 ? scale.title : ''}
              words={[...(i === 0 ? scale.words : []), ...flower.facts]}
              flower={flower}
            />
          )),
        )}
      </div>
    </main>
  );
}

export default async function PetalLab({ searchParams }: { searchParams: Promise<Query> }) {
  if (process.env.NODE_ENV === 'production' && process.env.PETAL_LAB !== '1') notFound();
  const q = await searchParams;
  const show: Show = SHOWS.some((s) => s.id === q.show) ? (q.show as Show) : 'raidguild';
  if (show === 'tail') return <Tail show={show} />;
  if (show === 'height') return <Height show={show} />;
  const bench = await petalBench();
  if (show === 'raidguild') return <One show={show} flower={bench.raidguild} />;
  if (show === 'near') return <One show={show} flower={bench.near} />;
  const first = bench.keys[0]?.flower;
  return (
    <main className="fixed inset-0 flex flex-col bg-surface text-primary">
      <header className="flex items-baseline gap-space-32 border-hairline border-b p-space-16">
        <Nav show={show} />
        {first && <p className="m-0 type-caption">{first.highlight}</p>}
      </header>
      <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2">
        {bench.keys.map(({ key, flower }) => (
          <section key={key.name} className="flex min-h-0 border-hairline border-r border-b">
            <div className="relative min-w-0 flex-1">
              <Live flower={flower} className="absolute inset-0" />
              <div className="pointer-events-none absolute top-space-8 left-space-8 flex items-center gap-space-8 type-caption">
                <Swatch hex={key.hex} />
                <span>
                  {key.name} <span className="type-mono text-muted">{key.hex}</span>
                </span>
              </div>
            </div>
            <div className="flex w-drawing-144 shrink-0 flex-col items-center justify-end">
              <Live flower={flower} className="relative h-drawing-144 w-drawing-144" />
              <Live flower={flower} className="relative h-drawing-72 w-drawing-72" />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
