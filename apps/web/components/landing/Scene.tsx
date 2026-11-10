// One of How it works' seven scenes (Figma "Petals / Illustrated scene", 179:2273), as a box in the row:
// on a wide window the illustration beside the story, as Figma draws it (the scene's name, a headline in
// Title, a paragraph in Lead); on a narrow one, the story under it. Under the story, the line that keeps
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
      className="flex shrink-0 basis-4/5 snap-center flex-col gap-block-gap border border-hairline p-block-gap data-current:border-primary lg:basis-3/4 lg:flex-row lg:items-center lg:gap-section-padding lg:p-column-gap"
    >
      {/* biome-ignore lint/performance/noImgElement: a still illustration, served as it is */}
      <img
        className="block h-auto w-full lg:w-2/5 lg:shrink-0"
        src={`/landing/how-it-works/${id}.webp`}
        width={1200}
        height={961}
        loading="lazy"
        alt=""
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="my-0 type-caption">{scene}</p>
        <h3 className="mt-block-gap mb-0 type-heading lg:type-title">{headline}</h3>
        <p className="mt-block-gap mb-0 type-body lg:type-lead">{body}</p>
        <span
          data-progress=""
          aria-hidden="true"
          className="mt-column-gap hidden border-t-heavy border-accent"
          onAnimationEnd={timeUp}
        />
      </div>
    </li>
  );
}
