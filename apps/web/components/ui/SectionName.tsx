// A section's name, small and in the Petals wordmark's own face, so the cards under it carry the section. The
// `logo` look, used by every landing section: the name drawn as the wordmark is, its three layers at one origin, on
// one more layer in mint with its cells solid (mark.base), so it reads at this small size and still opens as the
// pointer nears. Two more looks stay for the lab: `pixel`, two layers a size smaller; `signed`, the small wordmark
// before it. Only the name is read aloud.
import { Wordmark } from './Wordmark.tsx';

export type SectionNameLook = 'logo' | 'pixel' | 'signed';

/** The name in the wordmark's layers: all three, or the mint and the ink; the logo's on its mint base. */
function Layers({ name, size, middle }: { name: string; size: string; middle: boolean }) {
  return (
    // a name can wrap in a narrow column; each layer wraps alike, the face's letters being one width
    <span data-b="mark" data-kind="wordmark" className={`wordmark whitespace-normal ${size}`}>
      {middle && (
        <span aria-hidden="true" data-layer="base" className="hidden select-none">
          {name}
        </span>
      )}
      <span aria-hidden="true" className="wordmark-back select-none">
        {name}
      </span>
      {middle && (
        <span aria-hidden="true" className="wordmark-middle select-none">
          {name}
        </span>
      )}
      <span className="wordmark-front">{name}</span>
    </span>
  );
}

export function SectionName({ name, look = 'logo' }: { name: string; look?: SectionNameLook }) {
  if (look === 'signed')
    return (
      <h2 className="my-0 flex flex-wrap items-baseline gap-x-block-gap gap-y-space-8">
        <span aria-hidden="true" className="flex">
          <Wordmark size="workspace" />
        </span>
        <Layers name={name} size="wordmark-workspace" middle />
      </h2>
    );
  return (
    // a long name breaks into two balanced lines rather than running across the band
    <h2 className="my-0 max-w-conversation-width text-balance">
      {look === 'logo' ? (
        <Layers name={name} size="wordmark-nav" middle />
      ) : (
        <Layers name={name} size="wordmark-workspace" middle={false} />
      )}
    </h2>
  );
}
