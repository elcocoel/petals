// The doors: whatever someone already uses, one clear way in (lib/doors.ts). The first is the one prompt
// that joins the person's account, with a key the page mints (AgentKeyCopy).
import { headers } from 'next/headers';
import { AgentKeyCopy } from '../../../components/AgentKeyCopy.tsx';
import { CopyPrompt } from '../../../components/CopyPrompt.tsx';
import { originFrom } from '../../../lib/agent-prompt.ts';
import { connectPage, doors } from '../../../lib/doors.ts';

export const dynamic = 'force-dynamic';

export default async function Connect() {
  const origin = originFrom(await headers());
  return (
    <>
      <h1>{connectPage.title}</h1>
      <p>{connectPage.lead}</p>
      {doors(origin).map((d) => (
        <section key={d.id} id={d.id}>
          <h2>{d.title}</h2>
          <p>{d.how}</p>
          {d.agentKey && <AgentKeyCopy />}
          {d.copy && <CopyPrompt prompt={d.copy} label={d.copyLabel ?? 'Copy'} />}
        </section>
      ))}
    </>
  );
}
