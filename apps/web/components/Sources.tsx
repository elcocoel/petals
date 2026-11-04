// Source ids, linked when the snapshot (or the interpretation's documents) gives their URL.
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
            <a href={urls[id]} rel="noreferrer">
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
