// The map side of getSnapshot over fakeMap() from @petal/near: a local stand-in for the
// MapIndex adapter @petal/tools builds over a MapReader and MapWriter (shared-map.md keys).
import type { MapIndex, SnapshotRef } from '@petal/core/types';
import { fakeMap } from '@petal/near';

export const indexKey = (k: { chain: string; population: string; block_height: number }) =>
  `petal/v1/index/${k.chain}/${k.population}/${k.block_height}`;
export const snapshotKey = (sha256: string) => `petal/v1/snapshot/${sha256}`;

/** fakeMap's type (not exported by @petal/near by name). */
export type TestMap = ReturnType<typeof fakeMap>;

export function mapIndexOver(map: TestMap = fakeMap()): MapIndex & { map: TestMap } {
  return {
    map,
    async lookup(k) {
      const row = await map.get(indexKey(k), map.writer);
      return (row?.value as { sha256?: string } | undefined)?.sha256 ?? null;
    },
    async record(ref: SnapshotRef) {
      if (ref.block_height === null) return null;
      const key = {
        chain: ref.network.chain,
        population: ref.network.population,
        block_height: ref.block_height,
      };
      const { tx_hash } = await map.write({
        [snapshotKey(ref.sha256)]: ref,
        [indexKey(key)]: { sha256: ref.sha256 },
      });
      return { tx_hash };
    },
  };
}
