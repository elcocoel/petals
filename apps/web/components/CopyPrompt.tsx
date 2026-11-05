'use client';
// One click, then paste into any agent (lib/agent-prompt.ts).
import { useState } from 'react';
import { Button } from './ui/Button.tsx';

export function CopyPrompt({
  prompt,
  label = 'Copy this prompt',
}: {
  prompt: string;
  label?: string;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setState('copied');
    } catch {
      setState('failed');
    }
  }
  return (
    <div className="box">
      <pre>{prompt}</pre>
      <Button onClick={() => void copy()}>{state === 'copied' ? 'Copied' : label}</Button>
      {state === 'failed' && <span className="muted"> Couldn't copy: select the text above.</span>}
    </div>
  );
}
