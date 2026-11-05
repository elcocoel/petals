// The flower panel as a person reads it: which state it is in and every word it says. The panel's
// flower is the same shape whichever way it came, from a turn of the thread or from the stored ones.
import type {
  Interpretation,
  LegendItem,
  ModelSignature,
  PetalDetail,
  Spec,
} from '@petal/core/types';
import { aboutLine } from './ask-about.ts';
import {
  chainLabel,
  dateLabel,
  type LegendKey,
  type ListedFlower,
  legendKeys,
  networkLabel,
  type PetalView,
  petalView,
  type ReadingKeyView,
  readingKey,
  svgTitle,
} from './flower-view.ts';
import type { ComposerTarget } from './thread-view.ts';

/** A flower ready for the panel, wherever it came from. */
export interface PanelFlower {
  /** names this flower for the stage: a new key is a new fit */
  key: string;
  spec: Spec;
  legend: LegendItem[];
  interpretation: Interpretation;
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
  failed?: string;
}

export interface Tile {
  id: string;
  title: string;
  where: string;
  badge: string;
  image: string;
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
  reading: ReadingKeyView;
  petal: PetalView | null;
  selected: string | null;
  interpretation: Interpretation;
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

export function shelfView(
  listed: ListedFlower[],
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
    tiles: listed.map((f) => ({
      id: f.id,
      title: f.title ?? f.id,
      where: `${networkLabel(f.network)}   /   ${dateLabel(f.as_of)}`,
      badge: f.where === 'map' ? 'On NEAR' : 'Fixture',
      image: `/api/v1/flowers/${encodeURIComponent(f.id)}/svg`,
    })),
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
  const petal = drawing?.petals?.find((p) => p.id === selected) ?? null;
  const legend = drawing?.legend ?? flower.legend;
  return {
    kind: 'flower',
    key: flower.key,
    title: (drawing?.svg && svgTitle(drawing.svg)) || networkLabel(spec.network.id),
    where: chainLabel(spec.network.chain),
    date: dateLabel(spec.snapshot.as_of),
    svg: drawing?.svg ?? null,
    failed: drawing?.failed ?? null,
    keys: legendKeys(legend, petal !== null),
    legend,
    reading: readingKey(spec),
    petal: petal && petalView(petal, units[spec.selection.measure]),
    selected: petal?.id ?? null,
    interpretation: flower.interpretation,
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
