// A job Petals' agent handed to one of the person's own agents, in the chat (C): one line saying who it
// went to and where it stands, what the agent said when it reported, the way to the job's own
// conversation (swarm.md, step 2), and the person's say over it (step 3): when its worker was last heard
// from, Stop, Send it again, Hand it to another agent. Props only. Words from lib/jobs.ts.
import { type JobControlsView, jobWords } from '../../lib/jobs.ts';
import { Button } from '../ui/Button.tsx';
import { Field } from '../ui/Field.tsx';
import { Mono } from '../ui/Mono.tsx';
import { TextLink } from '../ui/TextLink.tsx';

export function JobRow({
  text,
  summary,
  conversation,
  controls,
}: {
  text: string;
  summary?: string | undefined;
  /** The job's own conversation, opened in place. */
  conversation?: string | undefined;
  /** The person's moves on it, and when its worker was last heard from. */
  controls?: JobControlsView | undefined;
}) {
  const moves = controls?.moves;
  const any = moves && (moves.stop || moves.retry || moves.handOver);
  return (
    <div className="flex flex-col items-start gap-space-4 border-l border-hairline pl-text-gap">
      <p className="my-0 type-ui">{text}</p>
      {summary && <p className="my-0 type-ui text-muted">{summary}</p>}
      {controls?.heard && (
        <Mono as="span" tone="muted">
          {controls.heard}
        </Mono>
      )}
      {conversation && (
        <TextLink variant="quiet" href={conversation} inPlace>
          {jobWords.conversation}
        </TextLink>
      )}
      {controls && any && !controls.picking && (
        <div className="flex flex-wrap items-center gap-x-text-gap">
          {moves.stop && (
            <Button variant="quiet" disabled={controls.busy} onClick={controls.actions.stop}>
              {jobWords.stop}
            </Button>
          )}
          {moves.retry && (
            <Button variant="quiet" disabled={controls.busy} onClick={controls.actions.retry}>
              {jobWords.retry}
            </Button>
          )}
          {moves.handOver && (
            <Button variant="quiet" disabled={controls.busy} onClick={controls.actions.pick}>
              {jobWords.handTo}
            </Button>
          )}
        </div>
      )}
      {controls?.picking?.choices && (
        <div className="flex w-full flex-col gap-space-8">
          <Field
            id="job-hand-to"
            label={jobWords.pick}
            value={controls.picking.to}
            onChange={controls.actions.setTo}
            choices={[{ group: jobWords.pick, choices: controls.picking.choices }]}
            none=""
            scale="app"
          />
          <div>
            <Button
              variant="compact"
              disabled={controls.busy || !controls.picking.to}
              onClick={controls.actions.handOver}
            >
              {jobWords.handOver}
            </Button>
          </div>
        </div>
      )}
      {controls?.failed && <p className="error my-0">{controls.failed}</p>}
    </div>
  );
}
