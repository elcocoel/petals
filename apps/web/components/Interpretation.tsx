// The interpretation (T064, constitution II): the argued reading, every mapping with its sources,
// conflicts, what is inferred, and what the data can't tell (unknowns).
import type { ModelSignature, Interpretation as Reading } from '@petal/core/types';
import { outside } from '../lib/outside.ts';
import { SourceList } from './Sources.tsx';

export function Interpretation({
  reading,
  sources,
}: {
  reading: Reading;
  sources?: Record<string, string>;
}) {
  const urls = {
    ...sources,
    ...Object.fromEntries(reading.documents.map((d) => [d.id, d.url])),
  };
  return (
    <section>
      <h2>Interpretation</h2>
      <p>{reading.summary}</p>
      <h3>What power means here</h3>
      <ul>
        {reading.power_means.map((p) => (
          <li key={p.claim}>
            {p.claim} <SourceList ids={p.sources} urls={urls} />
            {p.figures && p.figures.length > 0 && (
              <>
                {' '}
                <span className="muted">figures: {p.figures.join(', ')}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      <h3>Why it looks this way</h3>
      <ul>
        {reading.mappings.map((m) => (
          <li key={m.primitive}>
            <strong>{m.primitive}</strong>: {m.why} <SourceList ids={m.sources} urls={urls} />
          </li>
        ))}
      </ul>
      {reading.conflicts.length > 0 && (
        <>
          <h3>Conflicts</h3>
          <ul>
            {reading.conflicts.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
      <h3>What the data can’t tell</h3>
      <ul>
        {reading.unknowns.map((u) => (
          <li key={u}>{u}</li>
        ))}
      </ul>
      {reading.inferred.length > 0 && (
        <>
          <h3>Inferred, not proven</h3>
          <ul>
            {reading.inferred.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      )}
      {reading.documents.length > 0 && (
        <>
          <h3>Documents</h3>
          <ul>
            {reading.documents.map((d) => (
              <li key={d.id}>
                <a href={d.url} {...outside(d.url)}>
                  {d.title ?? d.url}
                </a>{' '}
                <span className="muted">
                  ({d.kind}, fetched {d.fetched_at})
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** The model signature under the interpretation, or why there is none. */
export function SignatureLine({
  signature,
  model,
}: {
  signature?: ModelSignature | null;
  model?: string;
}) {
  if (!signature) {
    return (
      <p className="muted">
        {model === 'recorded' ? 'Recorded run, no signature.' : 'No model signature.'}
      </p>
    );
  }
  return (
    <p>
      {model === 'recorded' && (
        <>
          Recorded run: nothing is running now. This signature was made when the run was recorded,
          on {signature.fetched_at.slice(0, 10)}.{' '}
        </>
      )}
      Model signature: {signature.signature_kind} by <code>{signature.model}</code>, signing address{' '}
      <code>{signature.signing_address}</code> ({signature.signing_algo}), completion{' '}
      <code>{signature.completion_id}</code>
      {signature.attestation?.report_url && (
        <>
          {' '}
          —{' '}
          <a href={signature.attestation.report_url} {...outside(signature.attestation.report_url)}>
            attestation report
          </a>
        </>
      )}
      .
    </p>
  );
}
