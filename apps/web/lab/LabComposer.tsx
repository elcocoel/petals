'use client';
// Views whose handlers go on DOM elements, which can't cross from a server page, so their lab states
// render from here. Nothing is sent, and closing a detail closes nothing.
import type { PetalDetail } from '@petal/core/types';
import { Composer } from '../components/chat/Composer.tsx';
import { PetalDetails } from '../components/PetalDetails.tsx';
import type { ComposerView } from '../lib/thread-view.ts';

export function LabComposer({ view }: { view: ComposerView }) {
  return (
    <div className="w-full">
      <Composer view={view} onChange={() => {}} onSend={() => {}} />
    </div>
  );
}

export function LabPetalClose({ petal }: { petal: PetalDetail }) {
  return <PetalDetails petal={petal} unit="NEAR" onClose={() => {}} />;
}
