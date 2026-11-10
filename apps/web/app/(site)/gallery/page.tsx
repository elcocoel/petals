// The gallery (T063): the flowers published on NEAR, each with its transaction. No sign-in. The fixtures,
// the server's status line and the old sponsor box are gone (Elco, 10 Nov: the same flower twice, raw
// timestamps and an old payment story).
import { FlowerTile } from '../../../components/FlowerTile.tsx';
import { TextLink } from '../../../components/ui/TextLink.tsx';
import { api } from '../../../lib/api.ts';
import {
  dateLabel,
  flowerImage,
  type ListedFlower,
  networkLabel,
} from '../../../lib/flower-view.ts';
import { explorerTxUrl } from '../../../lib/publish.ts';

export const dynamic = 'force-dynamic';

/** Only what is published on NEAR: a fixture is the same flower again, for tests. */
const onNear = (flowers: ListedFlower[]) => flowers.filter((f) => f.where === 'map');

export default async function Gallery() {
  const res = await api<{ flowers: ListedFlower[] }>('/api/v1/flowers');
  return (
    <>
      <h1>Gallery</h1>
      <p>
        Flowers show who holds power in a network. Open one to read it; no account needed.{' '}
        <a href="/make">Talk to the agent</a>.
      </p>
      {!res.ok ? (
        <p className="error">
          Could not list flowers: {res.error.code}: {res.error.message}
        </p>
      ) : onNear(res.value.flowers).length === 0 ? (
        <p>No flowers yet.</p>
      ) : (
        <ul className="gallery">
          {onNear(res.value.flowers).map((f) => (
            <li key={`${f.where}:${f.id}`}>
              <FlowerTile
                title={f.title ?? f.id}
                where={`${networkLabel(f.network)}   /   ${dateLabel(f.as_of)}`}
                badge="on NEAR"
                image={flowerImage(f.id)}
                href={`/f/${f.id}`}
              >
                {f.tx_hash && (
                  <TextLink variant="quiet" href={explorerTxUrl(f.tx_hash)} rel="noreferrer">
                    Transaction
                  </TextLink>
                )}
              </FlowerTile>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
