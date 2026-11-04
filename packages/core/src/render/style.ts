// Colours are CSS custom properties defined in the SVG's own <style>: a light set, and a dark set
// the host page picks with a `.petal-dark` class (on the svg or an ancestor), so both themes share
// the same bytes (renderer.md). Selectors are scoped to svg[data-petal] because an inline SVG's
// <style> applies to the whole page. Values are the spike's (research/spikes/flower).
import { BACKER_ORDER, type BackerClass } from '../segments/backers.ts';
import type { Kind } from '../types/index.ts';

/** Fill class and legend label per kind of account. */
export const KIND_STYLE: Record<Kind, { cls: string; swatch: string; label: string }> = {
  mining_pool: { cls: 'c-pool', swatch: 'var(--k-pool)', label: 'pool' },
  staking_pool: { cls: 'c-pool', swatch: 'var(--k-pool)', label: 'pool' },
  validator: { cls: 'c-pool', swatch: 'var(--k-pool)', label: 'pool' },
  exchange: { cls: 'c-exchange', swatch: 'var(--k-exchange)', label: 'exchange' },
  custodian: { cls: 'c-custodian', swatch: 'var(--k-custodian)', label: 'custodian' },
  staking_entity: { cls: 'c-entity', swatch: 'var(--k-entity)', label: 'liquid staking' },
  contract: { cls: 'c-contract', swatch: 'var(--k-contract)', label: 'contract' },
  treasury: { cls: 'c-treasury', swatch: 'var(--k-treasury)', label: 'treasury' },
  organisation: { cls: 'c-org', swatch: 'var(--k-org)', label: 'person or organisation' },
  person: { cls: 'c-org', swatch: 'var(--k-org)', label: 'person or organisation' },
  delegator: { cls: 'c-delegator', swatch: 'var(--k-delegator)', label: 'delegator' },
  group: { cls: 'c-unknown', swatch: 'var(--unknown)', label: 'group' },
  unknown: { cls: 'c-unknown', swatch: 'var(--unknown)', label: 'unknown' },
};

/** Legend order of kinds (first wins when two kinds share a label). */
export const KIND_ORDER: Kind[] = Object.keys(KIND_STYLE) as Kind[];

export const IDENTITY_STYLE = {
  named: { cls: 'c-pool', swatch: 'var(--k-pool)', label: 'named' },
  anonymous: { cls: 'c-unknown', swatch: 'var(--unknown)', label: 'anonymous' },
};
export const SINGLE_STYLE = { cls: 'c-pool', swatch: 'var(--k-pool)', label: 'every petal' };

export const SEGMENT_STYLE: Record<BackerClass, { cls: string; swatch: string }> = {
  other: { cls: 'c-seg-other', swatch: 'var(--k-pool)' },
  large: { cls: 'c-seg-large', swatch: 'var(--k-org)' },
  liquid: { cls: 'c-seg-liquid', swatch: 'var(--k-entity)' },
  lockup: { cls: 'c-seg-lockup', swatch: 'var(--k-contract)' },
};

export const TAIL_SWATCH = 'var(--tail)';

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
