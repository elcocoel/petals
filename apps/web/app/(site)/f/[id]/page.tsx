// The flower view (T064): a published or fixture flower, its date, legend, interpretation with
// sources and unknowns, the model signature (or why there is none), who published it and when,
// and petal details on click.
import type { Entry } from '@petal/core/types';
import { FlowerSheet } from '../../../../components/FlowerSheet.tsx';
import { Interpretation, SignatureLine } from '../../../../components/Interpretation.tsx';
import { Badge } from '../../../../components/ui/Badge.tsx';
import { api } from '../../../../lib/api.ts';
import { renderSpec, sourceUrls } from '../../../../lib/flower-data.ts';
import { dateLabel } from '../../../../lib/flower-view.ts';
import { explorerTxUrl } from '../../../../lib/publish.ts';
import { viewerView } from '../../../../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';

interface GotFlower {
  entry: Entry;
  where: 'map' | 'fixture';
  tx_hash?: string;
  verified: {
    entry_hash: boolean;
    maker_signature: boolean;
    model_signature: 'present' | 'absent';
  };
  corrections: unknown[];
}

const yesNo = (ok: boolean) => (ok ? 'verified' : 'NOT verified');

export default async function FlowerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [got, person] = await Promise.all([
    api<GotFlower>(`/api/v1/flowers/${encodeURIComponent(id)}`),
    viewerView(),
  ]);
  if (!got.ok) {
    return (
      <>
        <h1>Flower {id}</h1>
        <p className="error">
          {got.error.code}: {got.error.message}
        </p>
        <p>
          <a href="/gallery">Back to the gallery</a>
        </p>
      </>
    );
  }
  const { entry, where, tx_hash, verified } = got.value;
  const [rendered, sources] = await Promise.all([
    renderSpec(entry.spec, person.view),
    sourceUrls(entry.spec.snapshot.sha256),
  ]);
  const maker = entry.provenance.maker;
  const agent = entry.provenance.agent;
  // What drew it when it was published. Today's renderer may draw it differently; that is normal.
  const firstDrawn = entry.petal === 'flower/v1' ? entry.render_sha256 : entry.drawn_with?.sha256;
  return (
    <>
      <h1>{entry.title ?? `Flower ${entry.id}`}</h1>
      {/* People's words (design/minimally-good.md, rule 5): where it lives, and a warning only if its
          entry doesn't match its id. Ids and hashes stay in the API. */}
      {where === 'map' && (
        <p>
          <Badge>on NEAR</Badge>
        </p>
      )}
      {!verified.entry_hash && <p className="error">This flower's entry doesn't match its id.</p>}
      {rendered.ok ? (
        <FlowerSheet spec={entry.spec} rendered={rendered.value} sources={sources} />
      ) : (
        <p className="error">
          Could not draw it: {rendered.error.code}: {rendered.error.message}
        </p>
      )}
      {rendered.ok && firstDrawn && rendered.value.render_sha256 !== firstDrawn && (
        <p className="muted">Same facts, today’s look.</p>
      )}
      <Interpretation reading={entry.interpretation} sources={sources} />
      <SignatureLine signature={agent.signature} model={agent.model} />
      <section>
        <h2>Who made it</h2>
        <p>
          Made by {agent.name ?? agent.kind}
          {agent.model ? ` with ${agent.model}` : ''}, {dateLabel(entry.provenance.created_at)}.
        </p>
        {maker ? (
          <p>
            Published by <strong>{maker.account_id}</strong>: signature{' '}
            {yesNo(verified.maker_signature)}
            {tx_hash && (
              <>
                , written in transaction{' '}
                <a href={explorerTxUrl(tx_hash)} rel="noreferrer">
                  <code>{`${tx_hash.slice(0, 6)}…${tx_hash.slice(-4)}`}</code>
                </a>
              </>
            )}
            .
          </p>
        ) : (
          <p className="muted">Not published on NEAR yet.</p>
        )}
      </section>
    </>
  );
}
