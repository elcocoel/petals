// What a page following an exploration listens to, in this process: a listener per exploration, called
// when an agent touches it. No timers: nothing happens unless something did. The name, last activity and
// last tool live only here (T404), so they're gone after a restart and on another process.
import { MAX_TRACKED_KEYS } from './http/rate-limit.ts';

export interface Presence {
  client: string | null;
  last_at: string;
  last_tool: string | null;
  /** additive: which of that agent's workers, by place (1, 2, …), when known */
  n?: number | null;
}

export class LiveHub {
  private listeners = new Map<string, Set<() => void>>();
  private presence = new Map<string, Presence>();

  /** Calls `fn` on each change to this exploration, until the function it returns is called. */
  on(id: string, fn: () => void): () => void {
    const set = this.listeners.get(id) ?? new Set();
    set.add(fn);
    this.listeners.set(id, set);
    return () => {
      set.delete(fn);
      if (set.size === 0 && this.listeners.get(id) === set) this.listeners.delete(id);
    };
  }

  changed(id: string): void {
    for (const fn of this.listeners.get(id) ?? []) fn();
  }

  /** A call that names no client keeps the name it had, and its worker's place. */
  touch(id: string, p: Presence): void {
    const was = this.presence.get(id);
    const client = p.client ?? was?.client ?? null;
    const n = p.n ?? (p.client ? null : (was?.n ?? null));
    this.presence.delete(id);
    this.presence.set(id, { ...p, client, ...(n ? { n } : {}) });
    if (this.presence.size > MAX_TRACKED_KEYS) {
      this.presence.delete(this.presence.keys().next().value as string);
    }
    this.changed(id);
  }

  presenceOf(id: string): Presence | null {
    return this.presence.get(id) ?? null;
  }

  /** How many are listening, for a test to see a closed tab let go. */
  listening(id: string): number {
    return this.listeners.get(id)?.size ?? 0;
  }
}
