// A job Petals' agent handed to one of the person's own agents, in the chat (C): one line saying who it
// went to and where it stands, what the agent said when it reported, and the way to the job's own
// conversation, where its work goes as it runs (swarm.md, step 2). Props only. Words from lib/jobs.ts,
// drafts.
import { jobWords } from '../../lib/jobs.ts';
import { TextLink } from '../ui/TextLink.tsx';

export function JobRow({
  text,
  summary,
  conversation,
}: {
  text: string;
  summary?: string | undefined;
  /** The job's own conversation, opened in place. */
  conversation?: string | undefined;
}) {
  return (
    <div className="flex flex-col items-start gap-space-4 border-l border-hairline pl-text-gap">
      <p className="my-0 type-ui">{text}</p>
      {summary && <p className="my-0 type-ui text-muted">{summary}</p>}
      {conversation && (
        <TextLink variant="quiet" href={conversation} inPlace>
          {jobWords.conversation}
        </TextLink>
      )}
    </div>
  );
}
