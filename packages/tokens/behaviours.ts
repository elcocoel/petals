// The behaviour tree: Elco's "css subclasses". A parent is one attribute, `data-b`, on a component's root,
// from the minimal set. A child is one thing that parent learned to do in a version, and it can't exist
// without a row here: apps/web/test/behaviours.test.ts holds the stylesheet and JoyLayer to this table.
// `?off=<parent>` strips the attribute, and everything below it falls back to v1.

export const parents = {
  surface: 'Section, Nav, Footer: a band of the page',
  action: 'Button primary, secondary and starter',
  link: 'TextLink, GalleryCard, Button link and quiet',
  field: 'AskBox',
  box: 'A figure box, Callout, Terminal, FloatBox',
  row: 'FaqItem, a Transcript line',
  figure: 'Drawing, AnnotatedFlower',
  mark: 'Wordmark, the pixel numerals',
  head: 'SectionHead',
} as const;

export type Parent = keyof typeof parents;

export interface Behaviour {
  /** `parent.child`. The stylesheet marks each rule with it in a comment. */
  name: `${Parent}.${string}`;
  /** What it's for, in a line. */
  purpose: string;
  /**
   * Where it lives: the stylesheet, JoyLayer, or both. `view` is a component and its ViewModel, marked
   * there in a comment, because it holds in every version: a hand can move a box under ?v=1 too.
   */
  via: 'css' | 'script' | 'both' | 'view';
}

export const behaviours = [
  // surface
  {
    name: 'surface.ground',
    purpose: 'The ground takes a breath of Mint, so white glass can sit on it',
    via: 'css',
  },
  {
    name: 'surface.band',
    purpose:
      'Grain and a soft gradient on the ink and mint bands; a plain band has nothing behind it',
    via: 'css',
  },
  {
    name: 'surface.tone',
    purpose: 'A light band takes one of three grounds and textures: paper, mist or stone',
    via: 'css',
  },
  {
    name: 'surface.drift',
    purpose: 'A very soft tone drifts over a textured band, on cycles of minutes',
    via: 'both',
  },
  {
    name: 'surface.shimmer',
    purpose: 'Two faint layers of static slide slowly against each other on the stone band',
    via: 'both',
  },
  {
    name: 'surface.connect',
    purpose: 'Now and then a faint hairline fades in between two near stars, clear of the content',
    via: 'both',
  },
  { name: 'surface.reveal', purpose: 'A section fades in as you arrive at it', via: 'both' },
  {
    name: 'surface.stick',
    purpose: 'The nav stays, with blur, and tightens once you scroll',
    via: 'both',
  },
  // action
  {
    name: 'action.shape',
    purpose: 'Soft corners, a layered shadow with an inner highlight, a faint gloss',
    via: 'css',
  },
  {
    name: 'action.chip',
    purpose: 'Secondary and starter become glass, the starter a pill',
    via: 'css',
  },
  {
    name: 'action.lift',
    purpose: 'Rises about a pixel on hover, softly, and the shadow deepens',
    via: 'css',
  },
  { name: 'action.press', purpose: 'Sinks when pressed and the shadow collapses', via: 'css' },
  { name: 'action.ring', purpose: 'Keyboard focus is a mint ring', via: 'css' },
  { name: 'action.arrive', purpose: 'Starters arrive one after another', via: 'both' },
  // link
  { name: 'link.underline', purpose: 'The underline draws from the left, and leaves', via: 'css' },
  { name: 'link.slide', purpose: 'The arrow slides on', via: 'css' },
  { name: 'link.card', purpose: 'A card: its title underlines while its box lifts', via: 'css' },
  // field
  {
    name: 'field.well',
    purpose: 'Radius, glass, a pressed-in shadow: a place to put words',
    via: 'css',
  },
  { name: 'field.nest', purpose: 'The button inside keeps a concentric radius', via: 'css' },
  { name: 'field.warm', purpose: 'Hover lifts the well out of the page a little', via: 'css' },
  { name: 'field.focus', purpose: 'The focus ring grows and glows mint', via: 'css' },
  {
    name: 'field.type',
    purpose: 'Its placeholder types its lines in and out, in order, until the box gets focus',
    via: 'script',
  },
  // box
  {
    name: 'box.glass',
    purpose: 'Glass gradient, a corner glow, layered shadow, soft edge',
    via: 'css',
  },
  { name: 'box.paper', purpose: 'A figure box is ruled paper, faint at the edges', via: 'css' },
  { name: 'box.rise', purpose: 'Boxes rise in, one after another', via: 'both' },
  { name: 'box.lift', purpose: 'Lifts on hover and the shadow deepens', via: 'css' },
  { name: 'box.tilt', purpose: 'Tilts slightly toward the pointer', via: 'both' },
  { name: 'box.swell', purpose: 'The drawing inside swells a little', via: 'css' },
  { name: 'box.type', purpose: "A terminal's lines come in one by one", via: 'css' },
  {
    name: 'box.move',
    purpose: 'Dragged by its bar, comes above the other, and its bar never leaves the window',
    via: 'view',
  },
  {
    name: 'box.size',
    purpose: 'Sized by hand from its edges and corners, shown only by the cursor',
    via: 'view',
  },
  {
    name: 'box.hold',
    purpose:
      'A wheel or a pinch stays in it, and pressing the canvas leaves the cursor in it, so a chat carries on',
    via: 'view',
  },
  {
    name: 'box.close',
    purpose: 'Stays closed until asked for, opens above the others, and closes from its bar',
    via: 'view',
  },
  {
    name: 'box.fold',
    purpose:
      'A menu docked to the window’s edge folds away from its bar, and one word brings it back',
    via: 'view',
  },
  // row
  { name: 'row.arrive', purpose: 'Rows arrive one by one', via: 'both' },
  {
    name: 'row.card',
    purpose: 'The row you are on becomes a whole card: a stroke all round and a soft fill',
    via: 'css',
  },
  { name: 'row.swell', purpose: 'Its glyph swells', via: 'css' },
  {
    name: 'row.fold',
    purpose: 'An answer starts folded, and opens and closes with a real height animation',
    via: 'css',
  },
  {
    name: 'row.peek',
    purpose: 'A pointer at rest opens a folded row; it closes softly a little after it leaves',
    via: 'script',
  },
  { name: 'row.sign', purpose: 'The sign turns between plus and minus', via: 'css' },
  { name: 'row.cursor', purpose: "The transcript's cursor blinks", via: 'css' },
  // figure
  {
    name: 'figure.arrive',
    purpose: 'A small drawing comes in whole, a little under size',
    via: 'both',
  },
  { name: 'figure.bloom', purpose: 'Petals grow out of the centre, around the clock', via: 'both' },
  {
    name: 'figure.draw',
    purpose: 'Lines draw themselves in, from what the bloom split',
    via: 'css',
  },
  { name: 'figure.notes', purpose: 'Notes arrive once their lines have', via: 'css' },
  { name: 'figure.lean', purpose: 'Petals near the pointer lean out toward it', via: 'script' },
  { name: 'figure.parallax', purpose: 'The layers shift apart slightly', via: 'script' },
  {
    name: 'figure.link',
    purpose: 'A note lights its petal and leader, and the petal its note',
    via: 'both',
  },
  { name: 'figure.field', purpose: 'A field of cells opens toward the pointer', via: 'both' },
  { name: 'figure.wake', purpose: 'A set-back thumbnail wakes under the pointer', via: 'css' },
  // mark
  {
    name: 'mark.open',
    purpose: 'Cells open into four-point shapes as the pointer gets close',
    via: 'script',
  },
  {
    name: 'mark.arrive',
    purpose: 'A mark starts open and resolves into the word as you arrive',
    via: 'both',
  },
  { name: 'mark.tight', purpose: 'The nav wordmark settles smaller with the nav', via: 'css' },
  // head
  {
    name: 'head.rise',
    purpose: 'Eyebrow, title lines and body rise in softly, staggered',
    via: 'both',
  },
  // The live flower, apps/web/flower. It's drawn by script in every version and carries no `data-b`, so
  // `?off=` leaves it alone; its parents say what kind of thing each part is.
  { name: 'surface.canvas', purpose: 'One flower on the ground, filling the window', via: 'view' },
  {
    name: 'figure.flower-ring',
    purpose: 'A closed polygon in an ink line, whose sides share the circle by the reading',
    via: 'view',
  },
  {
    name: 'figure.flower-silhouette',
    purpose: 'The whole flower as one shape, while its petals are too small to tell apart',
    via: 'view',
  },
  {
    name: 'figure.petal-wedge',
    purpose: 'A petal at rest: its whole angle, straight edges, its height exactly as the reading',
    via: 'view',
  },
  {
    name: 'figure.petal-focus',
    purpose: 'The one under the pointer rises, widens over its neighbours and takes the accent',
    via: 'view',
  },
  {
    name: 'figure.pick',
    purpose:
      'A press that stays put takes what hover has lit, the centre or the ground; a drag never',
    via: 'view',
  },
  {
    name: 'figure.petal-picked',
    purpose:
      'The picked petal keeps its accent and note once the pointer leaves, at its true height',
    via: 'view',
  },
  {
    name: 'figure.petal-neighbour',
    purpose: 'Petals one and two away rise a little of what the focus does, and no others move',
    via: 'view',
  },
  {
    name: 'figure.petal-bands',
    purpose: 'Straight cuts in the focused petal only, each named in its note',
    via: 'view',
  },
  {
    name: 'figure.account-opening',
    purpose: 'With the zoom as the clock, a petal widens into an account and the rest recede',
    via: 'view',
  },
  {
    name: 'figure.way-back-map',
    purpose: 'The flower small in a corner, this account lit, once the flower no longer fits',
    via: 'view',
  },
  {
    name: 'figure.relations-sketch',
    purpose: 'Seeded lines and a dotted ring to judge a feel; no data behind them, off by default',
    via: 'view',
  },
  {
    name: 'mark.petal-note',
    purpose: 'A name and share in mono on a hairline leader, by rank, as far as there is room',
    via: 'view',
  },
  {
    name: 'mark.focus-note',
    purpose: 'One note that travels round the rim to the focus, with its kind and bands listed',
    via: 'view',
  },
  {
    name: 'mark.band-label',
    purpose: 'A band of the focused petal saying its name, once it is big enough to hold it',
    via: 'view',
  },
  {
    name: 'head.flower-title',
    purpose: 'The flower’s name: under it when small, inside the polygon once it fits',
    via: 'view',
  },
  {
    name: 'box.account-panel',
    purpose: 'The open account in a hairline box: the note, landed, with its id, amount and kind',
    via: 'view',
  },
] as const satisfies readonly Behaviour[];

export type BehaviourName = (typeof behaviours)[number]['name'];

export const parentOf = (name: string) => name.slice(0, name.indexOf('.')) as Parent;
