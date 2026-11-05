// The draft view (T064): a flower from its spec alone (/draft?spec=, the view_url render_flower
// returns). Not published, so there is no interpretation, maker or signature to show.
import { FlowerSheet } from '../../../components/FlowerSheet.tsx';
import { decodeDraft } from '../../../lib/draft.ts';
import { renderSpec, sourceUrls } from '../../../lib/flower-data.ts';

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
      <>
        <h1>Draft</h1>
        <p>
          Open a draft with <code>/draft?spec=…</code>, the <code>view_url</code> an agent hands
          back after <code>render_flower</code>.
        </p>
      </>
    );
  }
  const decoded = decodeDraft(param);
  if (!decoded.ok) {
    return (
      <>
        <h1>Draft</h1>
        <p className="error">{decoded.error}</p>
      </>
    );
  }
  const { spec } = decoded;
  const [rendered, sources] = await Promise.all([
    renderSpec(spec),
    sourceUrls(spec.snapshot.sha256),
  ]);
  return (
    <>
      <h1>Draft: {spec.network.id}</h1>
      <p>
        <span className="badge">draft</span>{' '}
        <span className="muted">Made from the spec in this link; not published.</span>
      </p>
      {rendered.ok ? (
        <FlowerSheet spec={spec} rendered={rendered.value} sources={sources} />
      ) : (
        <p className="error">
          Could not draw this spec: {rendered.error.code}: {rendered.error.message}
          {rendered.error.hint ? ` (${rendered.error.hint})` : ''}
        </p>
      )}
    </>
  );
}
