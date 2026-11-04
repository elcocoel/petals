// FastData's limits (shared-map.md). FastData drops anything over a limit silently, so every
// Petal writer refuses it first, with checkWrite.
import { canonicalJson } from '@petal/core';

export const MAP_KEY_PREFIX = 'petal/v1/';

export const MAP_LIMITS = { keysPerWrite: 256, keyBytes: 1024, valueBytes: 256 * 1024 } as const;

/** NEAR's transaction size limit is 1.5 MiB; keep 4 KiB for the transaction around the args. */
export const MAX_ARGS_BYTES = 1.5 * 1024 * 1024 - 4096;

export const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/** The checks every Petal map writer makes before sending. Throws on the first problem. */
export function checkWrite(entries: Record<string, unknown>): void {
  const keys = Object.keys(entries);
  if (keys.length === 0) throw new Error('map write: no keys');
  if (keys.length > MAP_LIMITS.keysPerWrite)
    throw new Error(`map write: ${keys.length} keys, at most ${MAP_LIMITS.keysPerWrite} per call`);
  for (const key of keys) {
    if (!key.startsWith(MAP_KEY_PREFIX))
      throw new Error(`map write: key outside ${MAP_KEY_PREFIX}: ${key}`);
    if (utf8Length(key) > MAP_LIMITS.keyBytes)
      throw new Error(`map write: key over ${MAP_LIMITS.keyBytes} bytes: ${key.slice(0, 60)}…`);
    const value = entries[key];
    if (value !== null && utf8Length(canonicalJson(value)) > MAP_LIMITS.valueBytes)
      throw new Error(`map write: value over ${MAP_LIMITS.valueBytes} bytes at ${key}`);
  }
}
