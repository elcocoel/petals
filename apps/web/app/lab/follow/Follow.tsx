'use client';
// Reads the exploration every two seconds, and draws what its head says. Prints exactly what came
// back, for checking by hand. One iframe, so a new flower replaces the last one in place.
import { useEffect, useState } from 'react';

const EVERY_MS = 2000;

export function Follow({ token }: { token: string }) {
  const [status, setStatus] = useState<number | null>(null);
  const [head, setHead] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const poll = async () => {
      let wait = EVERY_MS;
      try {
        const r = await fetch(`/api/v1/explorations/${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        if (stopped) return;
        setStatus(r.status);
        // Revoked, expired or never there: one answer, and it won't change by asking again.
        if (r.status === 404) {
          setHead(null);
          return;
        }
        if (r.status === 429) wait = Number(r.headers.get('retry-after') ?? 2) * 1000;
        if (r.ok) {
          const packet = (await r.json()) as { current: { spec_sha256: string } | null };
          if (!stopped) setHead(packet.current?.spec_sha256 ?? null);
        }
      } catch {
        // A dropped connection: keep what's on screen, and ask again.
      }
      if (!stopped) timer = setTimeout(poll, wait);
    };
    if (token) poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [token]);

  return (
    <main>
      <p>
        <code>
          {status ?? '-'} {head ?? 'none'}
        </code>
      </p>
      {head ? <iframe className="h-screen w-full" src={`/d/${head}`} title={head} /> : null}
    </main>
  );
}
