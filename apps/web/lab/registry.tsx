// Every component, in every state props can reach, from saved fixtures (T176). figmaName and
// figmaNode are how an agent finds the matching frame by hand; null means Figma has none yet. A test
// holds this list to what components/ exports (apps/web/test/lab-registry.test.ts).
//
// QuotePanel, PublishFlow, CopyPrompt and Flower still keep their later states in hooks, so only the
// first state shows here until they take them as props, as the chat's views do. Their controls are
// live on the page.
import type { SurfaceName } from '@petal/tokens';
import { surfaceNames } from '@petal/tokens';
import type { ReactNode } from 'react';
import { CopyPrompt } from '../components/CopyPrompt.tsx';
import { AnsweredBy } from '../components/chat/AnsweredBy.tsx';
import { FlowerCard } from '../components/chat/FlowerCard.tsx';
import { Steps } from '../components/chat/Steps.tsx';
import { Thread } from '../components/chat/Thread.tsx';
import { Flower } from '../components/Flower.tsx';
import { FlowerSheet } from '../components/FlowerSheet.tsx';
import { Interpretation, SignatureLine } from '../components/Interpretation.tsx';
import { Legend } from '../components/Legend.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { PetalDetails } from '../components/PetalDetails.tsx';
import { PublishFlow } from '../components/PublishFlow.tsx';
import { QuotePanel } from '../components/QuotePanel.tsx';
import { SourceList } from '../components/Sources.tsx';
import { AskBox } from '../components/ui/AskBox.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Eyebrow } from '../components/ui/Eyebrow.tsx';
import { Surface } from '../components/ui/Surface.tsx';
import { TextLink } from '../components/ui/TextLink.tsx';
import { Wordmark } from '../components/ui/Wordmark.tsx';
import { parseMarkdown } from '../lib/markdown.ts';
import { openingMessage } from '../lib/opening.ts';
import type { Done } from '../lib/thread.ts';
import { answeredBy, composerView, threadView } from '../lib/thread-view.ts';
import {
  entry,
  flowerRow,
  golden,
  MARKDOWN,
  petal,
  prepared,
  STEPS,
  signature,
  TURN_ROWS,
} from './fixtures.ts';
import { LabComposer } from './LabComposer.tsx';

export interface LabState {
  name: string;
  render: () => ReactNode;
  /** Set when this state is its own component in Figma. */
  figmaName?: string;
  figmaNode?: string;
  /** Takes the whole width instead of sitting in a row with the others. */
  wide?: boolean;
}

export interface LabEntry {
  id: string;
  group: 'Primitives' | 'The conversation' | 'The flower' | 'Reading' | 'Actions';
  figmaName: string | null;
  figmaNode: string | null;
  source: string;
  /** Where it's shown. Ground alone unless the surface matters. */
  surfaces?: readonly SurfaceName[];
  states: LabState[];
}

const SOURCE_URLS = { 'fastnear-rpc-validators': 'https://rpc.fastnear.com' };
const STARTER = { figmaName: 'Petals / Starter question', figmaNode: '52:1866' };
const SECONDARY = { figmaName: 'Petals / Button secondary', figmaNode: '52:1869' };

const DONE: Done = {
  turns: 3,
  model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
  fallback_used: false,
  tokens: { in: 0, out: 0 },
  cost_usd: 0.0012,
};
const atRest = { question: '', runId: null, busy: false, recorded: false };
const drawn = () => {
  const { svg, petals } = golden('near-validators-default').rendered;
  return { svg, petals };
};
const inTurn = (turn: Parameters<typeof threadView>[0]['turn'], busy = true, lostAgain = false) =>
  threadView({ items: [], busy, runId: 'run', turn, lostAgain, recorded: false });

export const registry: LabEntry[] = [
  {
    id: 'Button',
    group: 'Primitives',
    figmaName: 'Petals / Button',
    figmaNode: '23:161',
    source: 'apps/web/components/ui/Button.tsx',
    surfaces: surfaceNames,
    states: [
      { name: 'primary', render: () => <Button>Explore</Button> },
      { name: 'primary, arrow', render: () => <Button arrow>Ask</Button> },
      { name: 'primary, link', render: () => <Button href="#button">Explore</Button> },
      { name: 'primary, disabled', render: () => <Button disabled>Explore</Button> },
      {
        name: 'secondary',
        ...SECONDARY,
        render: () => <Button variant="secondary">Support Petals</Button>,
      },
      {
        name: 'secondary, link',
        ...SECONDARY,
        render: () => (
          <Button variant="secondary" href="#button">
            Support Petals
          </Button>
        ),
      },
      {
        name: 'secondary, disabled',
        ...SECONDARY,
        render: () => (
          <Button variant="secondary" disabled>
            Support Petals
          </Button>
        ),
      },
      {
        name: 'starter',
        ...STARTER,
        render: () => <Button variant="starter">Who decides in this DAO?</Button>,
      },
      {
        name: 'starter, link',
        ...STARTER,
        render: () => (
          <Button variant="starter" href="#button">
            Who decides in this DAO?
          </Button>
        ),
      },
    ],
  },
  {
    id: 'TextLink',
    group: 'Primitives',
    figmaName: 'Petals / Link',
    figmaNode: '23:159',
    source: 'apps/web/components/ui/TextLink.tsx',
    surfaces: surfaceNames,
    states: [{ name: 'default', render: () => <TextLink href="#textlink">Explore</TextLink> }],
  },
  {
    id: 'Wordmark',
    group: 'Primitives',
    figmaName: 'Petals / Wordmark',
    figmaNode: '12:12',
    source: 'apps/web/components/ui/Wordmark.tsx',
    surfaces: surfaceNames,
    states: [
      { name: 'nav', render: () => <Wordmark /> },
      { name: 'display', wide: true, render: () => <Wordmark size="display" /> },
    ],
  },
  {
    id: 'AskBox',
    group: 'Primitives',
    figmaName: 'Petals / Ask box',
    figmaNode: '52:1861',
    source: 'apps/web/components/ui/AskBox.tsx',
    surfaces: surfaceNames,
    states: [
      {
        name: 'empty',
        wide: true,
        render: () => (
          <AskBox label="Ask" placeholder="Ask about any network, or paste an address." />
        ),
      },
      {
        name: 'filled',
        wide: true,
        render: () => (
          <AskBox
            label="Ask"
            placeholder="Ask about any network, or paste an address."
            defaultValue="Who decides in NEAR’s House of Stake?"
          />
        ),
      },
      {
        name: 'disabled',
        wide: true,
        render: () => (
          <AskBox label="Ask" placeholder="Ask about any network, or paste an address." disabled />
        ),
      },
    ],
  },
  {
    id: 'Eyebrow',
    group: 'Primitives',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Eyebrow.tsx',
    surfaces: surfaceNames,
    states: [
      { name: 'default', render: () => <Eyebrow>01 ONE PETAL HOLDS 18% OF THE SAY</Eyebrow> },
    ],
  },
  {
    id: 'Surface',
    group: 'Primitives',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Surface.tsx',
    states: surfaceNames.map((kind) => ({
      name: kind,
      render: () => (
        <Surface kind={kind} className="border border-hairline p-block-gap">
          The {kind} surface
        </Surface>
      ),
    })),
  },
  {
    id: 'Thread',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/Thread.tsx',
    states: [
      {
        name: 'a whole turn',
        wide: true,
        render: () => (
          <Thread
            rows={[...TURN_ROWS, flowerRow()]}
            renderFlower={(row) => (
              <FlowerCard key={row.key} row={row} drawn={drawn()} failed={null} />
            )}
          />
        ),
      },
      {
        name: 'an error',
        wide: true,
        render: () => (
          <Thread
            rows={[{ kind: 'error', key: 'error', text: 'code: A message from the run.' }]}
            renderFlower={() => null}
          />
        ),
      },
      ...(['sending', 'accepted', 'working'] as const).map((turn) => ({
        name: turn,
        wide: true,
        render: () => <Thread rows={inTurn(turn)} renderFlower={() => null} />,
      })),
      {
        name: 'lost',
        wide: true,
        render: () => <Thread rows={inTurn('lost', false)} renderFlower={() => null} />,
      },
      {
        name: 'lost, following again',
        wide: true,
        render: () => <Thread rows={inTurn('lost')} renderFlower={() => null} />,
      },
      {
        name: 'lost twice',
        wide: true,
        render: () => <Thread rows={inTurn('lost', false, true)} renderFlower={() => null} />,
      },
    ],
  },
  {
    id: 'Composer',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/Composer.tsx',
    states: [
      { name: 'empty', wide: true, render: () => <LabComposer view={composerView(atRest)} /> },
      {
        name: 'typing',
        wide: true,
        render: () => (
          <LabComposer view={composerView({ ...atRest, question: 'Who decides in this DAO?' })} />
        ),
      },
      {
        name: 'working',
        wide: true,
        render: () => <LabComposer view={composerView({ ...atRest, busy: true })} />,
      },
      {
        name: 'a follow-up, with the run’s link',
        wide: true,
        render: () => <LabComposer view={composerView({ ...atRest, runId: 'run-id' })} />,
      },
      {
        name: 'recorded',
        wide: true,
        render: () => <LabComposer view={composerView({ ...atRest, recorded: true })} />,
      },
    ],
  },
  {
    id: 'Steps',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/Steps.tsx',
    states: [
      {
        name: 'each kind',
        wide: true,
        render: () => <Steps summary="2 tool calls" steps={STEPS} />,
      },
    ],
  },
  {
    id: 'FlowerCard',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/FlowerCard.tsx',
    states: [
      {
        name: 'drawing',
        wide: true,
        render: () => <FlowerCard row={flowerRow()} drawn={null} failed={null} />,
      },
      {
        name: 'could not be drawn',
        wide: true,
        render: () => (
          <FlowerCard row={flowerRow()} drawn={null} failed="A message from the run." />
        ),
      },
      {
        name: 'drawn, with its links',
        wide: true,
        render: () => <FlowerCard row={flowerRow()} drawn={drawn()} failed={null} />,
      },
      {
        name: 'drawn, already linked from the answer',
        wide: true,
        render: () => (
          <FlowerCard
            row={flowerRow({ showLink: false, publishUrl: undefined })}
            drawn={drawn()}
            failed={null}
          />
        ),
      },
    ],
  },
  {
    id: 'AnsweredBy',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/AnsweredBy.tsx',
    states: [
      {
        name: 'recorded',
        wide: true,
        render: () => <AnsweredBy line={answeredBy({ ...DONE, model: 'recorded' }, null)} />,
      },
      {
        name: 'no model',
        wide: true,
        render: () => <AnsweredBy line={answeredBy({ ...DONE, turns: 0 }, null)} />,
      },
      {
        name: 'no signature',
        wide: true,
        render: () => <AnsweredBy line={answeredBy(DONE, null)} />,
      },
      {
        name: 'an enclave signature',
        wide: true,
        render: () => <AnsweredBy line={answeredBy(DONE, signature())} />,
      },
      {
        name: 'a fallback model',
        wide: true,
        render: () => <AnsweredBy line={answeredBy({ ...DONE, fallback_used: true }, null)} />,
      },
    ],
  },
  {
    id: 'Flower',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/Flower.tsx',
    states: [
      {
        name: 'by kind',
        wide: true,
        render: () => {
          const { rendered } = golden('near-validators-default');
          return <Flower svg={rendered.svg} petals={rendered.petals} title="NEAR validators" />;
        },
      },
      {
        name: 'with backers',
        wide: true,
        render: () => {
          const { rendered } = golden('near-validators-backers');
          return <Flower svg={rendered.svg} petals={rendered.petals} title="NEAR validators" />;
        },
      },
      {
        name: 'unreadable SVG',
        wide: true,
        render: () => <Flower svg="this is not an svg" petals={[]} title="Broken" />,
      },
    ],
  },
  {
    id: 'FlowerSheet',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/FlowerSheet.tsx',
    states: [
      {
        name: 'House of Stake',
        wide: true,
        render: () => {
          const { spec, rendered } = golden('house-of-stake-default');
          return <FlowerSheet spec={spec} rendered={rendered} />;
        },
      },
    ],
  },
  {
    id: 'Legend',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/Legend.tsx',
    states: [
      {
        name: 'by kind, with source links',
        wide: true,
        render: () => (
          <Legend items={golden('near-validators-default').rendered.legend} sources={SOURCE_URLS} />
        ),
      },
      {
        name: 'with backers',
        wide: true,
        render: () => <Legend items={golden('near-validators-backers').rendered.legend} />,
      },
    ],
  },
  {
    id: 'PetalDetails',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/PetalDetails.tsx',
    states: [
      { name: 'nothing selected', wide: true, render: () => <PetalDetails petal={null} /> },
      {
        name: 'a named petal',
        wide: true,
        render: () => (
          <PetalDetails petal={petal('near-validators-default', (p) => p.rank === 1)} />
        ),
      },
      {
        name: 'with segments',
        wide: true,
        render: () => (
          <PetalDetails
            petal={petal('near-validators-backers', (p) => Boolean(p.segments?.length))}
          />
        ),
      },
      {
        name: 'everyone else',
        wide: true,
        render: () => (
          <PetalDetails petal={petal('near-validators-default', (p) => p.id === '__tail')} />
        ),
      },
    ],
  },
  {
    id: 'SourceList',
    group: 'Reading',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/Sources.tsx',
    states: [
      { name: 'ids', render: () => <SourceList ids={['nearblocks-validators', 'fastnear-rpc']} /> },
      {
        name: 'linked',
        render: () => <SourceList ids={['fastnear-rpc-validators']} urls={SOURCE_URLS} />,
      },
    ],
  },
  {
    id: 'Interpretation',
    group: 'Reading',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/Interpretation.tsx',
    states: [
      {
        name: 'the fixture flower',
        wide: true,
        render: () => <Interpretation reading={entry().interpretation} />,
      },
    ],
  },
  {
    id: 'SignatureLine',
    group: 'Reading',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/Interpretation.tsx',
    states: [
      { name: 'none', wide: true, render: () => <SignatureLine /> },
      { name: 'recorded, none', wide: true, render: () => <SignatureLine model="recorded" /> },
      {
        name: 'recorded, signed',
        wide: true,
        render: () => <SignatureLine signature={signature()} model="recorded" />,
      },
      { name: 'live, signed', wide: true, render: () => <SignatureLine signature={signature()} /> },
    ],
  },
  {
    id: 'Markdown',
    group: 'Reading',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/Markdown.tsx',
    states: [
      {
        name: 'every block',
        wide: true,
        render: () => <Markdown blocks={parseMarkdown(MARKDOWN)} />,
      },
      {
        name: 'the agent’s opening',
        wide: true,
        render: () => <Markdown blocks={parseMarkdown(openingMessage([]))} />,
      },
    ],
  },
  {
    id: 'QuotePanel',
    group: 'Actions',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/QuotePanel.tsx',
    states: [
      {
        name: 'a refresh',
        wide: true,
        render: () => <QuotePanel purpose="sponsor_refresh" network="near-validators" />,
      },
      { name: 'new coverage', wide: true, render: () => <QuotePanel purpose="sponsor_coverage" /> },
    ],
  },
  {
    id: 'PublishFlow',
    group: 'Actions',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/PublishFlow.tsx',
    states: [
      { name: 'not prepared yet', wide: true, render: () => <PublishFlow /> },
      { name: 'prepared', wide: true, render: () => <PublishFlow prepared={prepared()} /> },
    ],
  },
  {
    id: 'CopyPrompt',
    group: 'Actions',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/CopyPrompt.tsx',
    states: [
      {
        name: 'default',
        wide: true,
        render: () => <CopyPrompt prompt="Read https://petal-flowers.vercel.app/skill.md" />,
      },
      {
        name: 'own label',
        wide: true,
        render: () => <CopyPrompt prompt="/mcp" label="Copy the address" />,
      },
    ],
  },
];

/** Exported by components/ but not drawn here, each for a stated reason. */
export const NOT_IN_LAB: Record<string, string> = {
  AgentHome: 'a server page: it fetches, so it has no state to show from props',
  Chat: 'wires the ViewModel to its views, and each of those views is here',
};
