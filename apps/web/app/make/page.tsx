// The maker chat (T065). The chat itself is a client component; ?run=<id> reopens a stored run.
import { Chat } from '../../components/Chat.tsx';
import { api } from '../../lib/api.ts';
import type { ApiHealth } from '../../lib/api-label.ts';

export const dynamic = 'force-dynamic';

export default async function MakePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const run = Array.isArray(q.run) ? q.run[0] : q.run;
  const health = await api<ApiHealth>('/api/v1/health');
  const recorded = health.ok && health.value.llm === 'recorded';
  return (
    <>
      <h1>Make a flower</h1>
      {recorded ? (
        <p style={{ border: '2px solid currentColor', padding: '0.75rem' }}>
          <strong>Recorded demo. No AI is running.</strong> This plays back one saved run about
          NEAR’s validators. It can’t read a question yet, so there’s nothing to type. The real
          agent switches on once a NEAR AI key is set.
        </p>
      ) : (
        <p className="muted">
          Petal’s agent reads the network with Petal’s tools, counts, proposes a mapping, checks it
          and draws. Every number it quotes comes from the tools.
        </p>
      )}
      <Chat initialRun={run} recorded={recorded} />
    </>
  );
}
