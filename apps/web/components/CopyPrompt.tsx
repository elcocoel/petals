'use client';
// One click, then paste into any agent (lib/agent-prompt.ts). `bare` is the button alone, for a page that
// doesn't show the prompt; a bare button is never swapped for the prompt, whatever happens.
// Once it has copied, the button says so in its own place and keeps its size, so nothing around it moves, in the
// green tone for a moment, then is itself again. What to do next is said by a small card of the message cards'
// light glass that comes in where the press happened and goes again; it is kept apart from the tooltip's look,
// which is for naming controls.
import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Glass } from './landing/HeroGlass.tsx';
import { Button, type ButtonVariant } from './ui/Button.tsx';

/** How long the press's answer stays, the button's word and the card: long enough to read the card. */
const SAID_MS = 3200;
/** How long the card takes to come in, and to go. */
const MOVE_MS = 220;
/** How far it rises as it comes in, in px. */
const RISE_PX = 8;
/** How far the card stands off the button, and in from the window's edges, in px. */
const GAP = 12;
const EDGE = 16;

/** The look a button takes once it has copied: the green tone, edged where it was, so its size never changes. */
const DONE: Partial<Record<ButtonVariant, ButtonVariant>> = {
  primary: 'done',
  secondary: 'doneEdged',
};

/** Where the press happened: the pointer, or the button's middle when a key pressed it. */
interface Anchor {
  x: number;
  rect: DOMRect;
}

interface Toast {
  words: string;
  at: Anchor;
  /** coming in or on (true), going (false) */
  open: boolean;
}

/**
 * The card that says what to do next: under the button, centred on the press, inside the window, above the button
 * when there's no room under it; it fades and rises in from the button's side and goes the same way. It scrolls
 * with the page, so it stays by the button.
 */
function Said({ words, at, open }: Toast) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number; above: boolean } | null>(null);
  // the move starts a frame after it's placed, so it never flies in from the page's corner
  const [shown, setShown] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(at.x - w / 2, EDGE), window.innerWidth - w - EDGE);
    const under = at.rect.bottom + GAP;
    const above = under + h + EDGE > window.innerHeight;
    const top = above ? at.rect.top - GAP - h : under;
    setPlace({ left: left + window.scrollX, top: top + window.scrollY, above });
  }, [at]);
  useEffect(() => {
    if (!place) return;
    const id = requestAnimationFrame(() => setShown(open));
    return () => cancelAnimationFrame(id);
  }, [place, open]);
  const from = place?.above ? RISE_PX : -RISE_PX;
  return createPortal(
    <div
      ref={ref}
      role="status"
      className={`pointer-events-none absolute top-0 left-0 z-50 ${place ? '' : 'invisible'}`}
      style={
        place
          ? {
              translate: `${place.left}px ${place.top + (shown ? 0 : from)}px`,
              opacity: shown ? 1 : 0,
              transition:
                shown || !open
                  ? `opacity ${MOVE_MS}ms ease, translate ${MOVE_MS}ms ease`
                  : undefined,
            }
          : undefined
      }
    >
      <Glass tone="light" solid />
      <p className="relative my-0 px-space-16 py-space-8 type-ui whitespace-nowrap text-primary">
        {words}
      </p>
    </div>,
    document.body,
  );
}

/**
 * The old way, for a browser that refuses the clipboard API: a hidden field holding the text, selected and copied,
 * so the button never has to give way to the prompt itself and keeps its size whatever the browser allows.
 */
function copyByHand(text: string) {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  field.style.pointerEvents = 'none';
  document.body.append(field);
  field.select();
  let done = false;
  try {
    done = document.execCommand('copy');
  } catch {
    done = false;
  }
  field.remove();
  return done;
}

export function CopyPrompt({
  prompt,
  label = 'Copy this prompt',
  copied = 'Copied',
  next,
  variant,
  arrow,
  bare,
  originIn,
}: {
  prompt: string;
  label?: string;
  /** The button's word once it has copied, in place of its label. */
  copied?: string;
  /** What to do next, said by a small card by the button once it has copied. */
  next?: string;
  variant?: ButtonVariant;
  /** The button's trailing arrow. */
  arrow?: boolean;
  /** Where the prompt can be read, for when the browser won't copy. */
  bare?: { readHref: string } | true;
  /**
   * An address written in the prompt that gives way, on copying, to the one this page is on, so an agent
   * connects to the server its person is looking at. It lets a static page hand out the right prompt.
   */
  originIn?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [toast, setToast] = useState<Toast | null>(null);
  // the answer stays a moment, then the button is itself again and the card goes
  useEffect(() => {
    if (state !== 'copied') return;
    const back = setTimeout(() => setState('idle'), SAID_MS);
    return () => clearTimeout(back);
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(
      () => setToast(toast.open ? { ...toast, open: false } : null),
      // a frame's grace after the going, so it ends before it's gone
      toast.open ? SAID_MS : MOVE_MS + 60,
    );
    return () => clearTimeout(t);
  }, [toast]);

  /** Where it was pressed: the pointer, or the button's middle from a key. */
  function press(e: MouseEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    void copy({ x: e.detail > 0 ? e.clientX : rect.left + rect.width / 2, rect });
  }
  async function copy(at: Anchor) {
    const text = originIn ? prompt.replaceAll(originIn, window.location.origin) : prompt;
    let done = false;
    try {
      await navigator.clipboard.writeText(text);
      done = true;
    } catch {
      // refused: the old way, from the same press
      done = copyByHand(text);
    }
    if (done) {
      setState('copied');
      if (next) setToast({ words: next, at, open: true });
    } else if (bare && bare !== true) window.location.assign(bare.readHref);
    else {
      setState('failed');
      if (bare) setToast({ words: "Couldn't copy.", at, open: true });
    }
  }

  const done = state === 'copied';
  const look = done ? (DONE[variant ?? 'primary'] ?? variant) : variant;
  const button = (
    <Button variant={look} arrow={arrow} onClick={press}>
      {/* both words in one cell, so the button is always as wide as its own label */}
      <span className="grid justify-items-center">
        <span className={`col-start-1 row-start-1 ${done ? 'invisible' : ''}`}>{label}</span>
        <span aria-hidden={!done} className={`col-start-1 row-start-1 ${done ? '' : 'invisible'}`}>
          {copied}
        </span>
      </span>
    </Button>
  );
  const card = toast && <Said {...toast} />;
  // a bare button is never swapped for the prompt: it stays itself, the same size, always
  if (bare)
    return (
      <>
        {button}
        {card}
      </>
    );
  return (
    <div className="box">
      <pre>{prompt}</pre>
      {button}
      {state === 'failed' && <span className="muted"> Couldn't copy: select the text above.</span>}
    </div>
  );
}
