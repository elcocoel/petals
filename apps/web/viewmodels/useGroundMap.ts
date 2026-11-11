// The Power Map as the workspace's ground (Elco, 11 Nov, #78, on /make signed out: "what am I looking at
// here?"): the same live map as /map, behind the conversation, so the room isn't empty. Its data is
// megabytes, so it's asked for once a visit (the adapter's readPowerMap) and moving between conversations,
// which stays inside the page, keeps it. Until it's here, or if it can't be read, the ground stays empty.
import { useEffect, useState } from 'react';
import type { BenchLandscape } from '../landscape/land.ts';
import { readPowerMap } from '../lib/agent-client.ts';

let asked: Promise<BenchLandscape | null> | null = null;

const read = () => {
  asked ??= readPowerMap().then(
    (body) => ('error' in body ? null : body),
    () => null,
  );
  return asked;
};

export function useGroundMap(): BenchLandscape | null {
  const [land, setLand] = useState<BenchLandscape | null>(null);
  useEffect(() => {
    let gone = false;
    void read().then((got) => {
      if (!gone) setLand(got);
    });
    return () => {
      gone = true;
    };
  }, []);
  return land;
}
