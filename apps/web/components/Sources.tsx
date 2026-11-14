// Source ids, linked when the snapshot (or the interpretation's documents) gives their URL.
import { outside } from '../lib/outside.ts';
export function SourceList({
  ids,
  urls,
}: {
  ids: readonly string[];
  urls?: Record<string, string>;
}) {
  return (
    <span className="sources">
      (sources:{' '}
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ', '}
          {urls?.[id] ? (
            <a href={urls[id]} {...outside(urls[id] ?? '')}>
              {id}
            </a>
          ) : (
            <code>{id}</code>
          )}
        </span>
      ))}
      )
    </span>
  );
}
