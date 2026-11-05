'use client';
// Composer's handlers go on DOM elements, which can't cross from a server page, so its lab states
// render from here. It's fixed to the window in use: the transform makes this stage its containing
// block, so each state stays in its own box. Nothing is sent.
import { Composer } from '../components/chat/Composer.tsx';
import type { ComposerView } from '../lib/thread-view.ts';

export function LabComposer({ view }: { view: ComposerView }) {
  return (
    <div className="w-full transform-gpu pt-column-gap">
      <div className="h-section-padding" />
      <Composer view={view} onChange={() => {}} onSend={() => {}} />
    </div>
  );
}
