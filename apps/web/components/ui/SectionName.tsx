// A section's name, small and in the Petals logo's own face (Elco, 13 Nov: the giant "How it works" "doesn't do
// any work ... section names should be smaller and maybe cooler ... something related to the Petals logo and the
// pixel font"; "the cards should do the talking"). Three looks, shown side by side on the landing for Elco to
// choose from: `logo`, the name drawn as the wordmark is (its three layers of the pixel face at one origin);
// `pixel`, two of them, the mint behind the ink, a size smaller; `signed`, the small Petals wordmark, then the
// name drawn as the wordmark is, as if the logo signs each section. Only the name is read aloud.
import { Wordmark } from './Wordmark.tsx';

export type SectionNameLook = 'logo' | 'pixel' | 'signed';

/** The name in the wordmark's layers: all three, or the mint and the ink. */
function Layers({ name, size, middle }: { name: string; size: string; middle: boolean }) {
  return (
    // a name can wrap in a narrow column; each layer wraps alike, the face's letters being one width
    <span data-b="mark" data-kind="wordmark" className={`wordmark whitespace-normal ${size}`}>
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
    <h2 className="my-0">
      {look === 'logo' ? (
        <Layers name={name} size="wordmark-nav" middle />
      ) : (
        <Layers name={name} size="wordmark-workspace" middle={false} />
      )}
    </h2>
  );
}
