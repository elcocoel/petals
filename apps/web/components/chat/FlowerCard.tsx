// A flower in the thread, where it was made. It is handed its drawing, so it can be shown in any
// state from a saved fixture.
import type { PetalDetail } from '@petal/core/types';
import type { FlowerRow } from '../../lib/thread-view.ts';
import { Flower } from '../Flower.tsx';
import { Interpretation, SignatureLine } from '../Interpretation.tsx';
import { Legend } from '../Legend.tsx';

export function FlowerCard({
  row,
  drawn,
  failed,
}: {
  row: FlowerRow;
  drawn: { svg: string; petals: PetalDetail[] } | null;
  failed: string | null;
}) {
  const { flower, signature, model, showLink, publishUrl, checks } = row;
  return (
    <section className="box">
      {failed && <p className="error">The flower could not be drawn: {failed}</p>}
      {drawn ? (
        <Flower svg={drawn.svg} petals={drawn.petals} />
      ) : (
        !failed && <p className="muted">Drawing…</p>
      )}
      <Legend items={flower.legend} />
      {(showLink || publishUrl) && (
        <p>
          {showLink && (
            <a href={flower.view_url} target="_blank" rel="noreferrer">
              Open the flower
            </a>
          )}
          {showLink && publishUrl && ' · '}
          {publishUrl && <a href={publishUrl}>Publish on NEAR</a>}
        </p>
      )}
      <details>
        <summary>Interpretation, signature and checks</summary>
        <Interpretation reading={flower.interpretation} />
        <SignatureLine signature={signature} model={model} />
        <p>
          {checks}. spec_sha256 <code>{flower.spec_sha256}</code>
        </p>
      </details>
    </section>
  );
}
