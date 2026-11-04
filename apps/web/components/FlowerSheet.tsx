// What every flower page shows first: the network and its date, the drawing with petal details,
// and the legend. Used by /f/[id], /draft and /publish.
import type { Spec } from '@petal/core/types';
import type { Rendered } from '../lib/flower-data.ts';
import { Flower } from './Flower.tsx';
import { Legend } from './Legend.tsx';

export function FlowerSheet({
  spec,
  rendered,
  sources,
}: {
  spec: Spec;
  rendered: Rendered;
  sources?: Record<string, string>;
}) {
  return (
    <>
      <p>
        <strong>{spec.network.id}</strong> ({spec.network.chain}, {spec.network.population}), data
        as of <strong>{spec.snapshot.as_of}</strong>
        {spec.snapshot.block_height !== undefined ? `, block ${spec.snapshot.block_height}` : ''}.{' '}
        <span className="muted">
          Measure {spec.selection.measure}; up to {spec.selection.petals} petals, then “
          {spec.selection.tail.label}”. Convention {spec.convention.id}
          {spec.convention.variation_of ? `, a variation of ${spec.convention.variation_of}` : ''}.
        </span>
      </p>
      <Flower svg={rendered.svg} petals={rendered.petals} title={spec.network.id} />
      <Legend items={rendered.legend} sources={sources} />
      <p className="muted">
        spec_sha256 <code>{rendered.spec_sha256}</code>, render_sha256{' '}
        <code>{rendered.render_sha256}</code>
      </p>
    </>
  );
}
