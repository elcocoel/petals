// Drafts waiting for a maker's signature, and the nonces they carry, in the private store (T049,
// T189), and spec bodies under their hash, for short links (SYS-043). Local state, never committed
// and never on the map. Nothing opens the store until a tool needs it, so making a context still
// touches no disk.

import { resolve } from 'node:path';
import { canonicalJson, sha256Hex } from '@petal/core';
import type { Spec } from '@petal/core/types';
import { durableNonceStore, type NonceStore } from '@petal/near/auth';
import { type Store, stateStore } from '@petal/store';
import { ToolFailure } from './errors.ts';
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

/** A spec this large gets no short link; its long one still works. */
const MAX_SPEC_BYTES = 64 * 1024;

/** Puts a spec's body in once under its hash, and returns the hash. Null when it's too large. */
export function keepSpecBody(store: Store, spec: unknown, at: string): string | null {
  const body = canonicalJson(spec);
  if (Buffer.byteLength(body, 'utf8') > MAX_SPEC_BYTES) return null;
  const sha256 = sha256Hex(body);
  store.draft.put({ sha256, body, created_at: at });
  return sha256;
}

/**
 * keepSpecBody for a public tool, which goes on without it: a store that won't last would give a short
 * link that stops working, and a store that fails must not break a public tool.
 */
export function putSpecBody(
  cfg: { root: string; stateDir?: string },
  spec: unknown,
  at: string,
): string | null {
  try {
    const store = privateStore(cfg);
    return store.durable ? keepSpecBody(store, spec, at) : null;
  } catch {
    return null;
  }
}

/** The spec stored under this hash, or null. Hashed again on the way out, so a changed row can't pass. */
export function specBody(cfg: { root: string; stateDir?: string }, sha256: string): Spec | null {
  const row = privateStore(cfg).draft.get(sha256);
  if (!row) return null;
  if (sha256Hex(row.body) !== sha256) {
    throw new ToolFailure('internal', 'The stored spec does not match its hash.');
  }
  return JSON.parse(row.body) as Spec;
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
