// Resolving `at` to a final NEAR block, for live modules.
import type { At, ResolvedAt } from '@petal/core/types';
import { InputError } from '../errors.ts';
import { type BlockInfo, type CallOptions, RpcError, type RpcPool } from '../rpc/pool.ts';
import { parseAt } from './at.ts';

/** Measured in step 1: 172M at 2025-11-10 to 222.9M at 2026-11-03. Only a first guess. */
export const BLOCKS_PER_SECOND = 1.64;
/** Regular nodes keep a few epochs (well over a day); older reads go to archival endpoints. */
export const ARCHIVAL_AFTER_MS = 24 * 3600 * 1000;

const ms = (b: BlockInfo) => Number(b.timestamp_ns / 1_000_000n);

/** Archival when the block is older than regular nodes keep. */
export function archivalFor(asOf: string, now = Date.now()): CallOptions {
  return { archival: now - Date.parse(asOf) > ARCHIVAL_AFTER_MS };
}

/** A block by height; skipped heights step down (at most `tries`). Null if none found. */
async function blockAtOrBelow(
  pool: RpcPool,
  height: number,
  o: CallOptions,
  tries = 6,
): Promise<BlockInfo | null> {
  for (let h = height; h > height - tries && h >= 0; h--) {
    try {
      return await pool.block({ block_id: h }, o);
    } catch (e) {
      if (e instanceof RpcError && e.cause_name === 'UNKNOWN_BLOCK') continue;
      throw e;
    }
  }
  return null;
}

/** The last block at or before `targetMs` (within a couple of seconds), by secant search. */
export async function blockAtTime(
  pool: RpcPool,
  targetMs: number,
  head: BlockInfo,
  now = Date.now(),
): Promise<BlockInfo> {
  if (targetMs >= ms(head)) return head;
  const o: CallOptions = { archival: now - targetMs > ARCHIVAL_AFTER_MS };
  let best: BlockInfo | null = null;
  let rate = BLOCKS_PER_SECOND;
  let h = Math.max(0, head.height - Math.round(((ms(head) - targetMs) / 1000) * rate));
  for (let i = 0; i < 8; i++) {
    const b = await blockAtOrBelow(pool, h, o);
    if (!b) break;
    const dt = ms(b) - targetMs; // > 0: too late
    if (dt <= 0 && (!best || b.height > best.height)) best = b;
    if (dt <= 0 && dt > -2000) return b;
    const span = (ms(head) - ms(b)) / 1000;
    if (span > 0 && head.height > b.height) rate = (head.height - b.height) / span;
    const step = Math.max(1, Math.round((Math.abs(dt) / 1000) * rate));
    h = dt > 0 ? b.height - step : b.height + step;
    if (h >= head.height) return best ?? head;
  }
  if (best) return best;
  throw new InputError(
    'cannot_read',
    `no NEAR block found before ${new Date(targetMs).toISOString()}`,
  );
}

/** Resolve `at` to a final block: latest, a fixed height, or the last block at or before a date. */
export async function resolveNearAt(pool: RpcPool, at: At | undefined): Promise<ResolvedAt> {
  const want = parseAt(at);
  const head = await pool.block({ finality: 'final' });
  if (want.kind === 'latest') return { block_height: head.height, as_of: head.as_of };
  if (want.kind === 'block') {
    if (want.block_height > head.height)
      throw new InputError(
        'bad_input',
        `block ${want.block_height} is not final yet (final head: ${head.height})`,
      );
    const behind = (head.height - want.block_height) / BLOCKS_PER_SECOND;
    const o: CallOptions = { archival: behind * 1000 > ARCHIVAL_AFTER_MS };
    try {
      const b = await pool.block({ block_id: want.block_height }, o);
      return { block_height: b.height, as_of: b.as_of };
    } catch (e) {
      if (e instanceof RpcError && e.cause_name === 'UNKNOWN_BLOCK')
        throw new InputError(
          'bad_input',
          `there is no block at height ${want.block_height} (skipped or unknown)`,
          {
            hint: 'ask for a nearby height, a date, or "latest"',
          },
        );
      throw e;
    }
  }
  if (want.ms > Date.now()) {
    // A bare date for today means "as of today": the final head.
    const today = want.iso.length === 10 && want.ms - 86_399_000 <= Date.now();
    if (today) return { block_height: head.height, as_of: head.as_of };
    throw new InputError('bad_input', `${want.iso} is in the future`, { hint: 'ask for "latest"' });
  }
  const b = await blockAtTime(pool, want.ms, head);
  return { block_height: b.height, as_of: b.as_of };
}
