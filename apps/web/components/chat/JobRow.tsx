// A job Petals' agent handed to one of the person's own agents, in the chat (C): one line saying who it
// went to and where it stands, and what the agent said when it reported. Props only. Words from
// lib/jobs.ts, drafts.
export function JobRow({ text, summary }: { text: string; summary?: string | undefined }) {
  return (
    <div className="flex flex-col items-start gap-space-4 border-l border-hairline pl-text-gap">
      <p className="my-0 type-ui">{text}</p>
      {summary && <p className="my-0 type-ui text-muted">{summary}</p>}
    </div>
  );
}
