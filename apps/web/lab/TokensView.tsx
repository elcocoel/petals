// The tokens as they stand, read from packages/tokens: type and fonts, colours and each role on each
// surface, strokes and radius, layout, sizes.
import {
  chart,
  cornerRadius,
  fonts,
  kebab,
  layout,
  type Paint,
  paintName,
  primitives,
  quarantine,
  type Roles,
  sizes,
  surfaceNames,
  surfaces,
  type,
} from '@petal/tokens';
import { Eyebrow } from '../components/ui/Eyebrow.tsx';
import { Surface } from '../components/ui/Surface.tsx';

const SAMPLE = 'Power has a shape.';

/** Written out, because Tailwind only generates the class names it can read in the source. */
const FONT_CLASS: Record<keyof typeof fonts, string> = {
  sans: 'font-sans',
  mono: 'font-mono',
  pixel: 'font-pixel',
};

function Swatch({ swatch, name, value }: { swatch: string; name: string; value: string }) {
  return (
    <div className="flex flex-col gap-text-gap">
      <div data-swatch={swatch} className="h-control-height w-full border border-hairline" />
      <div>
        <p className="type-caption">{name}</p>
        <p className="type-mono text-muted">{value}</p>
      </div>
    </div>
  );
}

function TokenTable({ rows }: { rows: [name: string, value: number, css: string][] }) {
  return (
    <table>
      <tbody>
        {rows.map(([name, value, css]) => (
          <tr key={name}>
            <td>{name}</td>
            <td>{value}</td>
            <td className="type-mono">{css}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const spacingRows = (values: Record<string, number>): [string, number, string][] =>
  Object.entries(values).map(([name, px]) => [name, px, kebab(name)]);

const SWATCH_GRID = 'grid grid-cols-2 gap-block-gap md:grid-cols-4';

/** Sizes only the workspace and the old pages use. Not the system, so it goes in the closed part. */
export function QuarantineTable() {
  return <TokenTable rows={spacingRows(quarantine)} />;
}

export function TokensView() {
  return (
    <section id="tokens" className="flex flex-col gap-column-gap">
      <h2>Primitives</h2>
      <div className="flex flex-col gap-block-gap">
        {Object.entries(type).map(([name, s]) => (
          <div key={name} className="flex flex-col gap-text-gap">
            <p className="type-mono text-muted">
              {name}, {s.size}/{s.line}, {s.weight}
              {s.tracking ? `, ${s.tracking * 100}%` : ''} · type-{kebab(name)}
            </p>
            <p className={`type-${kebab(name)}`}>{SAMPLE}</p>
          </div>
        ))}
        {(Object.entries(fonts) as [keyof typeof fonts, (typeof fonts)[keyof typeof fonts]][]).map(
          ([name, font]) => (
            <div key={name} className="flex flex-col gap-text-gap">
              <p className="type-mono text-muted">
                {name}, {font.family} · {FONT_CLASS[name]}
              </p>
              <p className={FONT_CLASS[name]}>{SAMPLE}</p>
            </div>
          ),
        )}
      </div>
      <div className={SWATCH_GRID}>
        {Object.entries(primitives).map(([name, hex]) => (
          <Swatch key={name} swatch={`primitive-${kebab(name)}`} name={name} value={hex} />
        ))}
      </div>
      {surfaceNames.map((kind) => (
        <Surface key={kind} kind={kind} className="flex flex-col gap-block-gap p-block-gap">
          <Eyebrow>data-surface="{kind}"</Eyebrow>
          <div className={SWATCH_GRID}>
            {(Object.entries(surfaces[kind]) as [keyof Roles, Paint][]).map(([role, paint]) => (
              <Swatch key={role} swatch={role} name={`--${role}`} value={paintName(paint)} />
            ))}
          </div>
        </Surface>
      ))}
      <div className={SWATCH_GRID}>
        {Object.entries(chart).map(([name, hex]) => (
          <Swatch key={name} swatch={name} name={`--chart-${name}`} value={hex} />
        ))}
      </div>
      <TokenTable rows={[['cornerRadius', cornerRadius, 'border-radius']]} />
      <TokenTable rows={spacingRows(layout)} />
      <TokenTable rows={spacingRows(sizes)} />
    </section>
  );
}
