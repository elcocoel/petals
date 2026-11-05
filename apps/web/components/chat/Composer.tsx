// The box at the bottom of the conversation. It's the one AskBox; the words and decisions come from
// composerView in lib/thread-view.ts.
import type { Ref } from 'react';
import type { ComposerView } from '../../lib/thread-view.ts';
import { AskBox } from '../ui/AskBox.tsx';

export function Composer({
  view,
  boxRef,
  onChange,
  onSend,
}: {
  view: ComposerView;
  boxRef?: Ref<HTMLTextAreaElement>;
  onChange: (text: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-speech-gap pt-text-gap pr-workspace-inset-end pb-workspace-inset-end pl-workspace-inset">
      {view.about && (
        <p data-quiet className="type-mono-small text-muted">
          {view.about}
        </p>
      )}
      <AskBox
        size="composer"
        id="q"
        label={view.label}
        placeholder={view.placeholder}
        action={view.button}
        value={view.value}
        readOnly={view.readOnly}
        canAsk={!view.disabled}
        boxRef={boxRef}
        onChange={(e) => onChange(e.target.value)}
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
      />
      {view.run && (
        <p className="type-mono-small text-muted">
          Run <a href={view.run.href}>{view.run.id}</a>. You can leave and come back.
        </p>
      )}
    </div>
  );
}
