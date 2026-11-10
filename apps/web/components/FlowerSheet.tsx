// What every flower page shows first: the network and its date, the drawing with petal details,
// and the legend. Used by /f/[id], /draft and /publish.
import type { Spec } from '@petal/core/types';
import type { Rendered } from '../lib/flower-data.ts';
import { chainLabel, colourKeys, dateLabel, networkLabel } from '../lib/flower-view.ts';
import { Flower } from './Flower.tsx';
import { Legend, LegendKeys } from './Legend.tsx';

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
      {/* One line in people's words (design/minimally-good.md, rule 5): what, where, when. */}
      <p>
        <strong>{networkLabel(spec.network.id)}</strong> · {chainLabel(spec.network.chain)} ·{' '}
        {dateLabel(spec.snapshot.as_of)}
        {spec.snapshot.block_height !== undefined
          ? ` · block ${spec.snapshot.block_height.toLocaleString('en-US')}`
          : ''}
      </p>
      <Flower svg={rendered.svg} petals={rendered.petals} title={spec.network.id} />
      <LegendKeys keys={colourKeys([rendered.legend])} />
      <Legend items={rendered.legend} sources={sources} />
    </>
  );
}
