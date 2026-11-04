// Conventions (data-model.md, Convention). default/v1 is the sketch's defaults. Meanings say "the
// measure"; buildSpec puts the measure's label there (e.g. "stake in the current epoch").
import type { Convention, ProposeChoices } from '../types/index.ts';

/** default/v1: width = share in a 2x band, height = sqrt share, colour = kind, outline = identity
 * status, segments none unless the population declares a default, order = largest first,
 * clockwise from the top, 60 petals plus a grouped tail. Meanings here are the fallback; a
 * module descriptor's `capabilities.meanings` take precedence. */
export const DEFAULT_CONVENTION: Convention = {
  id: 'default/v1',
  petals: 60,
  tail: { group: true, label: 'everyone else' },
  encodings: {
    width: {
      by: 'share',
      scale: 'log',
      max_ratio: 2,
      meaning: 'share of the measure, in a 2x band',
    },
    height: { by: 'share', scale: 'sqrt', meaning: 'square root of share of the measure' },
    colour: { by: 'kind', meaning: 'kind of account' },
    outline: {
      by: 'identity_status',
      meaning: 'identity: solid when self-declared or verified, dashed when inferred',
    },
    segments: null,
    lines: null,
    markings: null,
    order: { by: 'measure_desc', meaning: 'largest first, clockwise from the top' },
  },
};

/** The choice names default/v1 makes for each field propose_spec accepts. */
export const DEFAULT_CHOICES: Required<Omit<ProposeChoices, 'measure'>> = {
  petals: DEFAULT_CONVENTION.petals,
  width: 'r2',
  height: 'sqrt',
  colour: 'kind',
  outline: 'identity_status',
  segments: 'none',
  lines: 'none',
  markings: 'none',
  order: 'measure_desc',
};

/** Standard meanings for every choice this build can draw. "the measure" is replaced. */
export const STANDARD_MEANINGS: Record<string, string> = {
  'width:r1.5': 'share of the measure, in a 1.5x band',
  'width:r2': DEFAULT_CONVENTION.encodings.width.meaning,
  'width:r3': 'share of the measure, in a 3x band',
  'width:equal': 'every side the same length',
  'height:sqrt': DEFAULT_CONVENTION.encodings.height.meaning,
  'height:linear': 'share of the measure',
  'height:log': 'the measure, on a log scale from the smallest petal to the largest',
  'height:equal': 'every bar the same height',
  'height:m:': 'the metric, relative to the largest petal',
  'colour:kind': DEFAULT_CONVENTION.encodings.colour.meaning,
  'colour:identity': 'named (a source names the account) or anonymous',
  'colour:single': 'one colour for every petal',
  'outline:identity_status': DEFAULT_CONVENTION.encodings.outline?.meaning ?? '',
  'segments:backers':
    'who backs the pool, bottom to top: other delegators, accounts with 1M+ NEAR, liquid-staking contracts, lockups',
  'order:measure_desc': DEFAULT_CONVENTION.encodings.order.meaning,
};
