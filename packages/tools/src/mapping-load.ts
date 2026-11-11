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
  log?: (line: string) => void;
}

export interface LoadReport {
  files: number;
  /** files that aren't one of Petals' formats: raw receipts and manifests, left as evidence */
  evidence: number;
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
  const report: LoadReport = { files: 0, evidence: 0, refused: [], formats: {}, drawn: 0 };
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
