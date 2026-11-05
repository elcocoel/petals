// Colours are CSS custom properties defined in the SVG's own <style>: a light set, and a dark set
// the host page picks with a `.petal-dark` class (on the svg or an ancestor), so both themes share
// the same bytes (renderer.md). Selectors are scoped to svg[data-petal] because an inline SVG's
// <style> applies to the whole page. Values are the spike's (research/spikes/flower).
import { BACKER_ORDER, type BackerClass } from '../segments/backers.ts';
import type { Kind } from '../types/index.ts';

/** Fill class and legend swatch per kind of account. */
export const KIND_STYLE: Record<Kind, { cls: string; swatch: string }> = {
  mining_pool: { cls: 'c-pool', swatch: 'var(--k-pool)' },
  staking_pool: { cls: 'c-pool', swatch: 'var(--k-pool)' },
  validator: { cls: 'c-pool', swatch: 'var(--k-pool)' },
  exchange: { cls: 'c-exchange', swatch: 'var(--k-exchange)' },
  custodian: { cls: 'c-custodian', swatch: 'var(--k-custodian)' },
  staking_entity: { cls: 'c-entity', swatch: 'var(--k-entity)' },
  contract: { cls: 'c-contract', swatch: 'var(--k-contract)' },
  treasury: { cls: 'c-treasury', swatch: 'var(--k-treasury)' },
  organisation: { cls: 'c-org', swatch: 'var(--k-org)' },
  person: { cls: 'c-org', swatch: 'var(--k-org)' },
  delegator: { cls: 'c-delegator', swatch: 'var(--k-delegator)' },
  group: { cls: 'c-unknown', swatch: 'var(--unknown)' },
  unknown: { cls: 'c-unknown', swatch: 'var(--unknown)' },
};

export const IDENTITY_STYLE = {
  named: { cls: 'c-pool', swatch: 'var(--k-pool)' },
  anonymous: { cls: 'c-unknown', swatch: 'var(--unknown)' },
};
export const SINGLE_STYLE = { cls: 'c-pool', swatch: 'var(--k-pool)' };

export const SEGMENT_STYLE: Record<BackerClass, { cls: string; swatch: string }> = {
  other: { cls: 'c-seg-other', swatch: 'var(--k-pool)' },
  large: { cls: 'c-seg-large', swatch: 'var(--k-org)' },
  liquid: { cls: 'c-seg-liquid', swatch: 'var(--k-entity)' },
  lockup: { cls: 'c-seg-lockup', swatch: 'var(--k-contract)' },
};

export const TAIL_SWATCH = 'var(--tail)';

/** The look of a colour key from the reading. */
export function colourStyle(key: string): { cls: string; swatch: string } {
  if (key === 'single') return SINGLE_STYLE;
  if (key === 'named') return IDENTITY_STYLE.named;
  if (key === 'anonymous') return IDENTITY_STYLE.anonymous;
  return KIND_STYLE[key as Kind] ?? KIND_STYLE.unknown;
}

/** The look of an outline key from the reading. */
export const OUTLINE = { asserted: 'solid', inferred: 'dashed' } as const;

const LIGHT =
  '--ink:#0b0b0b;--ink-2:#52514e;--hair:#e1e0d9;--unknown:#c9c7bf;--tail:#b8b6ae;' +
  '--k-pool:#2a78d6;--k-exchange:#eb6834;--k-entity:#1baf7a;--k-custodian:#eda100;' +
  '--k-contract:#e87ba4;--k-treasury:#008300;--k-org:#4a3aa7;--k-delegator:#e34948';
const DARK =
  '--ink:#ffffff;--ink-2:#c3c2b7;--hair:#2c2c2a;--unknown:#4a4945;--tail:#5e5d58;' +
  '--k-pool:#3987e5;--k-exchange:#d95926;--k-entity:#199e70;--k-custodian:#c98500;' +
  '--k-contract:#d55181;--k-treasury:#008300;--k-org:#9085e9;--k-delegator:#e66767';

const S = 'svg[data-petal]';
const fills = [
  ...new Map(
    [
      ...Object.values(KIND_STYLE),
      ...BACKER_ORDER.map((k) => SEGMENT_STYLE[k]),
      IDENTITY_STYLE.named,
      IDENTITY_STYLE.anonymous,
    ].map((x) => [x.cls, x.swatch]),
  ),
].map(([cls, swatch]) => `${S} .${cls}{fill:${swatch}}`);

/** The embedded stylesheet: fixed bytes, the same for every flower. */
export const STYLE = [
  `${S}{${LIGHT}}`,
  `.petal-dark ${S},${S}.petal-dark{${DARK}}`,
  `${S} .petal-poly{fill:none;stroke:var(--hair)}`,
  ...fills,
  `${S} .petal-outline{fill:none;stroke:var(--ink-2);stroke-width:0.8px;pointer-events:none}`,
  `${S} .petal-outline.inferred{stroke-dasharray:3 2}`,
  `${S} .hatch-bg{fill:var(--unknown)}`,
  `${S} .hatch-line{stroke:var(--tail);stroke-width:2.2px}`,
  `${S} text{fill:var(--ink-2);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:11px}`,
  `${S} .petal-centre{fill:var(--ink);font-size:12px;font-weight:600}`,
].join('');
