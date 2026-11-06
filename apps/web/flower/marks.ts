// What to draw at this zoom, for this pointer: a pure function of the reading, the view and the focus,
// tested without a browser. Every opacity comes from the table in detail.ts and from how much room a
// text has, so nothing here counts time. Screen space, in px. The drawing is scene.ts's business.
import type { View } from './camera.ts';
import { DETAIL, fade, openAt, ramp } from './detail.ts';
import { RECEDE } from './feel.ts';
import type { Model } from './model.ts';
import { type Ring, widthAt } from './ring.ts';
import { amount, kindWord, LINE, pct, textWidth } from './words.ts';

/** How close, in px, a text may come to a higher one before it starts to give way. */
const CLEAR = 6;
/** Most notes on screen at once. Past this, rank decides. */
export const NOTE_POOL = 36;
export const LABEL_POOL = 20;
/** Keep notes this far from the window's edge. */
const INSET = 14;
const LIFT = 16;
const LIFT_STAGGER = 9;
const FOCUS_LIFT = 26;
/** How many bars each side a note looks at to stay clear of them, and how far it'll move to do it. */
const NEIGHBOURS = 12;
const MOST_CLEARING = 90;
const PANEL_PAD = 14;
const PANEL_HEADER = 1.4;
/** The window's margin for the panel; and at the bottom, room for the readout. */
const PANEL_INSET = 28;
const PANEL_BOTTOM = 40;
/** Where the small map sits, as a box in the bottom left. */
export const MAP_SIZE = 96;
const MAP_INSET = 28;
/** The map sits this far up, clear of Next's badge in development. */
export const MAP_BOTTOM = 64;

export interface Focus {
  index: number;
  /** 0 to 1: is the pointer on the flower at all. */
  presence: number;
  /** How far this account has opened. Defaults to what the zoom says. */
  open?: number;
  /** The world point the note has got to, on its way to the tip. Defaults to the tip. */
  chase?: { x: number; y: number };
  /** -1 to 1: which side its text is on. Defaults to the petal's. */
  side?: number;
  /** Which of its bands the pointer is on. Defaults to none. */
  band?: number;
  /** How much of each petal's bands show. Defaults to the focus's alone. */
  named?: Float64Array;
}

export interface NoteMark {
  index: number;
  text: string;
  width: number;
  opacity: number;
  /** The text's left end and baseline. */
  x: number;
  y: number;
  dotX: number;
  dotY: number;
  elbowX: number;
  elbowY: number;
  /** The far end of the rule the text sits on. */
  ruleX: number;
}

export interface FocusMark extends NoteMark {
  /** The kind, on the second line. */
  sub: string;
  subOpacity: number;
  /** Its bands in stack order, under the kind, the one under the pointer strong. */
  bands: { text: string; opacity: number; strong: boolean }[];
  /** The text's scale: one tag, growing. */
  scale: number;
  /** How much of the rule is left, as the note turns into the panel's header. */
  rule: number;
}

export interface LabelMark {
  text: string;
  opacity: number;
  x: number;
  y: number;
  /** Degrees. */
  rotate: number;
}

export interface PanelMark {
  opacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  lines: { text: string; x: number; y: number; muted: boolean; opacity: number }[];
}

export interface Marks {
  silhouette: number;
  petals: number;
  polygon: number;
  /** How much the rest of the flower has stepped back for an open account. */
  recede: number;
  open: number;
  title: string;
  titleInside: { opacity: number; x: number; y: number };
  titleOutside: { opacity: number; x: number; y: number };
  notes: NoteMark[];
  focus: FocusMark | null;
  /** How much of each petal's bands show, by index. */
  segments: Float64Array;
  labels: LabelMark[];
  panel: PanelMark | null;
  map: { opacity: number; x: number; y: number; size: number; litIndex: number };
  relations: number;
  readout: { text: string; x: number; y: number } | null;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  opacity: number;
}

/** How much a text is allowed, given the ones above it. Purely a matter of distance. */
function roomFor(box: Omit<Box, 'opacity'>, above: Box[]): number {
  let room = 1;
  for (const o of above) {
    const gap = Math.max(o.x0 - box.x1, box.x0 - o.x1, o.y0 - box.y1, box.y0 - o.y1);
    if (gap >= CLEAR) continue;
    room *= 1 - ramp(0.02, 0.2, o.opacity) * (1 - ramp(0, CLEAR, gap));
    if (room <= 0) return 0;
  }
  return room;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A band as words: the data's label and its share of its petal. */
const bandLine = (seg: { label: string; frac: number }) => `${seg.label} ${pct(seg.frac)}`;

/** The account's panel, in the corner its petal points at, so the note has little way to travel. */
function panelOf(m: Model, v: View, i: number, opacity: number, band: number): PanelMark {
  const p = m.petals[i];
  const lines: string[] = [];
  const quiet = new Set<string>();
  if (p && p.id !== p.name && !p.tail) {
    lines.push(p.id);
    quiet.add(p.id);
  }
  if (p) {
    lines.push(amount(p.amount));
    lines.push(kindWord(p.kind));
    // A tall bar's bands don't all fit the window at once. Here they do.
    p.segments.forEach((seg, j) => {
      const line = bandLine(seg);
      lines.push(line);
      if (j !== band) quiet.add(line);
    });
  }
  const header = textWidth(m.fullNotes[i] ?? '', PANEL_HEADER);
  const inner = Math.max(header, ...lines.map((s) => textWidth(s)));
  const width = Math.min(v.width - 2 * INSET, inner + 2 * PANEL_PAD);
  const height = 2 * PANEL_PAD + LINE * PANEL_HEADER + lines.length * LINE;
  const right = (m.ring.nx[i] as number) >= 0;
  const bottom = (m.ring.ny[i] as number) >= 0;
  const leftEdge = bottom ? MAP_INSET + MAP_SIZE + PANEL_PAD : PANEL_INSET;
  const x = right ? v.width - PANEL_INSET - width : leftEdge;
  const y = bottom ? v.height - PANEL_BOTTOM - height : PANEL_INSET;
  return {
    opacity,
    x,
    y,
    width,
    height,
    lines: lines.map((text, at) => ({
      text,
      x: x + PANEL_PAD,
      y: y + PANEL_PAD + LINE * PANEL_HEADER + at * LINE + 8,
      muted: quiet.has(text),
      opacity,
    })),
  };
}

export function marks(
  m: Model,
  v: View,
  focus: Focus | null,
  ring: Ring = m.ring,
  scratch?: Float64Array,
  /** A tiny readout of zoom and share while we tune. Only the lab's bench asks for it. */
  readout = false,
  /** The petal a click chose, or -1. */
  chosen = -1,
): Marks {
  const { k } = v;
  const toX = (x: number) => (x + ring.ox) * k + v.x;
  const toY = (y: number) => (y + ring.oy) * k + v.y;
  const radius = m.R * k;
  const polygonRadius = m.r0 * k;
  const placed: Box[] = [];
  const claim = (box: Omit<Box, 'opacity'>, opacity: number) => {
    if (opacity > 0.01) placed.push({ ...box, opacity });
  };

  // figure.account-opening
  // The account.
  const fi = focus?.index ?? -1;
  const presence = focus ? focus.presence * fade(DETAIL.hover, radius) : 0;
  const open = focus ? (focus.open ?? openAt(m.ring.len[fi] as number, k)) : 0;
  const recede = 1 - RECEDE * open;
  const panelOpacity = fade(DETAIL.panel, open) * presence;
  const band = focus?.band ?? -1;

  // Bands show on the petal in direct focus, as soon as its note can name them, and nowhere else.
  const segments = scratch ?? new Float64Array(m.n);
  segments.fill(0);
  const hover = fade(DETAIL.hover, radius);
  for (let i = 0; i < m.n; i++) {
    if (!m.petals[i]?.segments.length) continue;
    const named = focus?.named ? (focus.named[i] as number) * hover : i === fi ? presence : 0;
    if (named <= 0) continue;
    const end = widthAt(ring, i, ring.h[i] as number) * k;
    segments[i] = named * fade(DETAIL.segments, end);
  }

  // box.account-panel
  // The panel comes first: nothing may sit under it.
  let panel: PanelMark | null = null;
  if (focus && panelOpacity > 0.001) {
    panel = panelOf(m, v, fi, panelOpacity, band);
    claim(
      {
        x0: panel.x,
        y0: panel.y,
        x1: panel.x + panel.width,
        y1: panel.y + panel.height,
      },
      panelOpacity,
    );
  }

  // mark.focus-note
  // The one note that travels with the pointer, turning into the panel's header as the account opens.
  let focusMark: FocusMark | null = null;
  if (focus && presence > 0.001) {
    const h = ring.h[fi] as number;
    const nx = ring.nx[fi] as number;
    const ny = ring.ny[fi] as number;
    const mx = ((ring.ax[fi] as number) + (ring.bx[fi] as number)) / 2;
    const my = ((ring.ay[fi] as number) + (ring.by[fi] as number)) / 2;
    const tipWorldX = mx + nx * h;
    const tipWorldY = my + ny * h;
    const chase = focus.chase ?? { x: tipWorldX, y: tipWorldY };
    const cx = toX(chase.x);
    const cy = toY(chase.y);
    // The dot sits on the highest point of the bar's axis that's on screen, and travels with the
    // note: the leader stays short, whatever the note is on its way to.
    const onAxis = axisDot(toX(mx), toY(my), nx * k, ny * k, h, v);
    const dot = {
      x: onAxis.x + (chase.x - tipWorldX) * k,
      y: onAxis.y + (chase.y - tipWorldY) * k,
    };
    const ox = toX(m.cx);
    const oy = toY(m.cy);
    const dist = Math.hypot(cx - ox, cy - oy) || 1;
    const text = m.fullNotes[fi] ?? '';
    const width = textWidth(text);
    const s = focus.side ?? ((m.ring.nx[fi] as number) >= -0.02 ? 1 : -1);
    const elbowX0 = cx + ((cx - ox) / dist) * FOCUS_LIFT;
    const elbowY0 = cy + ((cy - oy) / dist) * FOCUS_LIFT;
    // Near the window's edge the note slides back along itself, and steps off its bar's end so it
    // doesn't lie across it. How far is how much it had to slide, so there's no jump.
    const halfBar = ((ring.len[fi] as number) * k) / 2 + 8;
    const left1 = elbowX0 - (width * (1 - s)) / 2;
    const left0 = clamp(left1, INSET, v.width - INSET - width);
    const slidX = Math.abs(left1 - left0);
    const off = Math.min(slidX, halfBar + LINE);
    const listed = m.petals[fi]?.segments ?? [];
    const shown = segments[fi] as number;
    const below = LINE * (1 + listed.length * ramp(0, 0.2, shown));
    const elbowY1 = clamp(elbowY0 + (ny > 0 ? off : -off), INSET + LINE, v.height - INSET - below);
    const slidY = Math.abs(elbowY0 - elbowY1);
    const elbowX1 =
      clamp(left0 + (nx >= 0 ? 1 : -1) * Math.min(slidY, halfBar), INSET, v.width - INSET - width) +
      (width * (1 - s)) / 2;
    const leftFinal = elbowX1 - (width * (1 - s)) / 2;
    const e = fade(DETAIL.panel, open);
    const scale = lerp(1, PANEL_HEADER, e);
    const panelX = panel ? panel.x + PANEL_PAD : leftFinal;
    const panelY = panel ? panel.y + PANEL_PAD + LINE : elbowY1 - 4;
    // The leader lands on the panel's corner that faces the flower.
    const cornerX = panel ? panel.x + ((m.ring.nx[fi] as number) >= 0 ? 0 : panel.width) : elbowX1;
    const cornerY = panel ? panel.y + ((m.ring.ny[fi] as number) >= 0 ? 0 : panel.height) : elbowY1;
    const x = lerp(leftFinal, panelX, e);
    const y = lerp(elbowY1 - 4, panelY, e);
    // Its box holds its list too, which can be wider than its name.
    const widest = listed.reduce((w, seg) => Math.max(w, textWidth(bandLine(seg))), width * scale);
    const box = {
      x0: x - 1,
      y0: y - LINE * scale,
      x1: x + (shown > 0 ? widest : width * scale) + 1,
      y1: y + below + 8,
    };
    const leaving = 1 - ramp(0, 0.18, e);
    focusMark = {
      index: fi,
      text,
      width,
      opacity: presence,
      x,
      y,
      dotX: dot.x,
      dotY: dot.y,
      elbowX: lerp(elbowX1, cornerX, e),
      elbowY: lerp(elbowY1, cornerY, e),
      ruleX: elbowX1 + s * width,
      sub: kindWord(m.petals[fi]?.kind ?? ''),
      subOpacity: fade(DETAIL.kind, widthAt(ring, fi, h) * k) * presence * leaving,
      bands: listed.map((seg, j) => ({
        text: bandLine(seg),
        opacity: shown * leaving,
        strong: j === band,
      })),
      scale,
      rule: 1 - e,
    };
    claim(box, presence);
    // The panel's lines wait for the name to land: they keep clear of it on its way in.
    if (panel) {
      for (const line of panel.lines) {
        const lineBox = {
          x0: line.x,
          y0: line.y - LINE + 4,
          x1: line.x + textWidth(line.text),
          y1: line.y + 4,
        };
        const name = { ...box, y1: y + 4, opacity: presence };
        line.opacity = panel.opacity * roomFor(lineBox, [name]);
      }
    }
  }

  // head.flower-title
  // The title: outside while the flower's too small to hold it, inside once it can.
  const room = polygonRadius - m.titleWidth / 2;
  const inside = fade(DETAIL.titleInside, room) * (1 - open);
  const outside = fade(DETAIL.titleOutside, radius) * (1 - fade(DETAIL.titleLeaves, room));
  const cx = toX(m.cx);
  const cy = toY(m.cy);
  const titleLeft = cx - m.titleWidth / 2;
  const titleBox = (y: number) => ({
    x0: titleLeft,
    y0: y - LINE + 4,
    x1: titleLeft + m.titleWidth,
    y1: y + 4,
  });
  const titleOutside = { opacity: 0, x: cx, y: cy + radius + 18 };
  titleOutside.opacity = outside * roomFor(titleBox(titleOutside.y), placed);
  const titleInside = { opacity: 0, x: cx, y: cy + 4 };
  titleInside.opacity = inside * roomFor(titleBox(titleInside.y), placed);
  claim(titleBox(titleInside.y), titleInside.opacity);
  claim(titleBox(titleOutside.y), titleOutside.opacity);

  // figure.way-back-map
  // The small map claims its corner.
  const mapOpacity = fade(DETAIL.wayBack, radius / (Math.min(v.width, v.height) / 2));
  const map = {
    opacity: mapOpacity,
    x: MAP_INSET,
    y: v.height - MAP_BOTTOM - MAP_SIZE,
    size: MAP_SIZE,
    litIndex: fi >= 0 ? fi : chosen,
  };
  if (mapOpacity > 0.01) {
    claim({ x0: map.x, y0: map.y, x1: map.x + MAP_SIZE, y1: map.y + MAP_SIZE }, mapOpacity);
  }

  // mark.petal-note
  // Everyone else's notes, in order of rank, each only if it has earned it and has the room.
  const notes: NoteMark[] = [];
  const dots: { x: number; y: number }[] = [];
  const noteOn = (
    i: number,
    wish: number,
    text: string,
    width: number,
    lift: number,
    kept = false,
  ) => {
    if (wish <= 0.005) return;
    const h = ring.h[i] as number;
    const nx = ring.nx[i] as number;
    const ny = ring.ny[i] as number;
    const tipX = toX(((ring.ax[i] as number) + (ring.bx[i] as number)) / 2 + nx * h);
    const tipY = toY(((ring.ay[i] as number) + (ring.by[i] as number)) / 2 + ny * h);
    if (tipX < -40 || tipY < -40 || tipX > v.width + 40 || tipY > v.height + 40) return;
    const s = (m.ring.nx[i] as number) >= -0.02 ? 1 : -1;
    const reach = tipX + nx * lift;
    const fromEnd = s > 0 ? reach : reach - width;
    // Everyone else fades at the window's edge. A note that's kept slides along it, as the focus's does.
    const x = kept ? clamp(fromEnd, INSET, v.width - INSET - width) : fromEnd;
    const elbowX = kept ? (s > 0 ? x : x + width) : reach;
    const rule = clearOfBars(m, ring, toX, toY, i, x, x + width, tipY + ny * lift, ny);
    const elbowY = kept ? clamp(rule, INSET + LINE, v.height - INSET) : rule;
    const y = elbowY - 4;
    const box = { x0: x - 1, y0: y - LINE + 4, x1: x + width + 1, y1: elbowY + 2 };
    const edge = kept
      ? 1
      : ramp(0, INSET, Math.min(box.x0, box.y0, v.width - box.x1, v.height - box.y1));
    const opacity = wish * edge * roomFor(box, placed);
    if (opacity <= 0.01) return;
    placed.push({ ...box, opacity });
    notes.push({
      index: i,
      text,
      width,
      opacity,
      x,
      y,
      dotX: tipX,
      dotY: tipY,
      elbowX,
      elbowY,
      ruleX: elbowX + s * width,
    });
    dots.push({ x: tipX, y: tipY });
  };
  // figure.petal-picked
  // The chosen petal keeps its name, in full, before anyone else's. When the pointer's on it the note
  // that travels says it instead, and the two hand over as the pointer comes and goes.
  if (chosen >= 0) {
    const held =
      fade(DETAIL.hover, radius) * (1 - open) * (chosen === fi ? 1 - (focus?.presence ?? 0) : 1);
    const text = m.fullNotes[chosen] ?? '';
    noteOn(chosen, held, text, textWidth(text), FOCUS_LIFT, true);
  }
  for (let at = 0; at < m.n && notes.length < NOTE_POOL; at++) {
    const i = m.order[at] as number;
    if (i === chosen || (i === fi && focusMark)) continue;
    const side = (ring.len[i] as number) * k;
    const wish =
      Math.max(
        fade(DETAIL.topNotes, radius / ((m.rankOf[i] as number) + 2)),
        fade(DETAIL.allNotes, side),
      ) *
      (1 - open);
    noteOn(i, wish, m.notes[i] ?? '', m.noteWidths[i] as number, LIFT + (i % 3) * LIFT_STAGGER);
  }

  // mark.band-label
  // A band of the focused petal says its name, if it's big enough to hold it.
  const labels: LabelMark[] = [];
  const fp0 = fi >= 0 ? m.petals[fi] : undefined;
  if (fp0 && (segments[fi] as number) > 0) {
    const i = fi;
    const p = fp0;
    const shown = segments[fi] as number;
    const h = ring.h[i] as number;
    const nx = ring.nx[i] as number;
    const ny = ring.ny[i] as number;
    const mx = toX(((ring.ax[i] as number) + (ring.bx[i] as number)) / 2);
    const my = toY(((ring.ay[i] as number) + (ring.by[i] as number)) / 2);
    // Read along whichever way is nearer level: across the bar near twelve, along it near three.
    const across = Math.abs(ny) >= Math.abs(nx);
    let done = 0;
    for (const seg of p.segments) {
      const h0 = h * done;
      done += seg.frac;
      const h1 = h * done;
      const text = bandLine(seg);
      const need = textWidth(text);
      const bandPx = (h1 - h0) * k;
      const sidePx = widthAt(ring, i, (h0 + h1) / 2) * k;
      const thick = across ? bandPx : sidePx;
      const long = across ? sidePx : bandPx;
      const fits = fade(DETAIL.segmentLabels, thick) * ramp(1.04, 1.24, long / need);
      if (fits <= 0.005) continue;
      const mid = visibleMiddle(mx, my, nx * k, ny * k, h0, h1, v);
      if (!mid) continue;
      const rotate = across
        ? upright((Math.atan2(ny, nx) * 180) / Math.PI + 90)
        : upright((Math.atan2(ny, nx) * 180) / Math.PI);
      const halfW = (need + 2) / 2;
      const halfH = LINE / 2;
      const rad = (rotate * Math.PI) / 180;
      const ex = Math.abs(Math.cos(rad)) * halfW + Math.abs(Math.sin(rad)) * halfH;
      const ey = Math.abs(Math.sin(rad)) * halfW + Math.abs(Math.cos(rad)) * halfH;
      const box = { x0: mid.x - ex, y0: mid.y - ey, x1: mid.x + ex, y1: mid.y + ey };
      const opacity = shown * fits * roomFor(box, placed);
      if (opacity <= 0.01) continue;
      placed.push({ ...box, opacity });
      labels.push({ text, opacity, x: mid.x, y: mid.y, rotate });
      if (labels.length >= LABEL_POOL) break;
    }
  }

  const fp = fi >= 0 ? m.petals[fi] : undefined;
  return {
    silhouette: fade(DETAIL.silhouette, radius),
    petals: fade(DETAIL.petals, radius),
    polygon: fade(DETAIL.polygonLine, radius),
    recede,
    open,
    title: m.title,
    titleInside,
    titleOutside,
    notes,
    focus: focusMark,
    segments,
    labels,
    panel,
    map,
    relations: fade(DETAIL.relations, radius),
    readout: readout
      ? {
          text: `${k < 1 ? k.toFixed(3) : k.toFixed(2)}x${fp && presence > 0.5 ? ` ${pct(fp.share)}` : ''}`,
          x: v.width - INSET,
          y: v.height - INSET,
        }
      : null,
  };
}

/** Moves a note's rule up or down, past the tips of the bars its text would otherwise run across.
 * Weighted by how far into the text a tip is, so the note doesn't jump as a bar swells past it. */
function clearOfBars(
  m: Model,
  ring: Ring,
  toX: (x: number) => number,
  toY: (y: number) => number,
  i: number,
  x0: number,
  x1: number,
  elbowY: number,
  ny: number,
): number {
  let out = elbowY;
  for (let d = -NEIGHBOURS; d <= NEIGHBOURS; d++) {
    if (d === 0) continue;
    // A small flower is shorter than this reach, so it comes round again: past itself, and to itself.
    const j = (((i + d) % m.n) + m.n) % m.n;
    if (j === i) continue;
    const h = ring.h[j] as number;
    const tipX = toX(
      ((ring.ax[j] as number) + (ring.bx[j] as number)) / 2 + (ring.nx[j] as number) * h,
    );
    const depth = Math.min(tipX - x0, x1 - tipX);
    if (depth <= 0) continue;
    const tipY = toY(
      ((ring.ay[j] as number) + (ring.by[j] as number)) / 2 + (ring.ny[j] as number) * h,
    );
    const want = ny < 0 ? Math.min(out, tipY - 6) : Math.max(out, tipY + LINE + 6);
    if (Math.abs(want - elbowY) > MOST_CLEARING) continue;
    out += (want - out) * ramp(0, 12, depth);
  }
  return out;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(Math.max(lo, hi), x));

const upright = (deg: number): number => {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  if (a > 90) a -= 180;
  if (a < -90) a += 180;
  return a;
};

/** The highest point of a bar's axis still on screen; its foot if none is. */
function axisDot(x: number, y: number, nx: number, ny: number, h: number, v: View) {
  for (let i = 24; i >= 0; i--) {
    const u = (h * i) / 24;
    const px = x + nx * u;
    const py = y + ny * u;
    if (px > INSET && px < v.width - INSET && py > INSET && py < v.height - INSET) {
      return { x: px, y: py };
    }
  }
  return { x: x + nx * h, y: y + ny * h };
}

/** The middle of what's on screen of a stretch of a bar's axis, or null. */
function visibleMiddle(
  x: number,
  y: number,
  nx: number,
  ny: number,
  h0: number,
  h1: number,
  v: View,
) {
  let sum = 0;
  let count = 0;
  for (let i = 0; i <= 16; i++) {
    const u = h0 + ((h1 - h0) * i) / 16;
    const px = x + nx * u;
    const py = y + ny * u;
    if (px > 24 && px < v.width - 24 && py > 24 && py < v.height - 24) {
      sum += u;
      count++;
    }
  }
  if (!count) return null;
  const u = sum / count;
  return { x: x + nx * u, y: y + ny * u };
}
