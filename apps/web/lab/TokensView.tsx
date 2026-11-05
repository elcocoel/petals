// The tokens as they stand, read from packages/tokens: colours, each role on each surface, type.
import {
  chart,
  kebab,
  layout,
  type Paint,
  paintName,
  primitives,
  type Roles,
  sizes,
  surfaceNames,
  surfaces,
  type,
} from '@petal/tokens';
import { Eyebrow } from '../components/ui/Eyebrow.tsx';
import { Surface } from '../components/ui/Surface.tsx';

const SAMPLE = 'Power has a shape.';

function Swatch({ swatch, name, value }: { swatch: string; name: string; value: string }) {
  return (
    <div className="flex flex-col gap-text-gap">
      <div data-swatch={swatch} className="h-control-height w-full border border-hairline" />
      <div>
        <p className="type-caption">{name}</p>
        <p className="type-mono-small text-muted">{value}</p>
      </div>
    </div>
  );
}

const SWATCH_GRID = 'grid grid-cols-2 gap-block-gap md:grid-cols-4';

export function TokensView() {
  return (
    <section id="tokens" className="flex flex-col gap-column-gap">
      <h2>Tokens</h2>
      <div className="flex flex-col gap-text-gap">
        <h3>Primitives</h3>
        <p className="type-caption text-muted">Code uses the roles below, never these.</p>
        <div className={SWATCH_GRID}>
          {Object.entries(primitives).map(([name, hex]) => (
            <Swatch key={name} swatch={`primitive-${kebab(name)}`} name={name} value={hex} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-text-gap">
        <h3>Roles, per surface</h3>
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
      </div>
      <div className="flex flex-col gap-text-gap">
        <h3>Chart</h3>
        <div className={SWATCH_GRID}>
          {Object.entries(chart).map(([name, hex]) => (
            <Swatch key={name} swatch={name} name={name} value={hex} />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-block-gap">
        <h3>Type</h3>
        {Object.entries(type).map(([name, s]) => (
          <div key={name} className="flex flex-col gap-text-gap">
            <p className="type-mono-small text-muted">
              {name}, {s.size}/{s.line}, {s.weight}
              {s.tracking ? `, ${s.tracking * 100}%` : ''} · type-{kebab(name)}
            </p>
            <p className={`type-${kebab(name)}`}>{SAMPLE}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-text-gap">
        <h3>Layout and sizes</h3>
        <table>
          <tbody>
            {Object.entries({ ...layout, ...sizes }).map(([name, px]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{px}</td>
                <td className="type-mono-small">{kebab(name)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
