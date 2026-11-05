// What changed between two specs, in the words of a person reading them: the subject (network), the
// data (snapshot, labels) and the design (the recipe). An encoding is read as the choice it came
// from, so a new measure is one change, though it rewrites the meaning and sources of several
// encodings. convention.changes is ignored: it records differences from the defaults, not the parent.
import { canonicalJson } from '../hash.ts';
import type { DiffChange, Encoding, Spec, SpecDiff } from '../types/index.ts';
import { choicesFromSpec } from './recipe.ts';

const CHOICES = ['measure', 'petals', 'width', 'height', 'colour', 'outline', 'segments', 'order'];
const same = (a: unknown, b: unknown) => canonicalJson(a ?? null) === canonicalJson(b ?? null);

function subjectOf(a: Spec, b: Spec): DiffChange[] {
  if (same(a.network, b.network)) return [];
  // one module on two targets (two tokens, say) differs in its population, not its id
  const name = (s: Spec) => (a.network.id === b.network.id ? s.network.population : s.network.id);
  return [{ what: 'network', from: name(a), to: name(b), says: 'another subject' }];
}

function dataOf(a: Spec, b: Spec): DiffChange[] {
  const out: DiffChange[] = [];
  if (a.snapshot.sha256 !== b.snapshot.sha256)
    out.push({
      what: 'snapshot',
      from: a.snapshot.as_of,
      to: b.snapshot.as_of,
      says:
        a.snapshot.as_of < b.snapshot.as_of
          ? 'newer data'
          : a.snapshot.as_of > b.snapshot.as_of
            ? 'older data'
            : 'other data',
    });
  if (!same(a.labels, b.labels))
    out.push({ what: 'labels', from: a.labels, to: b.labels, says: 'other labels' });
  return out;
}

function designOf(a: Spec, b: Spec): DiffChange[] {
  const ca = choicesFromSpec(a) as Record<string, unknown>;
  const cb = choicesFromSpec(b) as Record<string, unknown>;
  const encodingOf = (s: Spec, k: string) =>
    (s.encodings as Record<string, Encoding | null | undefined>)[k];
  const out: DiffChange[] = [];
  for (const k of CHOICES) {
    const after = encodingOf(b, k);
    if (ca[k] !== cb[k]) {
      out.push({
        what: k,
        from: ca[k],
        to: cb[k],
        says: after?.meaning ?? (k === 'measure' || k === 'petals' ? `${k} ${cb[k]}` : `no ${k}`),
      });
    } else if (ca.measure === cb.measure && a.network.id === b.network.id) {
      // the same choice in other words: an override of its meaning
      const before = encodingOf(a, k);
      if (before && after && before.meaning !== after.meaning)
        out.push({ what: k, from: before.meaning, to: after.meaning, says: after.meaning });
    }
  }
  if (!same(a.selection.tail, b.selection.tail))
    out.push({ what: 'tail', from: a.selection.tail, to: b.selection.tail, says: 'another tail' });
  return out;
}

export function diffSpecs(a: Spec, b: Spec): SpecDiff {
  const subject = subjectOf(a, b);
  const data = dataOf(a, b);
  const design = designOf(a, b);
  const same_recipe = design.length === 0;
  const parts = [
    ...subject.map((c) => `${c.says} (${c.from} to ${c.to})`),
    ...data.map((c) => c.says),
    ...design.map((c) => `${c.what}: ${String(c.from)} to ${String(c.to)}`),
  ];
  const says = parts.length
    ? `${same_recipe ? 'same recipe, ' : ''}${parts.join('; ')}`
    : 'the same flower';
  return { same_recipe, subject, data, design, says };
}
