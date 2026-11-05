// The box stays fixed at the bottom.
import type { Ref } from 'react';
import type { ComposerView } from '../../lib/thread-view.ts';

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
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <div className="composer-row">
        <textarea
          ref={boxRef}
          id="q"
          rows={2}
          aria-label={view.label}
          placeholder={view.placeholder}
          value={view.value}
          readOnly={view.readOnly}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              onSend();
            }
          }}
        />
        <button type="submit" disabled={view.disabled}>
          {view.button}
        </button>
      </div>
      {view.run && (
        <p className="muted composer-note">
          Run <a href={view.run.href}>{view.run.id}</a>: you can leave and come back to this link.
        </p>
      )}
    </form>
  );
}
