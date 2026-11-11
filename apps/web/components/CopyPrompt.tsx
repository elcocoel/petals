'use client';
// One click, then paste into any agent (lib/agent-prompt.ts). `bare` is the button alone, for a page that
// doesn't show the prompt: if the browser won't copy, it goes to where the prompt can be selected by hand,
// or, with nowhere to go (`bare` true), shows it here to select.
import { useState } from 'react';
import { Button, type ButtonVariant } from './ui/Button.tsx';

export function CopyPrompt({
  prompt,
  label = 'Copy this prompt',
  copied = 'Copied',
  variant,
  arrow,
  bare,
  originIn,
}: {
  prompt: string;
  label?: string;
  /** The button's words once it has copied. */
  copied?: string;
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
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        originIn ? prompt.replaceAll(originIn, window.location.origin) : prompt,
      );
      setState('copied');
    } catch {
      if (bare && bare !== true) window.location.assign(bare.readHref);
      else setState('failed');
    }
  }
  const button = (
    <Button variant={variant} arrow={arrow} onClick={() => void copy()}>
      {state === 'copied' ? copied : label}
    </Button>
  );
  if (bare && state !== 'failed') return button;
  return (
    <div className="box">
      <pre>{prompt}</pre>
      {button}
      {state === 'failed' && <span className="muted"> Couldn't copy: select the text above.</span>}
    </div>
  );
}
