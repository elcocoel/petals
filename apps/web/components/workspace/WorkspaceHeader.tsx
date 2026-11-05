// Figma's "Workspace header" 39:863: the wordmark, a rule, and where you are.
import { Wordmark } from '../ui/Wordmark.tsx';

export function WorkspaceHeader({ section }: { section: string }) {
  return (
    <header className="flex h-workspace-header-height shrink-0 items-center gap-block-gap border-b border-hairline pl-block-gap">
      <a href="/" aria-label="Petals, home">
        <Wordmark size="workspace" />
      </a>
      <span aria-hidden="true" className="h-workspace-rule w-px bg-hairline" />
      <p className="type-label">{section}</p>
    </header>
  );
}
