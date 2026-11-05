'use client';
// One click, then paste into any agent (lib/agent-prompt.ts).
import { useState } from 'react';

export function CopyPrompt({ prompt }: { prompt: string }) {
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
      <button type="button" onClick={() => void copy()}>
        {state === 'copied' ? 'Copied' : 'Copy this prompt'}
      </button>
      {state === 'failed' && <span className="muted"> Couldn't copy: select the text above.</span>}
    </div>
  );
}
