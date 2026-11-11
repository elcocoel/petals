// One of How it works' seven scenes (Figma "Petals / Illustrated scene", 179:2273), as a box in the row:
// on a wide window the illustration beside the story, as Figma draws it (the scene's name, a headline in
// Title, a paragraph in Lead); on a narrow one, the story under it. Under the story, the line that keeps
// its time while it's in focus (box.focus and box.cycle, app/versions/v2.css; version 1 shows the focus as
// a darker edge, and no line). The illustrations are Elco's, from Figma, in public/landing/how-it-works/
// under the scene's id. They say nothing a screen reader needs: the words beside them do. Its numeral, in
// the pixel face as the old steps had it, sits at its top right (Elco, 10 Nov: "some signifier at the top
// right for me to know how far down I am"), in a row of its own above the drawing and the story, so it never
// touches the words however tall they run (Elco, 12 Nov: card 02's numeral sat on its eyebrow). A press on its
// right half goes on, on its left half goes back;
// the ticks and arrows do the same for the keyboard. It grows no wider than the page, so a big screen still
// reads its paragraph in three lines or more.
import type { AnimationEvent, MouseEvent } from 'react';

export function Scene({
  id,
  scene,
  headline,
  body,
  numeral,
  current = false,
  onTimeUp,
  onPress,
}: {
  id: string;
  scene: string;
  headline: string;
  body: string;
  /** The scene in focus. */
  current?: boolean;
  /** Where it is in the row: 01 to 07. */
  numeral: string;
  /** Its line has filled. */
  onTimeUp?: () => void;
  /** A press on it, and which half it landed on. */
  onPress?: (half: 'back' | 'next') => void;
}) {
  const press = (e: MouseEvent<HTMLLIElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPress?.(e.clientX - r.left > r.width / 2 ? 'next' : 'back');
  };
  const timeUp = (e: AnimationEvent) => {
    if (current && e.target === e.currentTarget) onTimeUp?.();
  };
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the ticks and the arrows are its keyboard
    <li
      onClick={press}
      data-b="box"
      data-kind="scene"
      data-current={current ? '' : undefined}
      aria-current={current ? 'true' : undefined}
      className="relative flex max-w-page-width shrink-0 basis-4/5 cursor-pointer snap-center flex-col gap-block-gap border border-hairline p-block-gap data-current:border-primary lg:basis-3/4 lg:p-column-gap"
    >
      <p data-b="mark" data-kind="numeral" className="my-0 self-end type-pixel-numeral text-accent">
        {numeral}
      </p>
      <div className="flex flex-1 flex-col gap-block-gap lg:flex-row lg:items-center lg:gap-section-padding">
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
      </div>
    </li>
  );
}
