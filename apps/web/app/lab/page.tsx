// The lab (T176): every registered component and every token, biggest first, from saved fixtures. It's
// outside (site) so the sections get the whole window. In production it stays hidden unless
// PETAL_LAB=1, and it's read on each request so a build doesn't freeze the choice.
import { notFound } from 'next/navigation';
import { LAB_COLUMN, LabEntryView, LabSectionView } from '../../lab/LabEntryView.tsx';
import { type ClosedGroup, type LabEntry, registry } from '../../lab/registry.tsx';
import { QuarantineView, TokensView } from '../../lab/TokensView.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lab · Petals', robots: { index: false } };

/** What the landing page's imports reach, after the sections. */
const TIERS: LabEntry['group'][] = ['Blocks', 'Controls', 'Marks'];
/** Everything else, one closed group each. */
const CLOSED: ClosedGroup[] = [
  'The workspace',
  'The conversation',
  'The flower',
  'Reading',
  'Actions',
];

const inGroup = (group: LabEntry['group']) => registry.filter((entry) => entry.group === group);

export default function Lab() {
  if (process.env.NODE_ENV === 'production' && process.env.PETAL_LAB !== '1') notFound();
  return (
    <main>
      <div className={LAB_COLUMN}>
        <h2>Sections</h2>
      </div>
      {inGroup('Sections').map((entry) => (
        <LabSectionView key={entry.id} entry={entry} />
      ))}
      <div className={`${LAB_COLUMN} flex flex-col gap-column-gap py-column-gap`}>
        {TIERS.map((group) => (
          <section key={group} className="flex flex-col gap-column-gap">
            <h2 className="m-0">{group}</h2>
            {inGroup(group).map((entry) => (
              <LabEntryView
                key={entry.id}
                entry={entry}
                states={entry.states.filter((state) => !state.closedIn)}
              />
            ))}
          </section>
        ))}
        <TokensView />
        <section className="flex flex-col gap-text-gap">
          <h2>Not on the landing page</h2>
          {CLOSED.map((group) => (
            <details key={group}>
              <summary>{group}</summary>
              <div className="flex flex-col gap-column-gap">
                {inGroup(group).map((entry) => (
                  <LabEntryView key={entry.id} entry={entry} states={entry.states} />
                ))}
                {registry.map((entry) => {
                  const states = entry.states.filter((state) => state.closedIn === group);
                  return states.length > 0 ? (
                    <LabEntryView key={entry.id} entry={entry} states={states} anchor={false} />
                  ) : null;
                })}
              </div>
            </details>
          ))}
          <details>
            <summary>Quarantine</summary>
            <QuarantineView />
          </details>
        </section>
      </div>
    </main>
  );
}
