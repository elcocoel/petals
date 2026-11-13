// The flower view (T064): a published or fixture flower, live, drawn in the person's view, with the same box
// as /make's: its date, the reading key or the selected petal, and one quiet click away its interpretation
// with sources, the model signature (or why there is none), who made it and who published it. When its
// reading is on the Power Map, the map opens inside it, at its map's place; otherwise it stands alone.
import type { Entry } from '@petal/core/types';
import { notFound } from 'next/navigation';
import { ReadingColumn } from '../../../../components/SiteChrome.tsx';
import { Badge } from '../../../../components/ui/Badge.tsx';
import { FlowerPage } from '../../../../flower/FlowerPage.tsx';
import { FlowerAt } from '../../../../flower/OnTheMap.tsx';
import { powerMapAt } from '../../../../landscape/land.ts';
import { api } from '../../../../lib/api.ts';
import { dateLabel } from '../../../../lib/flower-view.ts';
import { isMissing } from '../../../../lib/missing.ts';
import { storedPanelFlower } from '../../../../lib/panel-view.ts';
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

export default async function FlowerPageRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const got = await api<GotFlower>(`/api/v1/flowers/${encodeURIComponent(id)}`);
  if (!got.ok) {
    // not there, or no such id: the site's 404, the bouncer
    if (isMissing(got.error)) notFound();
    return (
      <ReadingColumn>
        <h1>Flower {id}</h1>
        <p className="error">
          {got.error.code}: {got.error.message}
        </p>
        <p>
          <a href="/gallery">Back to the gallery</a>
        </p>
      </ReadingColumn>
    );
  }
  const { entry, where, tx_hash, verified } = got.value;
  const maker = entry.provenance.maker;
  const agent = entry.provenance.agent;
  const at = await powerMapAt((await viewerView()).hash, {
    snapshot: entry.spec.snapshot.sha256,
  });
  const flower = storedPanelFlower(entry, id, '');
  // People's words: where it lives, and a warning only if its entry doesn't match its id. Ids and
  // hashes stay in the API.
  const note = (where === 'map' || !verified.entry_hash) && (
    <>
      {where === 'map' && (
        <p>
          <Badge>on NEAR</Badge>
        </p>
      )}
      {!verified.entry_hash && <p className="error">This flower's entry doesn't match its id.</p>}
    </>
  );
  const about = (
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
  );
  // It is the page: no "Open as a page" from here.
  return 'error' in at || at.focus < 0 ? (
    <FlowerPage flower={flower} note={note} about={about} />
  ) : (
    <FlowerAt land={at.land} focus={at.focus} flower={flower} note={note} about={about} />
  );
}
