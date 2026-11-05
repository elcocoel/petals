// The flower view (T064): a published or fixture flower, its date, legend, interpretation with
// sources and unknowns, the model signature (or why there is none), who published it and when,
// and petal details on click. Plus "Sponsor a refresh" (T067).
import type { Entry } from '@petal/core/types';
import { FlowerSheet } from '../../../components/FlowerSheet.tsx';
import { Interpretation, SignatureLine } from '../../../components/Interpretation.tsx';
import { QuotePanel } from '../../../components/QuotePanel.tsx';
import { api } from '../../../lib/api.ts';
import { renderSpec, sourceUrls } from '../../../lib/flower-data.ts';
import { explorerTxUrl } from '../../../lib/publish.ts';

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
  const got = await api<GotFlower>(`/api/v1/flowers/${encodeURIComponent(id)}`);
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
    renderSpec(entry.spec),
    sourceUrls(entry.spec.snapshot.sha256),
  ]);
  const maker = entry.provenance.maker;
  const agent = entry.provenance.agent;
  // What drew it when it was published. Today's renderer may draw it differently; that is normal.
  const firstDrawn = entry.petal === 'flower/v1' ? entry.render_sha256 : entry.drawn_with?.sha256;
  return (
    <>
      <h1>{entry.title ?? `Flower ${entry.id}`}</h1>
      <p>
        {where === 'map' ? (
          <span className="badge">on NEAR</span>
        ) : (
          <span className="badge">fixture</span>
        )}{' '}
        <span className="muted">
          id <code>{entry.id}</code> (entry hash {yesNo(verified.entry_hash)})
        </span>
      </p>
      {rendered.ok ? (
        <FlowerSheet spec={entry.spec} rendered={rendered.value} sources={sources} />
      ) : (
        <p className="error">
          Could not draw it: {rendered.error.code}: {rendered.error.message}
        </p>
      )}
      {rendered.ok && firstDrawn && rendered.value.render_sha256 !== firstDrawn && (
        <p className="muted">
          Same facts, today’s look. It was first drawn as <code>{firstDrawn}</code>.
        </p>
      )}
      <Interpretation reading={entry.interpretation} sources={sources} />
      <SignatureLine signature={agent.signature} model={agent.model} />
      <section>
        <h2>Who made it</h2>
        <p>
          Agent: {agent.kind}
          {agent.name ? ` (${agent.name})` : ''}
          {agent.model ? `, model ${agent.model}` : ''}; made {entry.provenance.created_at}; tools{' '}
          {entry.provenance.tools_version}.
        </p>
        {maker ? (
          <p>
            Published by <strong>{maker.account_id}</strong>: signature{' '}
            {yesNo(verified.maker_signature)}
            {tx_hash && (
              <>
                , written in transaction{' '}
                <a href={explorerTxUrl(tx_hash)} rel="noreferrer">
                  <code>{tx_hash}</code>
                </a>
              </>
            )}
            .
          </p>
        ) : (
          <p className="muted">Not published by a maker: a fixture shipped with Petal.</p>
        )}
      </section>
      <QuotePanel purpose="sponsor_refresh" network={entry.spec.network.id} />
    </>
  );
}
