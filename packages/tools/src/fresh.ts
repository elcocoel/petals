// T300: a fresh read uses the owner's connection and home address, and public sources have blocked this
// machine before. So each set of callers gets a gate: a few at a time, an overall timeout and a plain
// refusal when busy. The doors share one, the agent's runs have their own, so
// neither starves the other. A local command, with no door, has none.
import { AsyncLocalStorage } from 'node:async_hooks';
import { setRunSignalSource } from '@petal/core';
import type { FreshGate } from '@petal/inputs';
import { ToolFailure } from './errors.ts';
import { assertRoom, type LimitsConfig, limitsOf } from './limits.ts';

/** How long a caller refused for being busy is told to wait. */
const BUSY_RETRY_S = 30;

const scope = new AsyncLocalStorage<AbortSignal>();
setRunSignalSource(() => scope.getStore());

/** Runs `f` so that its fetches stop on `signal`, as well as on any signal it already runs under. */
export function withRunSignal<T>(signal: AbortSignal, f: () => T): T {
  const outer = scope.getStore();
  return scope.run(outer ? AbortSignal.any([outer, signal]) : signal, f);
}

export function freshGate(ctx: { config: LimitsConfig; now(): Date }): FreshGate {
  let running = 0;

  const busy = () => {
    const { freshAtOnce } = limitsOf(ctx.config);
    if (running >= freshAtOnce) {
      throw new ToolFailure(
        'rate_limited',
        `Petal is busy: it does ${freshAtOnce} fresh reads at a time, so this one was not started. Anything already stored is still free.`,
        `Try again in ${BUSY_RETRY_S} s.`,
        BUSY_RETRY_S,
      );
    }
  };
  const check = async () => {
    await assertRoom(ctx.config, ctx.now());
    busy();
  };

  return {
    check,
    async run(work) {
      await assertRoom(ctx.config, ctx.now());
      // The slot is taken before anything waits, so two callers can't both take the last one.
      busy();
      running++;
      const stop = new AbortController();
      const { freshMaxS } = limitsOf(ctx.config);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          stop.abort();
          reject(
            new ToolFailure(
              'source_failed',
              `This fresh read took longer than ${freshMaxS} s, so it was stopped.`,
              'Try again later, or use what is already stored.',
            ),
          );
        }, freshMaxS * 1000);
      });
      try {
        return await Promise.race([withRunSignal(stop.signal, work), late]);
      } finally {
        clearTimeout(timer);
        running--;
      }
    },
  };
}
