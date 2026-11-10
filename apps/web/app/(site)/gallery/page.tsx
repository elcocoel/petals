// The gallery (T063): list_flowers, with "on NEAR" (and the transaction) or "fixture". No sign-in.
import { FlowerTile } from '../../../components/FlowerTile.tsx';
import { QuotePanel } from '../../../components/QuotePanel.tsx';
import { TextLink } from '../../../components/ui/TextLink.tsx';
import { api } from '../../../lib/api.ts';
import { type ApiHealth, apiLabel } from '../../../lib/api-label.ts';
import {
  dateLabel,
  flowerImage,
  type ListedFlower,
  networkLabel,
} from '../../../lib/flower-view.ts';
import { explorerTxUrl } from '../../../lib/publish.ts';

export const dynamic = 'force-dynamic';

export default async function Gallery() {
  const res = await api<{ flowers: ListedFlower[] }>('/api/v1/flowers');
  const health = await api<ApiHealth>('/api/v1/health');
  return (
    <>
      <h1>Gallery</h1>
      <p>
        Flowers show who holds power in a network. Open one to read it; no account needed.{' '}
        <a href="/make">Talk to the agent</a>.
      </p>
      {health.ok && <p className="muted">{apiLabel(health.value)}</p>}
      {!res.ok ? (
        <p className="error">
          Could not list flowers: {res.error.code}: {res.error.message}
        </p>
      ) : res.value.flowers.length === 0 ? (
        <p>No flowers yet.</p>
      ) : (
        <ul className="gallery">
          {res.value.flowers.map((f) => (
            <li key={`${f.where}:${f.id}`}>
              <FlowerTile
                title={f.title ?? f.id}
                where={`${networkLabel(f.network)}   /   ${dateLabel(f.as_of)}`}
                badge={f.where === 'map' ? 'on NEAR' : 'fixture'}
                image={flowerImage(f.id)}
                href={`/f/${f.id}`}
              >
                {f.tx_hash && (
                  <TextLink variant="quiet" href={explorerTxUrl(f.tx_hash)} rel="noreferrer">
                    Transaction
                  </TextLink>
                )}
                {(f.maker || f.published_at) && (
                  <span className="type-caption text-muted">
                    {f.maker ? `Signed by ${f.maker}` : ''}
                    {f.maker && f.published_at ? ', ' : ''}
                    {f.published_at ? `published ${f.published_at}` : ''}
                  </span>
                )}
              </FlowerTile>
            </li>
          ))}
        </ul>
      )}
      <QuotePanel purpose="sponsor_coverage" />
    </>
  );
}
