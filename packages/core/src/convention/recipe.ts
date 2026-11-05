// The recipe (recipe/v1): the reusable part of a flower, `{ choices, meanings }` with no target and
// no date. buildSpec compiles a recipe and a target into a spec; these read a spec back.
import { canonicalJson, sha256Hex } from '../hash.ts';
import type {
  Encoding,
  NetworkDescriptor,
  ProposeChoices,
  Recipe,
  Spec,
  SpecPrimitive,
} from '../types/index.ts';
import { RECIPE_VERSION } from '../versions.ts';
import { DEFAULT_CHOICES } from './default.ts';
import { choiceOf, standardMeaning } from './shape.ts';

const FIELDS = ['width', 'height', 'colour', 'outline', 'segments', 'order'] as const;

/** Every choice a spec made, spelled out, measure included. Needs no descriptor. */
export function choicesFromSpec(spec: Spec): ProposeChoices {
  const e = spec.encodings;
  return {
    measure: spec.selection.measure,
    petals: spec.selection.petals,
    width: choiceOf('width', e.width) as ProposeChoices['width'],
    height: choiceOf('height', e.height) as ProposeChoices['height'],
    colour: choiceOf('colour', e.colour) as ProposeChoices['colour'],
    outline: choiceOf('outline', e.outline) as ProposeChoices['outline'],
    segments: choiceOf('segments', e.segments) as ProposeChoices['segments'],
    order: choiceOf('order', e.order) as ProposeChoices['order'],
  };
}

/**
 * A spec's recipe: what it says beyond its network's defaults. The descriptor is needed because a
 * spec alone can't tell a default from a choice, or a standard meaning from an override. So the
 * same choices on two networks are one recipe, and their words stay out of it.
 */
export function recipeOf(spec: Spec, d: NetworkDescriptor): Recipe {
  const all = choicesFromSpec(spec) as Record<string, unknown>;
  const caps = d.capabilities;
  const base: Record<string, unknown> = {
    measure: caps.defaults.measure ?? caps.measures[0]?.id,
    petals: caps.defaults.petals ?? DEFAULT_CHOICES.petals,
  };
  for (const f of FIELDS) base[f] = caps.defaults[f] ?? DEFAULT_CHOICES[f];
  const choices = Object.fromEntries(Object.entries(all).filter(([k, v]) => v !== base[k]));

  const meanings: Partial<Record<SpecPrimitive, string>> = {};
  for (const f of FIELDS) {
    const e = spec.encodings[f] as Encoding | null;
    if (!e) continue;
    const standard = standardMeaning(d, f, String(all[f]), e.by, spec.selection.measure);
    if (e.meaning !== standard) meanings[f] = e.meaning;
  }
  return {
    petal: RECIPE_VERSION,
    choices: choices as ProposeChoices,
    ...(Object.keys(meanings).length ? { meanings } : {}),
  };
}

/** recipe_sha256: over the recipe alone, so the same recipe on two networks has the same hash. */
export function recipeHash(recipe: Recipe): string {
  return sha256Hex(canonicalJson(recipe));
}
