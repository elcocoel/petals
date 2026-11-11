// The mapping waves' files, onto the shared map (board #96; Elco, 11 Nov: "let's map it ourselves using the brain
// but at super speed", not through the site's saves): every file in a folder that is one of Petals' formats is
// checked against its own schema and rules, and a bad one is refused with its reasons, nothing of it kept. A good
// reading is kept by its hash and drawn as its reader's default flower, credited to Petals' own mapping; a good
// mark, value or proposals is kept by its map's address, unless one is already kept there (--replace puts the
// wave's in its place). Claims are checked and held: there's no public place for claims yet (annotation step 8).
// Hidden maps (#96) stay hidden: the hides are by address, whoever loads them. scripts/load-mapping.ts runs it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  canonicalJson,
  sha256Hex,
  validateClaim,
  validateMark,
  validateProposals,
  validateSnapshot,
  validateValue,
} from '@petal/core';
import type { Snapshot, Spec } from '@petal/core/types';
import { privateStore } from './drafts.ts';
import { callTool } from './registry.ts';
import type { ToolContext } from './types.ts';

export interface LoadRun {
  /** check and say, keep nothing */
  dry?: boolean;
  /** put a wave's mark, value or proposals in place of one already kept */
  replace?: boolean;
  /** who the drawings are credited to */
  by: string;
  /** a wave's manifest outside the folder (L2-IMPORT-MANIFEST.json) */
  manifests?: string[];
  log?: (line: string) => void;
}

export interface LoadReport {
  files: number;
  /** files that aren't one of Petals' formats: raw receipts and manifests, left as evidence */
  evidence: number;
  /** Petals documents a wave's manifest marks evidence only (load: false): checked, not loaded */
  held: number;
  refused: { file: string; why: string[] }[];
  /** per format: how many were good, kept, and left because one is already kept */
  formats: Record<string, { good: number; kept: number; left: number }>;
  drawn: number;
}

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (name.endsWith('.json')) yield p;
  }
}

const formatOf = (petal: string) => petal.split('/')[0] as string;

interface Listed {
  load: boolean;
  sha256: string | null;
}

/**
 * The waves' manifests: every *IMPORT-MANIFEST.json under the folder, and any given with --manifest. Four shapes,
 * each path from the manifest's own folder: objects [{ path, load, canonical_sha256 }] (GNOSIS WAVE's); daos
 * [{ artifacts [{ file, canonical_sha256 }] }] (the L2 wave's); artifacts [{ file, role, canonical_json_sha256 }],
 * loading its 'load-candidate's (Solana's); records [{ path, status, sha256 }], loading its 'importable…' ones
 * (Ethereum's phase2-ethereum-manifest.json, whose sha256 is the canonical one). A listed file loads when the manifest says so and
 * has the canonical sha256 it gives; within a manifest's folder, a Petals document it doesn't list is held, since
 * only its listed artifacts are inputs.
 */
function manifestsIn(root: string, extra: readonly string[]) {
  const entries = new Map<string, Listed>();
  const scopes: string[] = [];
  const read = (p: string) => {
    let m: {
      objects?: { path?: string; load?: boolean; canonical_sha256?: string }[];
      daos?: { artifacts?: { file?: string; canonical_sha256?: string }[] }[];
      artifacts?: { file?: string; role?: string; canonical_json_sha256?: string }[];
      records?: { path?: string; status?: string; sha256?: string }[];
    };
    try {
      m = JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      return;
    }
    const dir = dirname(p);
    const add = (rel: string | undefined, load: boolean, sha: string | undefined) => {
      if (typeof rel === 'string') entries.set(join(dir, rel), { load, sha256: sha ?? null });
    };
    for (const o of m.objects ?? []) add(o.path, o.load === true, o.canonical_sha256);
    for (const d of m.daos ?? [])
      for (const a of d.artifacts ?? []) add(a.file, true, a.canonical_sha256);
    for (const a of m.artifacts ?? [])
      add(a.file, a.role === 'load-candidate', a.canonical_json_sha256);
    for (const r of m.records ?? [])
      add(r.path, String(r.status).startsWith('importable'), r.sha256);
    if (m.objects || m.daos || m.artifacts || m.records) scopes.push(dir);
  };
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('IMPORT-MANIFEST.json')) read(p);
    }
  };
  walk(root);
  for (const p of extra) read(p);
  return { entries, scopes };
}

/** Check one document by its own format: the reasons it isn't one, or none. */
function problems(doc: Record<string, unknown>): string[] {
  const petal = String(doc.petal);
  const v =
    formatOf(petal) === 'snapshot'
      ? validateSnapshot(doc)
      : formatOf(petal) === 'proposals'
        ? validateProposals(doc)
        : formatOf(petal) === 'mark'
          ? validateMark(doc)
          : formatOf(petal) === 'value'
            ? validateValue(doc)
            : formatOf(petal) === 'claim'
              ? validateClaim(doc)
              : null;
  if (!v)
    return [`${petal} isn't a format the loader takes (snapshot, proposals, mark, value, claim)`];
  return v.ok ? [] : v.errors.slice(0, 5).map((e) => `${e.path || '/'} ${e.message}`);
}

export async function loadMapping(ctx: ToolContext, root: string, o: LoadRun): Promise<LoadReport> {
  const store = privateStore(ctx.config);
  const log = o.log ?? (() => {});
  const report: LoadReport = { files: 0, evidence: 0, held: 0, refused: [], formats: {}, drawn: 0 };
  const manifests = manifestsIn(root, o.manifests ?? []);
  const tally = (f: string) => {
    report.formats[f] ??= { good: 0, kept: 0, left: 0 };
    return report.formats[f];
  };
  const at = new Date().toISOString();
  // each folder's own name for its organisation, from its mark: what its drawing is called
  const names = new Map<string, string>();
  for (const path of files(root)) {
    report.files++;
    const file = relative(root, path);
    let doc: unknown;
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      report.refused.push({ file, why: [`not JSON: ${(e as Error).message}`] });
      continue;
    }
    const petal =
      doc && typeof doc === 'object' && !Array.isArray(doc)
        ? (doc as { petal?: unknown }).petal
        : undefined;
    if (typeof petal !== 'string') {
      report.evidence++;
      continue;
    }
    const d = doc as Record<string, unknown>;
    // a wave's manifest (IMPORT-MANIFEST.json) says which of its files load, and the hash each must have
    const listed = manifests.entries.get(path);
    if (!listed && manifests.scopes.some((dir) => path.startsWith(`${dir}/`))) {
      report.held++;
      continue;
    }
    if (listed && listed.sha256 && listed.sha256 !== sha256Hex(canonicalJson(d))) {
      report.refused.push({
        file,
        why: [
          `its canonical sha256 isn't the one its manifest gives (${listed.sha256.slice(0, 12)}…)`,
        ],
      });
      continue;
    }
    if (listed && !listed.load) {
      report.held++;
      continue;
    }
    const why = problems(d);
    if (why.length) {
      report.refused.push({ file, why });
      log(`refused ${file}: ${why.join('; ')}`);
      continue;
    }
    const format = formatOf(petal);
    const t = tally(format);
    t.good++;
    const named = (d.name as { value?: unknown } | null | undefined)?.value;
    if (format === 'mark' && typeof named === 'string') names.set(dirname(path), named);
    if (o.dry) continue;
    if (format === 'snapshot') {
      const s = d as unknown as Snapshot;
      const { sha256 } = await ctx.store.put(s);
      // its reader's default flower, so it's on the map; drawing the same reading again draws the same flower
      const proposed = (await callTool('propose_spec', { network: s.network.id, sha256 }, ctx)) as {
        spec?: Spec;
        error?: { message: string };
      };
      if (!proposed.spec) {
        report.refused.push({
          file,
          why: [`kept, but not drawn: ${proposed.error?.message ?? 'no spec'}`],
        });
        continue;
      }
      const drawn = (await callTool('render_flower', { spec: proposed.spec }, ctx)) as {
        spec_sha256?: string;
        error?: { message: string };
      };
      if (!drawn.spec_sha256) {
        report.refused.push({
          file,
          why: [`kept, but not drawn: ${drawn.error?.message ?? 'no flower'}`],
        });
        continue;
      }
      await store.draft.label(drawn.spec_sha256, {
        name: names.get(dirname(path)) ?? s.network.title ?? s.network.population,
        made_by: o.by,
      });
      t.kept++;
      report.drawn++;
      log(
        `drew ${file}: ${s.network.id}, ${s.participants.length} accounts, flower ${drawn.spec_sha256.slice(0, 12)}`,
      );
      continue;
    }
    if (format === 'claim') {
      // held: checked, and kept nowhere public yet
      continue;
    }
    const about = String(d.about);
    const table =
      format === 'mark' ? store.mark : format === 'value' ? store.value : store.proposals;
    const existing = await table.get(about);
    if (existing && !o.replace) {
      t.left++;
      continue;
    }
    await table.put({ about, body: JSON.stringify(d), read_at: String(d.read_at ?? at) });
    t.kept++;
    log(`kept ${file}: ${petal} for ${about}`);
  }
  return report;
}
