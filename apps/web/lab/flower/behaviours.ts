// The bench's behaviours, as children of the system's own, in the shape packages/tokens/behaviours.ts
// is taking for v2: a name, a parent, a one-line purpose. Elco, 2026-11-05: "we don't create new visual
// behaviors right now but attach them to our subsets, so that as we create versions of that set we
// automatically evolve this." When the system's table lands, this folds into it.

export type BehaviourParent =
  | 'surface'
  | 'action'
  | 'link'
  | 'field'
  | 'box'
  | 'row'
  | 'figure'
  | 'mark'
  | 'head';

export interface Behaviour {
  name: string;
  parent: BehaviourParent;
  purpose: string;
}

export const BEHAVIOURS: readonly Behaviour[] = [
  { name: 'bench', parent: 'surface', purpose: 'One flower on the ground, filling the window.' },
  {
    name: 'flower-ring',
    parent: 'figure',
    purpose: 'A closed polygon in an ink line, whose sides share the circle by the reading.',
  },
  {
    name: 'flower-silhouette',
    parent: 'figure',
    purpose: 'The whole flower as one shape, while its petals are too small to tell apart.',
  },
  {
    name: 'petal-wedge',
    parent: 'figure',
    purpose: 'A petal at rest: its whole angle, straight edges, its height exactly as the reading.',
  },
  {
    name: 'petal-focus',
    parent: 'figure',
    purpose: 'The one under the pointer rises, widens over its neighbours and takes the accent.',
  },
  {
    name: 'petal-neighbour',
    parent: 'figure',
    purpose: 'Petals one and two away rise a little of what the focus does, and no others move.',
  },
  {
    name: 'petal-bands',
    parent: 'figure',
    purpose: 'Straight cuts in the focused petal only, each named in its note.',
  },
  {
    name: 'account-opening',
    parent: 'figure',
    purpose: 'With the zoom as the clock, a petal widens into an account and the rest recede.',
  },
  {
    name: 'way-back-map',
    parent: 'figure',
    purpose: 'The flower small in a corner, this account lit, once the flower no longer fits.',
  },
  {
    name: 'relations-sketch',
    parent: 'figure',
    purpose: 'Seeded lines and a dotted ring to judge a feel; no data behind them, off by default.',
  },
  {
    name: 'petal-note',
    parent: 'mark',
    purpose: 'A name and share in mono on a hairline leader, by rank, as far as there is room.',
  },
  {
    name: 'focus-note',
    parent: 'mark',
    purpose: 'One note that travels round the rim to the focus, with its kind and bands listed.',
  },
  {
    name: 'band-label',
    parent: 'mark',
    purpose: 'A band of the focused petal saying its name, once it is big enough to hold it.',
  },
  {
    name: 'flower-title',
    parent: 'head',
    purpose: 'The flower’s name: under it when small, inside the polygon once it fits.',
  },
  {
    name: 'account-panel',
    parent: 'box',
    purpose: 'The open account in a hairline box: the note, landed, with its id, amount and kind.',
  },
];
