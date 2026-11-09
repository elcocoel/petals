// A job Petals' agent handed to the person's own agent, in the chat (C): one line saying where it stands,
// what it said when it reported, and while it's open, the way to hand it over: a line to paste into your
// agent. Props only: viewmodels/useJobs.ts holds the jobs and the copy. Words from lib/jobs.ts, drafts.
import { jobWords } from '../../lib/jobs.ts';
import { Button } from '../ui/Button.tsx';

export function JobRow({
  text,
  summary,
  open = false,
  copied = false,
  onCopy,
}: {
  text: string;
  summary?: string | undefined;
  /** Nobody has taken it yet, so it can be handed over. */
  open?: boolean;
  copied?: boolean;
  onCopy?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-space-4 border-l border-hairline pl-text-gap">
      <p className="my-0 type-label">{text}</p>
      {summary && <p className="my-0 type-caption text-muted">{summary}</p>}
      {open && onCopy && (
        <Button variant="pill" onClick={onCopy}>
          {copied ? jobWords.copied : jobWords.copy}
        </Button>
      )}
    </div>
  );
}
