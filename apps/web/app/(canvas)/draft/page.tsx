// The draft view (T064; coordinator/one-source.md, steps 4 and 6): a flower from its spec alone (/draft?spec=,
// the view_url render_flower returns, where a map's drawings link), live, drawn in the person's view, with
// the same box as /make's. When its reading is on the Power Map, the map opens inside it, at its map's place;
// otherwise it stands alone. Not published, so there is no interpretation, maker or signature to show.
import { ReadingColumn } from '../../../components/SiteChrome.tsx';
import { Badge } from '../../../components/ui/Badge.tsx';
import { FlowerPage } from '../../../flower/FlowerPage.tsx';
import { FlowerAt } from '../../../flower/OnTheMap.tsx';
import { powerMapAt } from '../../../landscape/land.ts';
import { decodeDraft } from '../../../lib/draft.ts';
import { draftPanelFlower } from '../../../lib/panel-view.ts';
import { viewerView } from '../../../lib/viewer-view.ts';

export const dynamic = 'force-dynamic';

export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const param = Array.isArray(q.spec) ? q.spec[0] : q.spec;
  if (!param) {
    return (
      <ReadingColumn>
        <h1>Draft</h1>
        <p>
          Open a draft with <code>/draft?spec=…</code>, the <code>view_url</code> an agent hands
          back after <code>render_flower</code>.
        </p>
      </ReadingColumn>
    );
  }
  const decoded = decodeDraft(param);
  if (!decoded.ok) {
    return (
      <ReadingColumn>
        <h1>Draft</h1>
        <p className="error">{decoded.error}</p>
      </ReadingColumn>
    );
  }
  const { spec } = decoded;
  const at = await powerMapAt((await viewerView()).hash, { snapshot: spec.snapshot.sha256 });
  const flower = draftPanelFlower(spec);
  const note = (
    <p>
      <Badge>draft</Badge>{' '}
      <span className="muted">Made from the spec in this link; not published.</span>
    </p>
  );
  return 'error' in at || at.focus < 0 ? (
    <FlowerPage flower={flower} note={note} />
  ) : (
    <FlowerAt land={at.land} focus={at.focus} flower={flower} note={note} />
  );
}
