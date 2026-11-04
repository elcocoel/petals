// The maker chat (T065). The chat itself is a client component; ?run=<id> reopens a stored run.
import { Chat } from '../../components/Chat.tsx';

export const dynamic = 'force-dynamic';

export default async function MakePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const run = Array.isArray(q.run) ? q.run[0] : q.run;
  return (
    <>
      <h1>Make a flower</h1>
      <p className="muted">
        Petal’s agent reads the network with Petal’s tools, counts, proposes a mapping, checks it
        and draws. Every number it quotes comes from the tools.
      </p>
      <Chat initialRun={run} />
    </>
  );
}
