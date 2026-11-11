// The bouncer (Elco, 11 Nov: "i made this illustration for when you're not logged in on /make and other
// errors or 404 etc"): Petals' agent behind a velvet rope, palms up (design/illustrations/
// oops-not-logged-in-v1.png, Figma 233:2359; public/illustrations/oops.webp, sized for 240 px), over a title,
// a line and a way back. One picture for the signed-out workspace, the 404 and the error pages. Props only.
import type { ReactNode } from 'react';
import { ActionRow } from './ui/ActionRow.tsx';

export function Oops({
  title,
  body,
  note,
  after,
  children,
}: {
  title: string;
  /** one short line, or two with a line break */
  body?: string;
  /** a quiet line under it, such as a question that waits */
  note?: ReactNode;
  /** under the way back: why the last try didn't work */
  after?: ReactNode;
  /** the way back: its buttons */
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-block-gap bg-surface p-block-gap text-center">
      {/* biome-ignore lint/performance/noImgElement: a still picture of our own, sized for 240 px */}
      <img src="/illustrations/oops.webp" alt="" width={240} height={240} />
      <div className="flex max-w-content-width flex-col items-center gap-text-gap">
        <h1 className="my-0 type-title">{title}</h1>
        {body && <p className="my-0 type-body whitespace-pre-line">{body}</p>}
        {note}
      </div>
      <ActionRow gap="tight">{children}</ActionRow>
      {after}
    </div>
  );
}
