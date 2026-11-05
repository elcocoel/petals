// Figma's Heroes strip (66:2396): the flowers people have mapped, the current one marked. Static for
// now: the other four have no copy yet, so nothing rotates.
import type { ThumbKind } from '../../lib/figures.ts';
import { Thumb } from '../ui/Thumb.tsx';

export function HeroesStrip({
  thumbs,
  active = 0,
}: {
  thumbs: readonly ThumbKind[];
  active?: number;
}) {
  return (
    <div className="flex flex-wrap items-end gap-text-gap">
      {thumbs.map((kind, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the same kind can appear twice, and nothing moves
        <div key={i} className="flex flex-col gap-space-6">
          <div className={i === active ? '' : 'opacity-55'}>
            <Thumb kind={kind} size="strip" />
          </div>
          <div className={`h-space-2 w-full ${i === active ? 'bg-accent' : 'bg-hairline'}`} />
        </div>
      ))}
    </div>
  );
}
