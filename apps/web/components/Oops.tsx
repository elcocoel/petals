// The bouncer, for when you're not signed in on /make and for errors and the 404: Petals' agent behind a velvet
// rope, palms up (Figma 233:2359; public/illustrations/oops.webp, 960 px for up to 480 on screen).
// The drawing is the page's subject and the words its caption: large, beside the words on a wide window and
// above them on a phone; a heading, one line, one main action and a quieter one, close together with room
// around them. The signed-out workspace, the 404 and the error pages. Props only.
import type { ReactNode } from 'react';

export function Oops({
  title,
  body,
  primary,
  secondary,
  note,
  after,
}: {
  title: string;
  /** one short line */
  body: string;
  /** the one main way on: a primary button */
  primary: ReactNode;
  /** a quieter way, under it */
  secondary?: ReactNode;
  /** a quiet line under the words, such as a question that waits */
  note?: ReactNode;
  /** under the actions: why the last try didn't work */
  after?: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface p-block-gap">
      <div className="grid w-full max-w-content-width items-center justify-items-center gap-space-32 md:grid-cols-2 md:gap-column-gap">
        {/* biome-ignore lint/performance/noImgElement: a still picture of our own, from 960 px */}
        <img
          src="/illustrations/oops.webp"
          alt=""
          width={480}
          height={480}
          className="h-auto w-tile-width md:w-full"
        />
        <div className="flex flex-col items-center gap-space-16 text-center md:items-start md:justify-self-start md:text-left">
          <div className="flex flex-col gap-space-8">
            <h1 className="my-0 type-heading text-balance">{title}</h1>
            <p className="my-0 type-label text-balance text-muted">{body}</p>
            {note}
          </div>
          <div className="flex flex-col items-center gap-space-8 md:items-start">
            {primary}
            {secondary}
          </div>
          {after}
        </div>
      </div>
    </div>
  );
}
