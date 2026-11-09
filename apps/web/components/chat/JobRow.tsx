// A job Petals' agent handed to the person's own agent, in the chat (C): one line saying where it stands,
// and what it said when it reported. Props only. Words from lib/jobs.ts, proposed.
export function JobRow({ text, summary }: { text: string; summary?: string | undefined }) {
  return (
    <div className="flex flex-col gap-space-4 border-l border-hairline pl-text-gap">
      <p className="my-0 type-label">{text}</p>
      {summary && <p className="my-0 type-caption text-muted">{summary}</p>}
    </div>
  );
}
