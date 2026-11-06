'use client';
// One click, then paste into any agent (lib/agent-prompt.ts). `bare` is the button alone, for a page that
// doesn't show the prompt: if the browser won't copy, it goes to where the prompt can be selected by hand.
import { useState } from 'react';
import { Button, type ButtonVariant } from './ui/Button.tsx';

export function CopyPrompt({
  prompt,
  label = 'Copy this prompt',
  variant,
  bare,
}: {
  prompt: string;
  label?: string;
  variant?: ButtonVariant;
  /** Where the prompt can be read, for when the browser won't copy. */
  bare?: { readHref: string };
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setState('copied');
    } catch {
      if (bare) window.location.assign(bare.readHref);
      else setState('failed');
    }
  }
  const button = (
    <Button variant={variant} onClick={() => void copy()}>
      {state === 'copied' ? 'Copied' : label}
    </Button>
  );
  if (bare) return button;
  return (
    <div className="box">
      <pre>{prompt}</pre>
      {button}
      {state === 'failed' && <span className="muted"> Couldn't copy: select the text above.</span>}
    </div>
  );
}
