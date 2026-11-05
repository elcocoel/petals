// A choice and what it means, shared by buildSpec (choice to encoding) and the recipe (encoding back
// to choice). `shape` and `choiceOf` are inverses; test/recipe.test.ts walks every choice.
import type { Encoding, NetworkDescriptor, SpecPrimitive } from '../types/index.ts';
import { STANDARD_MEANINGS } from './default.ts';

type Shape = Omit<Encoding, 'meaning' | 'sources'>;

/** What a choice draws: the encoding minus meaning and sources. null = primitive unused. */
export function shape(field: SpecPrimitive, choice: string): Shape | null {
  switch (field) {
    case 'width':
      return choice === 'equal'
        ? { by: 'equal', scale: 'equal' }
        : { by: 'share', scale: 'log', max_ratio: Number(choice.slice(1)) };
    case 'height':
      if (choice === 'sqrt' || choice === 'linear') return { by: 'share', scale: choice };
      if (choice === 'log') return { by: 'amount', scale: 'log' };
      if (choice === 'equal') return { by: 'equal', scale: 'equal' };
      return { by: choice, scale: 'linear' }; // m:<metric>
    case 'outline':
    case 'segments':
    case 'lines':
    case 'markings':
      return choice === 'none' ? null : { by: choice };
    default:
      return { by: choice };
  }
}

/** The choice that draws an encoding: `shape` read backwards. */
export function choiceOf(field: SpecPrimitive, e: Shape | null | undefined): string {
  if (!e) return 'none';
  if (field === 'width') return e.by === 'equal' ? 'equal' : `r${e.max_ratio ?? 2}`;
  if (field === 'height') {
    if (e.by === 'share') return e.scale ?? 'sqrt';
    if (e.by === 'amount') return 'log';
  }
  return e.by;
}

export function measureLabel(d: NetworkDescriptor, measure: string): string {
  return (
    d.capabilities.measures.find((m) => m.id === measure)?.label ?? measure.replaceAll('_', ' ')
  );
}

/** The words a choice gets when nobody overrides them: the descriptor's, or the standard ones. */
export function standardMeaning(
  d: NetworkDescriptor,
  field: SpecPrimitive,
  choice: string,
  by: string,
  measure: string,
): string {
  const entry =
    d.capabilities.meanings[`${field}:${choice}`] ?? d.capabilities.meanings[`${field}:${by}`];
  if (entry) return entry.meaning;
  const metric = field === 'height' && choice.startsWith('m:') ? choice.slice(2) : null;
  const standard = STANDARD_MEANINGS[metric !== null ? 'height:m:' : `${field}:${choice}`] ?? '';
  return standard
    .replace('the measure', measureLabel(d, measure))
    .replace('the metric', metric !== null ? measureLabel(d, metric) : '');
}
