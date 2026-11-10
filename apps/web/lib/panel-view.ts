// The flower panel as a person reads it: which state it is in and every word it says. The panel's
// flower is the same shape whichever way it came, from a turn of the thread or from the stored ones.
import type {
  Interpretation,
  LegendItem,
  ModelSignature,
  PetalDetail,
  Spec,
} from '@petal/core/types';
import type { DrawnReading } from './agent-client.ts';
import { aboutLine } from './ask-about.ts';
import {
  chainLabel,
  dateLabel,
  type LegendKey,
  networkLabel,
  type PetalView,
  petalView,
  type ReadingKeyView,
  readingKey,
  svgTitle,
} from './flower-view.ts';
import { type MapViewRow, viewTile } from './map-views.ts';
import type { ChatAction, Opened } from './thread.ts';
import type { ComposerTarget } from './thread-view.ts';

/** A flower ready for the panel, wherever it came from. */
export interface PanelFlower {
  /** names this flower: a new key is a new scene on the canvas */
  key: string;
  spec: Spec;
  legend: LegendItem[];
  /** null: another agent drew it, and nothing here has its reading */
  interpretation: Interpretation | null;
  signature: ModelSignature | null;
  model?: string;
  checks: string;
  viewUrl: string;
  publishUrl?: string;
  /** set when it came from the stored ones, not from this thread */
  stored?: { id: string; title: string | null };
  /** an earlier flower, not the one the thread is on: a question has to say which it means */
  earlier: boolean;
}

export interface Drawing {
  svg?: string;
  petals?: PetalDetail[];
  legend?: LegendItem[];
  reading?: DrawnReading;
  failed?: string;
}

/** The flower a live canvas holds: the key says when it's really another flower. */
export interface CanvasFlower {
  key: string;
  reading: DrawnReading;
  /** Its id, where it's a stored flower: what opens it, once someone chooses it. */
  stored?: string;
}

/** What a click on the canvas landed on. Every petal is by its id: an order can change, an id can't. */
export type CanvasHit = { kind: 'petal'; id: string } | { kind: 'centre' } | { kind: 'ground' };

/**
 * What the canvas holds next: the open flower once its reading is in hand, and otherwise what it already
 * held, so nothing flickers between flowers. A new object only when the flower really changes: a live
 * bench rebuilds its scene on a new reading, and that would throw away where the camera is.
 */
export function nextCanvas(
  held: CanvasFlower | null,
  key: string | null | undefined,
  reading: DrawnReading | undefined,
  stored?: string,
): CanvasFlower | null {
  if (!key || !reading || held?.key === key) return held;
  return { key, reading, ...(stored ? { stored } : {}) };
}

/** A view of the one map, as the gallery draws it (viewTile), opening where it lives. */
export interface Tile {
  key: string;
  title: string;
  where: string;
  badge: string;
  image: string;
  href: string;
}

export interface ShelfView {
  kind: 'shelf';
  /** the first flower is on its way, so this holds its place more than it offers anything */
  pending: boolean;
  heading: string;
  note: string;
  tiles: Tile[];
  /** a question the person can start from */
  starter?: { label: string; question: string };
}

export interface FlowerPanelView {
  kind: 'flower';
  key: string;
  title: string;
  where: string;
  date: string;
  svg: string | null;
  failed: string | null;
  keys: LegendKey[];
  legend: LegendItem[];
  /** Where the rows that aren't true of the canvas got their facts. */
  legendSources: string[];
  reading: ReadingKeyView;
  petal: PetalView | null;
  interpretation: Interpretation | null;
  signature: ModelSignature | null;
  model?: string;
  checks: string;
  hashes: string;
  sources: Record<string, string>;
  viewUrl: string;
  publishUrl?: string;
  /** a stored flower that can be funded for a fresh read */
  network: string;
}

export type PanelView =
  | { kind: 'loading'; text: string }
  | { kind: 'failed'; text: string }
  | ShelfView
  | FlowerPanelView;

const STARTER = 'Who holds the UNI token on Base?';

/**
 * The live canvas paints each petal by its colour from the reading, as the still picture does (the one look,
 * specs/006-the-map), and draws no outline, line or marking. So of what a render says about its drawing,
 * these aren't true of it. Their sources still stand.
 */
const NOT_ON_CANVAS = new Set<string>(['outline', 'lines', 'markings']);

/**
 * The rows whose swatches are the canvas's own paint (render/wedge/paint.ts): a petal's colour, and the
 * tail's tone. The canvas bands a petal's segments in one tone, so their swatches would say what isn't there.
 */
const PAINTED = new Set<string>(['colour', 'tail']);

/**
 * What a flower says about itself, for what's on the canvas: no row about what it doesn't draw, a swatch
 * only for a colour it paints, and no hatching. The sources only those rows named are kept, on their own.
 */
export function canvasReading(
  items: LegendItem[],
  reading: Interpretation | null,
): { legend: LegendItem[]; interpretation: Interpretation | null; sources: string[] } {
  const drawn = (x: { primitive: string }) => !NOT_ON_CANVAS.has(x.primitive);
  const legend = items.filter(drawn).map(({ keys, ...item }) => ({
    ...item,
    ...(keys && PAINTED.has(item.primitive) ? { keys } : {}),
    meaning: item.meaning.replace('one hatched petal', 'one petal'),
  }));
  const mappings = reading?.mappings.filter(drawn) ?? [];
  const still = new Set([...legend, ...mappings].flatMap((x) => x.sources));
  const gone = [...items, ...(reading?.mappings ?? [])].filter((x) => !drawn(x));
  return {
    legend,
    // Nothing draws on it being non-empty: that's a rule for what an agent must write.
    interpretation: reading && { ...reading, mappings: mappings as Interpretation['mappings'] },
    sources: [...new Set(gone.flatMap((x) => x.sources))].filter((id) => !still.has(id)),
  };
}

/** One petal's record, saying only why it looks this way on the canvas. */
export const canvasPetal = (petal: PetalDetail): PetalDetail => ({
  ...petal,
  values: petal.values
    .filter((v) => !NOT_ON_CANVAS.has(v.primitive))
    // The tail is one petal in a tone, not render/v1's hatching.
    .map((v) => ({ ...v, explains: v.explains.replace(/^hatched: /, '') })),
});

/** The only colour the canvas gives a meaning to, and only once there's something picked. */
const canvasKeys = (selected: boolean): LegendKey[] =>
  selected ? [{ label: 'Selected', swatch: 'selected' }] : [];

export function shelfView(
  listed: readonly MapViewRow[],
  working: boolean,
  /** a recorded run has its one question, so there's nothing to start from */
  recorded = false,
): ShelfView {
  return {
    kind: 'shelf',
    pending: working,
    heading: working ? 'Flower' : 'What would you like to map?',
    note: working
      ? 'Your flower will appear here.'
      : listed.length > 0
        ? 'Your flower will appear here. Or open one that’s already mapped.'
        : 'Your flower will appear here.',
    tiles: listed.map((v) => ({ key: v.sha, ...viewTile(v) })),
    ...(working || recorded ? {} : { starter: { label: `Try “${STARTER}”`, question: STARTER } }),
  };
}

export function flowerPanelView(v: {
  flower: PanelFlower;
  drawing: Drawing | undefined;
  selected: string | null;
  sources: Record<string, string>;
  units: Record<string, string>;
}): FlowerPanelView {
  const { flower, drawing, selected, sources, units } = v;
  const { spec } = flower;
  const found = drawing?.petals?.find((p) => p.id === selected);
  const petal = found ? canvasPetal(found) : null;
  const {
    legend,
    interpretation,
    sources: legendSources,
  } = canvasReading(drawing?.legend ?? flower.legend, flower.interpretation);
  return {
    kind: 'flower',
    key: flower.key,
    title: (drawing?.svg && svgTitle(drawing.svg)) || networkLabel(spec.network.id),
    where: chainLabel(spec.network.chain),
    date: dateLabel(spec.snapshot.as_of),
    svg: drawing?.svg ?? null,
    failed: drawing?.failed ?? null,
    keys: canvasKeys(petal !== null),
    legend,
    legendSources,
    reading: readingKey(spec),
    petal: petal && petalView(petal, units[spec.selection.measure]),
    interpretation,
    signature: flower.signature,
    ...(flower.model ? { model: flower.model } : {}),
    checks: flower.checks,
    hashes: flower.key,
    sources,
    viewUrl: flower.viewUrl,
    ...(flower.publishUrl ? { publishUrl: flower.publishUrl } : {}),
    network: spec.network.id,
  };
}

/**
 * What has to open for the flower on the canvas to be the panel's, or null if it already is: a stored
 * flower not opened yet, or one the shelf stepped away from.
 */
function openingFor(
  shown: CanvasFlower | null,
  panelKey: string | undefined,
  turnKeys: string[],
): Opened | null {
  if (!shown || shown.key === panelKey) return null;
  const at = turnKeys.lastIndexOf(shown.key);
  if (at !== -1)
    return at === turnKeys.length - 1 ? { kind: 'latest' } : { kind: 'turn', index: at };
  return shown.stored ? { kind: 'stored', id: shown.stored } : null;
}

/**
 * What a click on the canvas asks for: what the chat should do, in order, and whether the box opens. The
 * ground only lets go of a petal. A petal or the centre means someone chose this flower, so it's opened
 * first, and only then, because opening adds to the thread and changes what the next question is about.
 */
export function pickPlan(
  hit: CanvasHit,
  shown: CanvasFlower | null,
  panelKey: string | undefined,
  turnKeys: string[],
): { actions: ChatAction[]; opensBox: boolean } {
  const select = (petal: string | null): ChatAction => ({ type: 'select', petal });
  if (hit.kind === 'ground') return { actions: [select(null)], opensBox: false };
  const open = openingFor(shown, panelKey, turnKeys);
  return {
    actions: [
      ...(open ? [{ type: 'open', open } as const] : []),
      select(hit.kind === 'petal' ? hit.id : null),
    ],
    opensBox: true,
  };
}

/** Whether the address asks for the box. A run alone only brings its flower back to the canvas. */
export const addressOpensBox = (open: Opened | undefined, petal: string | null | undefined) =>
  open?.kind === 'stored' || open?.kind === 'shelf' || Boolean(petal);

/** A flower that couldn't be drawn or read, as something that can happen once. It's never silent. */
export function panelFailure(view: PanelView): string | null {
  if (view.kind === 'failed') return view.text;
  return view.kind === 'flower' && view.failed ? `${view.key} ${view.failed}` : null;
}

/** What the next question is about, from what the panel holds. */
export function composerTarget(
  flower: PanelFlower | null,
  petal: PetalDetail | null,
): ComposerTarget {
  if (!flower) return { kind: 'none' };
  const network = flower.spec.network.id;
  const asOf = flower.spec.snapshot.as_of;
  if (petal) {
    return petal.id === '__tail'
      ? {
          kind: 'group',
          line: aboutLine({
            kind: 'group',
            label: petal.label,
            ...(petal.count === undefined ? {} : { count: petal.count }),
            network,
            asOf,
          }),
        }
      : { kind: 'wallet', line: aboutLine({ kind: 'account', id: petal.id, network, asOf }) };
  }
  return { kind: 'flower' };
}

/** The prefix for the next question: a selected petal, or a flower the thread isn't on. */
export function questionPrefix(
  flower: PanelFlower | null,
  target: ComposerTarget,
): string | undefined {
  if (target.kind === 'wallet' || target.kind === 'group') return target.line;
  if (!flower || (!flower.stored && !flower.earlier)) return undefined;
  return aboutLine({
    kind: 'flower',
    id: flower.stored?.id ?? flower.key,
    title: flower.stored?.title ?? networkLabel(flower.spec.network.id),
    network: flower.spec.network.id,
    asOf: flower.spec.snapshot.as_of,
  });
}
