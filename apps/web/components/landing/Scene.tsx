// One of How it works' seven scenes (Figma "Petals / Illustrated scene", 179:2273), as a box in the row:
// its illustration, then the scene's name, a headline and a paragraph, and under them the line that keeps
// its time while it's in focus (box.focus and box.cycle, app/versions/v2.css; version 1 shows the focus as
// a darker edge, and no line). The illustrations are Elco's, from Figma, in public/landing/how-it-works/
// under the scene's id. They say nothing a screen reader needs: the words beside them do.
import type { AnimationEvent } from 'react';

export function Scene({
  id,
  scene,
  headline,
  body,
  current = false,
  onTimeUp,
}: {
  id: string;
  scene: string;
  headline: string;
  body: string;
  /** The scene in focus. */
  current?: boolean;
  /** Its line has filled. */
  onTimeUp?: () => void;
}) {
  const timeUp = (e: AnimationEvent) => {
    if (current && e.target === e.currentTarget) onTimeUp?.();
  };
  return (
    <li
      data-b="box"
      data-kind="scene"
      data-current={current ? '' : undefined}
      aria-current={current ? 'true' : undefined}
      className="flex shrink-0 basis-4/5 snap-start flex-col border border-hairline p-block-gap data-current:border-primary md:basis-1/2 lg:basis-2/7"
    >
      {/* biome-ignore lint/performance/noImgElement: a still illustration, served as it is */}
      <img
        className="block h-auto w-full"
        src={`/landing/how-it-works/${id}.webp`}
        width={1200}
        height={961}
        loading="lazy"
        alt=""
      />
      <p className="mt-block-gap mb-0 type-caption">{scene}</p>
      <h3 className="mt-text-gap mb-0 type-heading">{headline}</h3>
      <p className="mt-space-16 mb-0 grow type-body">{body}</p>
      <span
        data-progress=""
        aria-hidden="true"
        className="mt-block-gap hidden border-t-heavy border-accent"
        onAnimationEnd={timeUp}
      />
    </li>
  );
}
