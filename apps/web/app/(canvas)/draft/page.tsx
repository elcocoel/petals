// The draft view (T064; coordinator/one-source.md, step 4): a flower from its spec alone (/draft?spec=, the
// view_url render_flower returns), live, drawn in the person's view, with the same box as /make's. Not
// published, so there is no interpretation, maker or signature to show.
import { ReadingColumn } from '../../../components/SiteChrome.tsx';
import { Badge } from '../../../components/ui/Badge.tsx';
import { FlowerPage } from '../../../flower/FlowerPage.tsx';
import { decodeDraft } from '../../../lib/draft.ts';
import { draftPanelFlower } from '../../../lib/panel-view.ts';

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
  return (
    <FlowerPage
      flower={draftPanelFlower(decoded.spec)}
      note={
        <p>
          <Badge>draft</Badge>{' '}
          <span className="muted">Made from the spec in this link; not published.</span>
        </p>
      }
    />
  );
}
