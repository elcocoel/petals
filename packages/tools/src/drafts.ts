// Drafts waiting for a maker's signature, and the nonces they carry, in the private store (T049,
// T189). Local state, never committed and never on the map. Nothing opens the store until a tool
// needs it, so making a context still touches no disk.

import { resolve } from 'node:path';
import { durableNonceStore, type NonceStore } from '@petal/near/auth';
import { type Store, stateStore } from '@petal/store';
import type { DraftEntry } from './verify.ts';

export interface StoredDraft {
  entry_sha256: string;
  entry: DraftEntry;
  nonce: string;
  expires_at: string;
  recipient: string;
  message: string;
  created_at: string;
  /** set once a publish has verified the proof; a draft publishes once */
  used_at?: string;
}

export function stateDirOf(cfg: { root: string; stateDir?: string }): string {
  return resolve(cfg.root, cfg.stateDir ?? '.petal');
}

/** <stateDir>/private.db: the one store for this state folder, in this process. */
export function privateStore(cfg: { root: string; stateDir?: string }): Store {
  return stateStore(stateDirOf(cfg));
}

/** Single-use nonces that survive a restart and hold across processes. */
export function nonceStore(cfg: { root: string; stateDir?: string }): NonceStore {
  return durableNonceStore(privateStore(cfg).challenge);
}

export function draftStore(cfg: { root: string; stateDir?: string }) {
  return {
    async get(sha: string): Promise<StoredDraft | null> {
      const row = privateStore(cfg).publishDraft.get(sha);
      if (!row) return null;
      const draft = JSON.parse(row.body) as StoredDraft;
      return row.used_at ? { ...draft, used_at: row.used_at } : draft;
    },
    /** A new prepare for the same entry replaces the old draft: it carries a new nonce. */
    async put(d: StoredDraft): Promise<void> {
      privateStore(cfg).publishDraft.put(d.entry_sha256, JSON.stringify(d));
    },
    /** Marks it used. True for exactly one caller, however many arrive together. */
    async claim(sha: string, at: string): Promise<boolean> {
      return privateStore(cfg).publishDraft.claim(sha, at);
    },
  };
}
