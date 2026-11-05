// The lab (T176): every token and every registered component, from saved fixtures. In production it
// stays hidden unless PETAL_LAB=1, and it's read on each request so a build doesn't freeze the choice.
import { notFound } from 'next/navigation';
import { LabEntryView } from '../../lab/LabEntryView.tsx';
import { type LabEntry, NOT_IN_LAB, registry } from '../../lab/registry.tsx';
import { TokensView } from '../../lab/TokensView.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lab · Petals', robots: { index: false } };

const GROUPS: LabEntry['group'][] = [
  'Primitives',
  'The conversation',
  'The flower',
  'Reading',
  'Actions',
];

export default function Lab() {
  if (process.env.NODE_ENV === 'production' && process.env.PETAL_LAB !== '1') notFound();
  return (
    <div className="flex flex-col gap-column-gap">
      <div>
        <h1>Lab</h1>
        <p className="text-muted">
          Every token, and every component in every state its props can reach, from saved fixtures.
        </p>
        <p className="type-caption text-muted">
          Not drawn here: {Object.keys(NOT_IN_LAB).join(', ')}.
        </p>
      </div>
      <TokensView />
      {GROUPS.map((group) => (
        <section key={group} className="flex flex-col gap-column-gap">
          <h2>{group}</h2>
          {registry
            .filter((entry) => entry.group === group)
            .map((entry) => (
              <LabEntryView key={entry.id} entry={entry} />
            ))}
        </section>
      ))}
    </div>
  );
}
