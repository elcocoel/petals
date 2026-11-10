// The side panel's bench (Elco, 10 Nov): the panel at its real size, empty, with a first afternoon, with
// forty conversations in six projects, and folded. Hidden in production unless PETAL_LAB=1, as the lab is.
import { notFound } from 'next/navigation';
import { PanelBench } from '../../../lab/PanelBench.tsx';
import { PANEL_STATES, type PanelState } from '../../../lab/panel-fixtures.ts';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Side panel · Lab · Petals', robots: { index: false } };

export default async function PanelLab({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === 'production' && process.env.PETAL_LAB !== '1') notFound();
  const asked = (await searchParams).state;
  const state: PanelState =
    typeof asked === 'string' && asked in PANEL_STATES ? (asked as PanelState) : 'forty';
  return <PanelBench key={state} state={state} />;
}
