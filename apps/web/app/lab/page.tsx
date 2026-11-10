// The lab (T176): every registered component and every token, biggest first, from saved fixtures
// (lab/LabPage.tsx). It's outside (site) so the sections get the whole window. In production it stays
// hidden unless PETAL_LAB=1, and it's read on each request so a build doesn't freeze the choice.
import { notFound } from 'next/navigation';
import { readFixtures } from '../../lab/fixture-files.ts';
import { LabPage } from '../../lab/LabPage.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Lab · Petals', robots: { index: false } };

export default function Lab() {
  if (process.env.NODE_ENV === 'production' && process.env.PETAL_LAB !== '1') notFound();
  return <LabPage files={readFixtures()} />;
}
