// The doors: whatever someone already uses, one clear way in (lib/doors.ts).
import { headers } from 'next/headers';
import { CopyPrompt } from '../../../components/CopyPrompt.tsx';
import { originFrom } from '../../../lib/agent-prompt.ts';
import { doors } from '../../../lib/doors.ts';

export const dynamic = 'force-dynamic';

export default async function Connect() {
  const origin = originFrom(await headers());
  return (
    <>
      <h1>Use Petal from your own AI</h1>
      <p>
        Nothing to install. Every door here reaches the same tools, the same rules and the same
        flowers. Or just <a href="/make">talk to Petal’s agent here</a>.
      </p>
      {doors(origin).map((d) => (
        <section key={d.id} id={d.id}>
          <h2>{d.title}</h2>
          <p>{d.how}</p>
          {d.copy && <CopyPrompt prompt={d.copy} label={d.copyLabel ?? 'Copy'} />}
        </section>
      ))}
    </>
  );
}
