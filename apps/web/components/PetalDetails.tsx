// One petal's details (T064): the account, its identity with its status, and the values behind
// each primitive (renderer.md PetalDetail). Plain markup; the beauty pass is M6.
import type { PetalDetail } from '@petal/core/types';

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

export function PetalDetails({ petal }: { petal: PetalDetail | null }) {
  if (!petal)
    return <p className="muted">Click a petal to see who it is and why it looks this way.</p>;
  const tail = petal.id === '__tail';
  return (
    <section className="box" aria-live="polite">
      <h3>
        {tail ? petal.label : <code>{petal.id}</code>}
        {!tail && petal.label !== petal.id ? ` (${petal.label})` : ''}
      </h3>
      <p>
        Rank {petal.rank}, {pct(petal.share)} of the measure, {petal.amount}
        {tail && petal.count !== undefined ? `, ${petal.count} participants grouped` : ''}. Kind:{' '}
        {petal.kind}.
      </p>
      <p>
        Identity:{' '}
        {petal.identity ? (
          <>
            {petal.identity.name} — <strong>{petal.identity.status}</strong> (source{' '}
            <code>{petal.identity.source}</code>)
          </>
        ) : (
          'none known'
        )}
      </p>
      {petal.values.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>primitive</th>
              <th>value</th>
              <th>why it looks this way</th>
            </tr>
          </thead>
          <tbody>
            {petal.values.map((v) => (
              <tr key={v.primitive}>
                <td>{v.primitive}</td>
                <td>{String(v.value)}</td>
                <td>{v.explains}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {petal.segments && petal.segments.length > 0 && (
        <>
          <h4>Segments</h4>
          <ul>
            {petal.segments.map((s) => (
              <li key={s.key}>
                {s.label}: {s.amount} ({pct(s.frac)})
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
