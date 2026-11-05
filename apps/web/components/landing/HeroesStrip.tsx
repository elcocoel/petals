// Figma's Heroes strip (66:2396): five flowers, the first one marked.
import type { ThumbKind } from '../../lib/figures.ts';
import { Thumb } from '../ui/Thumb.tsx';

export function HeroesStrip({ thumbs }: { thumbs: readonly ThumbKind[] }) {
  return (
    <div className="flex flex-wrap items-end gap-text-gap">
      {thumbs.map((kind, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the same kind can appear twice, and nothing moves
        <div key={i} className="flex flex-col gap-space-8">
          <div className={i === 0 ? '' : 'opacity-inactive'}>
            <Thumb kind={kind} size="strip" />
          </div>
          <div
            className={`w-full border-t-heavy ${i === 0 ? 'border-accent' : 'border-hairline'}`}
          />
        </div>
      ))}
    </div>
  );
}
