// The gallery (T063): list_flowers, with "on NEAR" (and the transaction) or "fixture". No sign-in.
import { QuotePanel } from '../components/QuotePanel.tsx';
import { api } from '../lib/api.ts';
import { explorerTxUrl } from '../lib/publish.ts';

export const dynamic = 'force-dynamic';

interface ListedFlower {
  id: string;
  title: string | null;
  network: string;
  as_of: string;
  maker: string | null;
  published_at: string | null;
  where: 'map' | 'fixture';
  tx_hash?: string;
}

export default async function Gallery() {
  const res = await api<{ flowers: ListedFlower[] }>('/api/v1/flowers');
  const health = await api<{ mock?: boolean; map: string; llm: string }>('/api/v1/health');
  return (
    <>
      <h1>Gallery</h1>
      <p>
        Flowers show who holds power in a network. Open one to read it; no account needed.{' '}
        <a href="/make">Make a flower</a>.
      </p>
      {health.ok && (
        <p className="muted">
          API: {health.value.mock ? 'mock (fixtures)' : 'live'}; map {health.value.map}; agent{' '}
          {health.value.llm}.
        </p>
      )}
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
              <a href={`/f/${f.id}`}>{f.title ?? f.id}</a>
              {f.where === 'map' ? (
                <span className="badge">
                  on NEAR
                  {f.tx_hash && (
                    <>
                      {' '}
                      <a href={explorerTxUrl(f.tx_hash)} rel="noreferrer">
                        tx
                      </a>
                    </>
                  )}
                </span>
              ) : (
                <span className="badge">fixture</span>
              )}
              <br />
              <span className="muted">
                {f.network}, data as of {f.as_of}
                {f.maker ? `, signed by ${f.maker}` : ''}
                {f.published_at ? `, published ${f.published_at}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      <QuotePanel purpose="sponsor_coverage" />
    </>
  );
}
