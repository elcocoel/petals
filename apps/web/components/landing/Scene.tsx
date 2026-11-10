// One of How it works' seven scenes (Figma "Petals / Illustrated scene", 179:2273), as a card in the row:
// its illustration, then the scene's name, a headline and a paragraph. The illustrations are Elco's, from
// Figma, in public/landing/how-it-works/ under the scene's id. They say nothing a screen reader needs: the
// words beside them do.

export function Scene({
  id,
  scene,
  headline,
  body,
}: {
  id: string;
  scene: string;
  headline: string;
  body: string;
}) {
  return (
    <li className="flex shrink-0 basis-4/5 snap-start flex-col md:basis-1/2 lg:basis-2/7">
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
      <p className="mt-space-16 mb-0 type-body">{body}</p>
    </li>
  );
}
