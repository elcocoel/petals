// The Power Map as the workspace's ground (Elco, 11 Nov, #78, on /make signed out: "what am I looking at
// here?"): the same live map as /map, behind the conversation, so the room isn't empty. Its data is
// megabytes, so it's asked for once a visit (the adapter's readPowerMap) and moving between conversations,
// which stays inside the page, keeps it. `opening` while it's on its way, so its room can say so (#78); if
// it can't be read, the room stays empty.
import { useEffect, useState } from 'react';
import type { BenchLandscape } from '../landscape/land.ts';
import { readPowerMap } from '../lib/agent-client.ts';

let asked: Promise<BenchLandscape | null> | null = null;

const readOnce = () => {
  asked ??= readPowerMap().then(
    (body) => ('error' in body ? null : body),
    () => null,
  );
  return asked;
};

export function useGroundMap(): { land: BenchLandscape | null; opening: boolean } {
  const [read, setRead] = useState<{ land: BenchLandscape | null; opening: boolean }>({
    land: null,
    opening: true,
  });
  useEffect(() => {
    let gone = false;
    void readOnce().then((got) => {
      if (!gone) setRead({ land: got, opening: false });
    });
    return () => {
      gone = true;
    };
  }, []);
  return read;
}
