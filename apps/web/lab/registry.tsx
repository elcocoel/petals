// Every component, in every state props can reach, from saved fixtures (T176). figmaName and
// figmaNode are how an agent finds the matching frame by hand; null means Figma has none yet. A test
// holds this list to what components/ exports (apps/web/test/lab-registry.test.ts).
//
// Biggest first, in the page's order: Sections, Blocks, Controls and Marks are what the landing page's
// imports reach; the other groups aren't on it and stay closed on the page. So does any state the landing
// doesn't draw: it's registered here with its component, and `closedIn` says where it's drawn.
//
// QuotePanel, PublishFlow, CopyPrompt and Flower still keep their later states in hooks, so only the
// first state shows here until they take them as props, as the chat's views do. Their controls are
// live on the page.
import type { SurfaceName } from '@petal/tokens';
import { surfaceNames } from '@petal/tokens';
import type { ReactNode } from 'react';
import { AgentKeyCopy } from '../components/AgentKeyCopy.tsx';
import { CopyPrompt } from '../components/CopyPrompt.tsx';
import { AnsweredBy } from '../components/chat/AnsweredBy.tsx';
import { ConnectWallet } from '../components/chat/ConnectWallet.tsx';
import { ConversationList } from '../components/chat/ConversationList.tsx';
import { JobRow } from '../components/chat/JobRow.tsx';
import { ModelOptions } from '../components/chat/ModelOptions.tsx';
import { PayRow } from '../components/chat/PayRow.tsx';
import { Speech } from '../components/chat/Speech.tsx';
import { Steps } from '../components/chat/Steps.tsx';
import { Thread } from '../components/chat/Thread.tsx';
import { TurnFlower } from '../components/chat/TurnFlower.tsx';
import { TurnStatus } from '../components/chat/TurnStatus.tsx';
import { WhoIsHere } from '../components/chat/WhoIsHere.tsx';
import { Flower } from '../components/Flower.tsx';
import { FlowerSheet } from '../components/FlowerSheet.tsx';
import { FlowerTile } from '../components/FlowerTile.tsx';
import { Interpretation, SignatureLine } from '../components/Interpretation.tsx';
import { Legend, LegendKeys } from '../components/Legend.tsx';
import { AnnotatedFlower } from '../components/landing/AnnotatedFlower.tsx';
import { BackIt } from '../components/landing/BackIt.tsx';
import { BuildWithUs } from '../components/landing/BuildWithUs.tsx';
import { GallerySection } from '../components/landing/GallerySection.tsx';
import { Hero } from '../components/landing/Hero.tsx';
import { HowItWorks } from '../components/landing/HowItWorks.tsx';
import { LiveReading } from '../components/landing/LiveReading.tsx';
import { Questions } from '../components/landing/Questions.tsx';
import { Step } from '../components/landing/Step.tsx';
import { UseAnywhere } from '../components/landing/UseAnywhere.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { PetalDetails } from '../components/PetalDetails.tsx';
import { PublishFlow } from '../components/PublishFlow.tsx';
import { QuotePanel } from '../components/QuotePanel.tsx';
import { SourceList } from '../components/Sources.tsx';
import { ActionRow } from '../components/ui/ActionRow.tsx';
import { AskBlock } from '../components/ui/AskBlock.tsx';
import { AskBox } from '../components/ui/AskBox.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { BarBox } from '../components/ui/BarBox.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Callout } from '../components/ui/Callout.tsx';
import { Card } from '../components/ui/Card.tsx';
import { Drawing } from '../components/ui/Drawing.tsx';
import { EmptySlot } from '../components/ui/EmptySlot.tsx';
import { FaqItem } from '../components/ui/FaqItem.tsx';
import { Footer } from '../components/ui/Footer.tsx';
import { GalleryCard } from '../components/ui/GalleryCard.tsx';
import { Icon, type IconName } from '../components/ui/Icon.tsx';
import { IconButton } from '../components/ui/IconButton.tsx';
import { MetaRow } from '../components/ui/MetaRow.tsx';
import { Mono } from '../components/ui/Mono.tsx';
import { Nav } from '../components/ui/Nav.tsx';
import { NavItem } from '../components/ui/NavItem.tsx';
import { RowField } from '../components/ui/RowField.tsx';
import { Section } from '../components/ui/Section.tsx';
import { SectionHead } from '../components/ui/SectionHead.tsx';
import { Terminal } from '../components/ui/Terminal.tsx';
import { TextLink } from '../components/ui/TextLink.tsx';
import { Transcript } from '../components/ui/Transcript.tsx';
import { Wordmark } from '../components/ui/Wordmark.tsx';
import { FlowerShelf } from '../components/workspace/FlowerShelf.tsx';
import { Funds } from '../components/workspace/Funds.tsx';
import { Profile } from '../components/workspace/Profile.tsx';
import { ProfileHead } from '../components/workspace/ProfileHead.tsx';
import { ReadingKey } from '../components/workspace/ReadingKey.tsx';
import { FlowerPanel } from '../flower/FlowerPanel.tsx';
import type { DrawingKind } from '../lib/figures.ts';
import { readingKey, svgImage } from '../lib/flower-view.ts';
import { landingCopy } from '../lib/landing-copy.ts';
import { parseMarkdown } from '../lib/markdown.ts';
import { openingMessage } from '../lib/opening.ts';
import { flowerPanelView, type PanelFlower, shelfView } from '../lib/panel-view.ts';
import type { Done } from '../lib/thread.ts';
import { answeredBy, composerView, type TurnRow, threadView } from '../lib/thread-view.ts';
import {
  entry,
  flowerRow,
  golden,
  MARKDOWN,
  petal,
  prepared,
  STEPS,
  signature,
  specimen,
  TURN_ROWS,
} from './fixtures.ts';
import { LabComposer, LabPetalClose } from './LabComposer.tsx';
import { LabAction, LabAgent, LabFold, LabProject, LabRail } from './LabPanel.tsx';
import { PANEL_STATES } from './panel-fixtures.ts';

export interface LabState {
  name: string;
  render: () => ReactNode;
  /** Set when this state is its own component in Figma. */
  figmaName?: string;
  figmaNode?: string;
  /** Takes the whole width instead of sitting in a row with the others. */
  wide?: boolean;
  /** The surfaces the landing page draws this on. Ground alone unless it says so. */
  surfaces?: readonly SurfaceName[];
  /** The landing page doesn't draw this state, so it's drawn in this closed group instead. */
  closedIn?: ClosedGroup;
}

export type ClosedGroup =
  | 'The workspace'
  | 'The conversation'
  | 'The flower'
  | 'Reading'
  | 'Actions';

export interface LabEntry {
  id: string;
  group: 'Sections' | 'Blocks' | 'Controls' | 'Marks' | ClosedGroup;
  figmaName: string | null;
  figmaNode: string | null;
  source: string;
  states: LabState[];
}

const SOURCE_URLS = { 'fastnear-rpc-validators': 'https://rpc.fastnear.com' };
const STARTER = { figmaName: 'Petals / Starter question', figmaNode: '52:1866' };
const SECONDARY = { figmaName: 'Petals / Button secondary', figmaNode: '52:1869' };

/** Every drawing once, at a size the landing page draws it. */
const KINDS: {
  kind: DrawingKind;
  size: 'fill' | 48 | 72 | 144 | 240;
  name: string;
  figmaName: string;
  node: string;
}[] = [
  { kind: 'hero-flower', size: 240, name: 'the hero flower', figmaName: 'Flower', node: '66:2207' },
  {
    kind: 'hero-leaders',
    size: 240,
    name: 'the hero’s leader lines',
    figmaName: 'Leaders',
    node: '66:2215',
  },
  {
    kind: 'reading-flower',
    size: 240,
    name: 'the reading flower',
    figmaName: 'Flower',
    node: '66:2234',
  },
  { kind: 'blocs', size: 240, name: 'Blocs', figmaName: 'Petals / Thumb / Blocs', node: '56:1945' },
  { kind: 'even', size: 144, name: 'Even', figmaName: 'Petals / Thumb / Even', node: '56:1939' },
  { kind: 'tower', size: 72, name: 'Tower', figmaName: 'Petals / Thumb / Tower', node: '56:1934' },
  {
    kind: 'concentration',
    size: 144,
    name: 'Concentration',
    figmaName: 'Petals / Glyph / Concentration',
    node: '54:1886',
  },
  { kind: 'flows', size: 48, name: 'Flows', figmaName: 'Petals / Glyph / Flows', node: '54:1892' },
  { kind: 'bloc', size: 48, name: 'Bloc', figmaName: 'Petals / Glyph / Bloc', node: '54:1897' },
  {
    kind: 'same-hands',
    size: 48,
    name: 'Same hands',
    figmaName: 'Petals / Glyph / Same hands',
    node: '54:1902',
  },
  {
    kind: 'empty-quorum',
    size: 48,
    name: 'Empty quorum',
    figmaName: 'Petals / Glyph / Empty quorum',
    node: '54:1906',
  },
  {
    kind: 'payout',
    size: 48,
    name: 'Payout',
    figmaName: 'Petals / Glyph / Payout',
    node: '54:1912',
  },
  { kind: 'cell', size: 240, name: 'the cell', figmaName: 'Petals / Cell', node: '12:16' },
  {
    kind: 'cell-repeat',
    size: 240,
    name: 'the cell, repeated',
    figmaName: 'Petals / Cell repeat',
    node: '24:209',
  },
];
const ASK = landingCopy.hero.ask;
const FAQ = landingCopy.questions.items[0];
const FIGURE = specimen.transcript;
const TERMINAL = specimen.terminal;
/** A section of the landing page: a frame in Figma, not a component, so its node is on the state. */
const section = (
  id: string,
  source: string,
  frame: string,
  node: string,
  render: () => ReactNode,
): LabEntry => ({
  id,
  group: 'Sections',
  figmaName: null,
  figmaNode: null,
  source,
  states: [{ name: 'as designed', wide: true, figmaName: frame, figmaNode: node, render }],
});

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
const turnRow = (turn: Parameters<typeof threadView>[0]['turn'], o: Partial<TurnRow> = {}) =>
  ({ ...(inTurn(turn, false)[0] as TurnRow), ...o }) as TurnRow;

const ONE_PETAL = { figmaName: 'Make a flower / One petal', figmaNode: '39:862' };

/** A map, one per address, as GET /api/v1/maps gives it. */
const LISTED = [
  {
    id: 'near:validators',
    name: 'NEAR validators',
    title: 'NEAR validators',
    about: 'validators on NEAR',
    chain: 'near:mainnet',
    address: null,
    picture:
      '/api/v1/map/897a01ac9a1f1150e84dbb7aa7baebffa14d2f8674a882e1fcc9016f259a7e04/svg?look=render%2Fv2',
    view_url: '/d/897a01ac9a1f1150e84dbb7aa7baebffa14d2f8674a882e1fcc9016f259a7e04',
    keys: [],
    readings: [
      {
        snapshot: '72a6d9676d967d63712dc82bcbb90282d2f61e5ca6495c3e2e54a4f9af77e9ec',
        as_of: '2026-11-03T19:42:00Z',
        network: 'near-validators',
        about: 'validators on NEAR',
        title: 'NEAR validators',
        count: 8487,
        made_by: 'mapping.petals.near',
        drawings: [],
      },
    ],
  },
];

/** A stored flower as the panel gets it, from the fixtures. */
const panelFlower = (): PanelFlower => {
  const { spec, rendered } = golden('near-validators-default');
  return {
    key: rendered.spec_sha256,
    spec,
    legend: rendered.legend,
    interpretation: entry().interpretation,
    signature: null,
    model: 'recorded',
    checks: 'Checks passed',
    viewUrl: '#flowerpanel',
    publishUrl: '#flowerpanel',
    earlier: false,
  };
};
const panelView = (selected: string | null = null) =>
  flowerPanelView({
    flower: panelFlower(),
    drawing: drawn(),
    selected,
    sources: SOURCE_URLS,
    units: { validator_stake_current_epoch: 'NEAR' },
  });
const RAIL_ICONS: IconName[] = [
  'home',
  'plus',
  'gallery',
  'connect',
  'sidebar',
  'project',
  'chevron',
  'close',
  'petals',
  'agent',
];

export const registry: LabEntry[] = [
  {
    id: 'Nav',
    group: 'Sections',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Nav.tsx',
    states: [
      {
        name: 'the one nav',
        wide: true,
        figmaName: 'Nav',
        figmaNode: '66:2181',
        render: () => <Nav />,
      },
    ],
  },
  section('Hero', 'apps/web/components/landing/Hero.tsx', 'Hero', '66:2188', () => <Hero />),
  section(
    'LiveReading',
    'apps/web/components/landing/LiveReading.tsx',
    'A flower, already read',
    '66:2232',
    () => <LiveReading />,
  ),
  section(
    'HowItWorks',
    'apps/web/components/landing/HowItWorks.tsx',
    'How it works',
    '66:2268',
    () => <HowItWorks />,
  ),
  section(
    'UseAnywhere',
    'apps/web/components/landing/UseAnywhere.tsx',
    'Closing ask',
    '66:2336',
    () => <UseAnywhere />,
  ),
  section(
    'GallerySection',
    'apps/web/components/landing/GallerySection.tsx',
    'The Power Map',
    '66:2303',
    () => <GallerySection />,
  ),
  section(
    'Questions',
    'apps/web/components/landing/Questions.tsx',
    'Questions Petals answers',
    '66:2289',
    () => <Questions />,
  ),
  section(
    'BackIt',
    'apps/web/components/landing/BackIt.tsx',
    'Join the community',
    '66:2346',
    () => <BackIt />,
  ),
  section(
    'BuildWithUs',
    'apps/web/components/landing/BuildWithUs.tsx',
    'For builders',
    '66:2316',
    () => <BuildWithUs />,
  ),
  {
    id: 'Footer',
    group: 'Sections',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Footer.tsx',
    states: [
      {
        name: 'the footer',
        wide: true,
        figmaName: 'Footer',
        figmaNode: '66:2360',
        render: () => <Footer />,
      },
    ],
  },
  {
    id: 'GalleryCard',
    group: 'Blocks',
    figmaName: 'Petals / Atlas card',
    figmaNode: '52:1876',
    source: 'apps/web/components/ui/GalleryCard.tsx',
    states: [
      ...specimen.cards.map((card, i) => ({
        name: card.title,
        render: () => (
          <GalleryCard
            thumb={(['blocs', 'even', 'tower'] as const)[i] ?? 'even'}
            href="#gallerycard"
            {...card}
          />
        ),
      })),
      {
        name: 'a picture only',
        render: () => (
          <GalleryCard thumb="even" label={landingCopy.gallery.open} href="#gallerycard" />
        ),
      },
    ],
  },
  {
    id: 'FaqItem',
    group: 'Blocks',
    figmaName: 'Petals / FAQ item',
    figmaNode: '67:2538',
    source: 'apps/web/components/ui/FaqItem.tsx',
    states: [
      {
        name: 'open',
        wide: true,
        render: () => <FaqItem glyph="concentration" {...FAQ} />,
      },
      {
        name: 'closed',
        wide: true,
        render: () => <FaqItem glyph="concentration" {...FAQ} open={false} />,
      },
    ],
  },
  {
    id: 'Step',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/landing/Step.tsx',
    states: [
      {
        name: 'with a picture',
        figmaName: 'Step 02',
        figmaNode: '66:2279',
        render: () => {
          const see = landingCopy.howItWorks.steps[1];
          return (
            <Step {...see}>
              <Drawing kind="even" size={144} />
            </Step>
          );
        },
      },
    ],
  },
  {
    id: 'Callout',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Callout.tsx',
    states: [
      {
        name: 'with an action',
        figmaName: 'Agent line',
        figmaNode: '66:2228',
        render: () => (
          <Callout
            who={specimen.callout.who}
            action={{ label: specimen.callout.action, href: '#callout' }}
          >
            {specimen.callout.text}
          </Callout>
        ),
      },
      {
        name: 'compact, without one',
        figmaName: 'Callout',
        figmaNode: '67:2529',
        render: () => (
          <Callout size="compact" who={specimen.you.who}>
            {specimen.you.text}
          </Callout>
        ),
      },
    ],
  },
  {
    id: 'Transcript',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Transcript.tsx',
    states: [
      {
        name: 'three lines and the cursor',
        wide: true,
        figmaName: 'Transcript',
        figmaNode: '66:2248',
        render: () => <Transcript {...FIGURE} />,
      },
    ],
  },
  {
    id: 'BarBox',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/BarBox.tsx',
    states: [
      {
        name: 'the glass of a box over a canvas',
        surfaces: ['ground', 'ink'],
        wide: true,
        closedIn: 'The conversation',
        render: () => (
          <BarBox
            kind="float"
            className="bg-surface"
            bar={<MetaRow start={TERMINAL.start} end={TERMINAL.end} />}
          >
            <p className="px-block-gap py-space-16 type-mono-code">{TERMINAL.lines[0]?.text}</p>
          </BarBox>
        ),
      },
    ],
  },
  {
    id: 'Terminal',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Terminal.tsx',
    states: [
      {
        name: 'each kind of line',
        surfaces: ['ink'],
        wide: true,
        figmaName: 'Terminal',
        figmaNode: '66:2325',
        render: () => <Terminal {...TERMINAL} />,
      },
    ],
  },
  {
    id: 'AskBlock',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/AskBlock.tsx',
    states: [
      {
        name: 'with a label',
        wide: true,
        render: () => (
          <AskBlock
            placeholder={ASK.placeholders[0]}
            label={ASK.label}
            action={ASK.action}
            starterLabel={landingCopy.hero.starterLabel}
            starters={landingCopy.hero.starters}
          />
        ),
      },
      {
        name: 'without one',
        surfaces: ['mint'],
        wide: true,
        render: () => (
          <AskBlock
            placeholder={ASK.placeholders[0]}
            label={ASK.label}
            action={ASK.action}
            starters={landingCopy.hero.starters.slice(0, 2)}
          />
        ),
      },
    ],
  },
  {
    id: 'SectionHead',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/SectionHead.tsx',
    states: [
      {
        name: 'display',
        wide: true,
        figmaName: 'Pitch',
        figmaNode: '66:2189',
        render: () => (
          <SectionHead
            size="display"
            eyebrow={landingCopy.hero.eyebrow}
            title={landingCopy.hero.title}
            body={landingCopy.hero.body}
          />
        ),
      },
      {
        name: 'compact, title alone',
        surfaces: ['mint'],
        wide: true,
        figmaName: 'Ask',
        figmaNode: '66:2337',
        render: () => <SectionHead size="compact" title={landingCopy.useAnywhere.title} />,
      },
      {
        name: 'panel: a group in the side panel',
        closedIn: 'The workspace',
        render: () => <SectionHead size="panel" title="Projects" />,
      },
      {
        name: 'title, with a paragraph',
        surfaces: ['ground', 'ink'],
        wide: true,
        figmaName: 'Intro',
        figmaNode: '66:2290',
        render: () => (
          <SectionHead
            eyebrow={specimen.head.eyebrow}
            title={landingCopy.useAnywhere.title}
            body={landingCopy.useAnywhere.body}
          />
        ),
      },
      {
        name: 'title, no paragraph',
        wide: true,
        render: () => (
          <SectionHead eyebrow={specimen.head.eyebrow} title={landingCopy.gallery.title} />
        ),
      },
    ],
  },
  {
    id: 'Section',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Section.tsx',
    states: [
      ...surfaceNames.map((kind) => ({
        name: kind,
        wide: true,
        render: () => (
          <Section kind={kind} padding="bar">
            <Mono>{specimen.caption}</Mono>
          </Section>
        ),
      })),
      {
        name: 'split',
        wide: true,
        render: () => (
          <Section padding="bar" layout="split">
            <Mono>{specimen.figureCaption}</Mono>
            <Mono>{specimen.caption}</Mono>
          </Section>
        ),
      },
      {
        name: 'split, figure first',
        wide: true,
        render: () => (
          <Section padding="bar" layout="split" figure="start">
            <Mono>{specimen.figureCaption}</Mono>
            <Mono>{specimen.caption}</Mono>
          </Section>
        ),
      },
      {
        name: 'columns',
        wide: true,
        render: () => (
          <Section
            padding="bar"
            layout="columns"
            head={<Mono>{specimen.head.eyebrow}</Mono>}
            foot={<Mono>{specimen.caption}</Mono>}
          >
            {specimen.cards.map((card) => (
              <Mono key={card.title}>{card.title}</Mono>
            ))}
          </Section>
        ),
      },
    ],
  },
  {
    id: 'ActionRow',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/ActionRow.tsx',
    states: [
      {
        name: 'a button and a link',
        figmaName: 'CTA',
        figmaNode: '66:2265',
        render: () => (
          <ActionRow>
            <Button href="#actionrow">{landingCopy.howItWorks.action}</Button>
            <TextLink href="#actionrow" arrow>
              {landingCopy.gallery.open}
            </TextLink>
          </ActionRow>
        ),
      },
      {
        name: 'two buttons',
        figmaName: 'CTAs',
        figmaNode: '66:2354',
        render: () => (
          <ActionRow gap="tight">
            <Button href="#actionrow">{landingCopy.builders.actions.github}</Button>
            <Button variant="secondary" href="#actionrow">
              {landingCopy.builders.actions.docs}
            </Button>
          </ActionRow>
        ),
      },
    ],
  },
  {
    id: 'MetaRow',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/MetaRow.tsx',
    states: [
      {
        name: 'two captions',
        surfaces: ['ground', 'ink'],
        wide: true,
        render: () => <MetaRow start={FIGURE.start} end={FIGURE.end} />,
      },
    ],
  },
  {
    id: 'EmptySlot',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/EmptySlot.tsx',
    states: [{ name: 'a place held open', render: () => <EmptySlot /> }],
  },
  {
    id: 'AnnotatedFlower',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/landing/AnnotatedFlower.tsx',
    states: [
      {
        name: 'as designed',
        wide: true,
        figmaName: 'Figure · annotated flower',
        figmaNode: '66:2206',
        render: () => (
          <AnnotatedFlower
            notes={specimen.notes}
            remark={
              <Callout
                who={specimen.callout.who}
                action={{ label: specimen.callout.action, href: '#annotated' }}
              >
                {specimen.callout.text}
              </Callout>
            }
          />
        ),
      },
    ],
  },
  {
    id: 'AskBox',
    group: 'Controls',
    figmaName: 'Petals / Ask box',
    figmaNode: '52:1861',
    source: 'apps/web/components/ui/AskBox.tsx',
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
        closedIn: 'The conversation',
        wide: true,
        render: () => (
          <AskBox label="Ask" placeholder="Ask about any network, or paste an address." disabled />
        ),
      },
      {
        name: 'small',
        wide: true,
        figmaName: 'Petals / Ask box',
        figmaNode: '67:2512',
        render: () => (
          <div className="w-full figure-scale">
            <AskBox label="Ask" placeholder="Who decides in this DAO?" to="#askbox" />
          </div>
        ),
      },
      {
        name: 'composer, nothing to ask yet',
        closedIn: 'The conversation',
        wide: true,
        figmaName: 'Question composer',
        figmaNode: '39:930',
        render: () => (
          <AskBox size="composer" label="Ask" placeholder="Ask about this wallet…" canAsk={false} />
        ),
      },
      {
        name: 'composer, filled',
        closedIn: 'The conversation',
        wide: true,
        figmaName: 'Question composer',
        figmaNode: '39:930',
        render: () => (
          <AskBox
            size="composer"
            label="Ask"
            placeholder="Ask about this wallet…"
            defaultValue="Who is behind this account?"
          />
        ),
      },
    ],
  },
  {
    id: 'Button',
    group: 'Controls',
    figmaName: 'Petals / Button',
    figmaNode: '23:161',
    source: 'apps/web/components/ui/Button.tsx',
    states: [
      { name: 'primary', closedIn: 'Actions', render: () => <Button>Explore</Button> },
      { name: 'primary, arrow', render: () => <Button arrow>Ask</Button> },
      {
        name: 'primary, link',
        surfaces: ['ground', 'ink'],
        render: () => <Button href="#button">Explore</Button>,
      },
      {
        name: 'primary, disabled',
        closedIn: 'Actions',
        render: () => <Button disabled>Explore</Button>,
      },
      {
        name: 'secondary',
        closedIn: 'Actions',
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
        closedIn: 'Actions',
        ...SECONDARY,
        render: () => (
          <Button variant="secondary" disabled>
            Support Petals
          </Button>
        ),
      },
      {
        name: 'starter',
        closedIn: 'Actions',
        ...STARTER,
        render: () => <Button variant="starter">Who decides in this DAO?</Button>,
      },
      {
        name: 'starter, link',
        surfaces: ['ground', 'mint'],
        ...STARTER,
        render: () => (
          <Button variant="starter" href="#button">
            Who decides in this DAO?
          </Button>
        ),
      },
      {
        name: 'link',
        closedIn: 'The workspace',
        figmaName: 'Petals / Link',
        figmaNode: '23:159',
        render: () => <Button variant="link">Close detail</Button>,
      },
      {
        name: 'quiet',
        closedIn: 'The workspace',
        render: () => <Button variant="quiet">Interpretation and sources</Button>,
      },
      {
        name: 'quiet, on',
        closedIn: 'The workspace',
        render: () => (
          <Button variant="quiet" pressed>
            Interpretation and sources
          </Button>
        ),
      },
      {
        name: 'row',
        closedIn: 'The conversation',
        wide: true,
        render: () => <Button variant="row">Something that opens</Button>,
      },
      {
        name: 'row, open',
        closedIn: 'The conversation',
        wide: true,
        render: () => (
          <Button variant="row" pressed>
            The one that’s open
          </Button>
        ),
      },
    ],
  },
  {
    id: 'TextLink',
    group: 'Controls',
    figmaName: 'Petals / Link',
    figmaNode: '23:159',
    source: 'apps/web/components/ui/TextLink.tsx',
    states: [
      { name: 'default', render: () => <TextLink href="#textlink">Explore</TextLink> },
      {
        name: 'quiet',
        closedIn: 'The workspace',
        render: () => (
          <TextLink variant="quiet" href="#textlink">
            Publish on NEAR
          </TextLink>
        ),
      },
      {
        name: 'in the rail',
        closedIn: 'The workspace',
        figmaName: 'Workspace / Navigation rail',
        figmaNode: '43:748',
        render: () => (
          <TextLink variant="rail" icon="home" href="#textlink">
            Home
          </TextLink>
        ),
      },
      {
        name: 'arrow',
        render: () => (
          <TextLink href="#textlink" arrow>
            Open the atlas
          </TextLink>
        ),
      },
      {
        name: 'mono, arrow',
        figmaName: 'ASK WHY',
        figmaNode: '66:2231',
        render: () => (
          <TextLink href="#textlink" variant="mono" arrow>
            ASK WHY
          </TextLink>
        ),
      },
    ],
  },
  {
    id: 'Wordmark',
    group: 'Marks',
    figmaName: 'Petals / Wordmark',
    figmaNode: '12:12',
    source: 'apps/web/components/ui/Wordmark.tsx',
    states: [
      { name: 'nav', render: () => <Wordmark /> },
      { name: 'footer', wide: true, render: () => <Wordmark size="footer" /> },
      {
        name: 'workspace',
        closedIn: 'The workspace',
        figmaName: 'Workspace header',
        figmaNode: '39:863',
        render: () => <Wordmark size="workspace" />,
      },
    ],
  },
  {
    id: 'Icon',
    group: 'Marks',
    figmaName: 'Workspace / Navigation rail',
    figmaNode: '43:748',
    source: 'apps/web/components/ui/Icon.tsx',
    states: [
      { name: 'arrow', surfaces: ['ground', 'mint'], render: () => <Icon name="arrow" /> },
      { name: 'arrow, accent', render: () => <Icon name="arrow" accent /> },
      { name: 'back', surfaces: ['ink'], render: () => <Icon name="back" /> },
      ...RAIL_ICONS.map((name) => ({
        name,
        closedIn: 'The workspace' as const,
        render: () => <Icon name={name} />,
      })),
    ],
  },
  {
    id: 'Drawing',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Drawing.tsx',
    states: [
      ...KINDS.map(({ kind, size, name, figmaName, node }) => ({
        name,
        figmaName,
        figmaNode: node,
        ...(kind === 'cell' ? { surfaces: ['mint'] as const } : {}),
        render: () => <Drawing kind={kind} size={size} />,
      })),
      {
        name: 'small, beside a speaker',
        closedIn: 'The conversation',
        render: () => <Drawing kind="cell" size="cell-small" />,
      },
      {
        name: 'medium, beside a status',
        closedIn: 'The conversation',
        render: () => <Drawing kind="cell" size="cell-medium" />,
      },
      {
        name: 'large, opening a panel',
        closedIn: 'The workspace',
        render: () => <Drawing kind="cell" size="cell-large" />,
      },
    ],
  },
  {
    id: 'Mono',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Mono.tsx',
    states: [
      {
        name: 'a line',
        surfaces: ['ground', 'ink'],
        render: () => <Mono>{landingCopy.footer.built}</Mono>,
      },
      {
        name: 'under a figure',
        render: () => <Mono as="figcaption">{specimen.figureCaption}</Mono>,
      },
      { name: 'above a section', render: () => <Mono>THE ATLAS</Mono> },
      {
        name: 'above a section, on ink',
        surfaces: ['ink'],
        render: () => <Mono tone="accent">FOR BUILDERS</Mono>,
      },
      {
        name: 'beside the work',
        closedIn: 'The conversation',
        render: () => <Mono tone="muted">01 ONE PETAL HOLDS 18% OF THE SAY</Mono>,
      },
    ],
  },
  {
    id: 'SideRail',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/SideRail.tsx',
    states: [
      {
        name: 'open, with the work in it (all of it: /lab/panel)',
        wide: true,
        render: () => <LabRail open />,
      },
      {
        name: 'folded: the fold and the places, as icons',
        render: () => <LabRail open={false} />,
      },
    ],
  },
  {
    id: 'NavItem',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/NavItem.tsx',
    states: [
      { name: 'a place', render: () => <NavItem href="#lobby" icon="home" label="Lobby" /> },
      {
        name: 'where you are',
        render: () => <NavItem href="#lobby" icon="home" label="Lobby" current />,
      },
      {
        name: 'a conversation, working, cut with an ellipsis',
        render: () => (
          <NavItem
            href="#c"
            icon="petals"
            label="Validators whose stake comes from one exchange's custody wallets"
            trail="now"
            working="Working"
          />
        ),
      },
      {
        name: 'a project, open, with its count',
        render: () => <LabProject />,
      },
      {
        name: 'in a project',
        render: () => (
          <NavItem
            href="#c"
            icon="agent"
            label="Who custodies Binance's NEAR"
            trail="12m"
            depth={1}
          />
        ),
      },
      {
        name: 'a line that says what is there, with a control',
        render: () => <LabAgent />,
      },
      {
        name: 'muted: empty, or the way to add one',
        render: () => <LabAction />,
      },
    ],
  },
  {
    id: 'RowField',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/RowField.tsx',
    states: [
      {
        name: 'naming a new project, in its place',
        render: () => (
          <RowField
            label="Name the project"
            placeholder="Name the project"
            icon="project"
            onDone={() => {}}
            onCancel={() => {}}
          />
        ),
      },
    ],
  },
  {
    id: 'Badge',
    group: 'The workspace',
    figmaName: 'Petals / Badge',
    figmaNode: '164:2284',
    source: 'apps/web/components/ui/Badge.tsx',
    states: [
      { name: 'neutral, a fact', render: () => <Badge>Declared</Badge> },
      { name: 'accent, a state that went well', render: () => <Badge tone="accent">Saved</Badge> },
    ],
  },
  {
    id: 'Card',
    group: 'The workspace',
    figmaName: 'Petals / Card head',
    figmaNode: '164:2294',
    source: 'apps/web/components/ui/Card.tsx',
    states: [
      {
        name: 'a title, a badge and its one action',
        render: () => (
          <Card
            title="A card's title"
            labelledBy="lab-card"
            badge={<Badge>208</Badge>}
            action={<Button variant="secondary">Edit</Button>}
          >
            <p className="my-0 type-body">One job, said in its body.</p>
          </Card>
        ),
      },
      {
        name: 'a title only',
        render: () => (
          <Card title="A card's title" labelledBy="lab-card-plain">
            <p className="my-0 type-caption text-muted">Nothing here yet, and what to do next.</p>
          </Card>
        ),
      },
    ],
  },
  {
    id: 'IconButton',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/IconButton.tsx',
    states: [
      {
        name: 'the fold',
        render: () => <LabFold />,
      },
      {
        name: 'a place, folded',
        render: () => <IconButton href="#lobby" icon="home" label="Lobby" />,
      },
    ],
  },
  {
    id: 'ReadingKey',
    group: 'The workspace',
    figmaName: 'Make a flower / One petal',
    figmaNode: '39:887',
    source: 'apps/web/components/workspace/ReadingKey.tsx',
    states: [
      {
        name: 'NEAR validators',
        wide: true,
        render: () => <ReadingKey view={readingKey(golden('near-validators-default').spec)} />,
      },
    ],
  },
  {
    id: 'FlowerShelf',
    group: 'The workspace',
    figmaName: 'Make a flower / New question',
    figmaNode: '43:736',
    source: 'apps/web/components/workspace/FlowerShelf.tsx',
    states: [
      {
        name: 'before any flower',
        wide: true,
        render: () => <FlowerShelf view={shelfView(LISTED, false)} />,
      },
      {
        name: 'while the first one is made',
        wide: true,
        render: () => <FlowerShelf view={shelfView(LISTED, true)} />,
      },
      {
        name: 'nothing stored',
        wide: true,
        render: () => <FlowerShelf view={shelfView([], false)} />,
      },
    ],
  },
  {
    id: 'FlowerPanel',
    group: 'The workspace',
    figmaName: 'Make a flower / One petal',
    figmaNode: '39:862',
    source: 'apps/web/flower/FlowerPanel.tsx',
    states: [
      {
        name: 'a flower open',
        wide: true,
        render: () => <FlowerPanel view={panelView()} />,
      },
      {
        name: 'a petal selected',
        wide: true,
        ...ONE_PETAL,
        render: () => (
          <FlowerPanel
            view={panelView('astro-stakers.poolv1.near')}
            petal={petal('near-validators-default', (p) => p.rank === 1)}
            unit="NEAR"
          />
        ),
      },
      {
        name: 'opening',
        wide: true,
        render: () => <FlowerPanel view={{ kind: 'loading', text: 'Opening the flower…' }} />,
      },
      {
        name: 'could not be read',
        wide: true,
        render: () => <FlowerPanel view={{ kind: 'failed', text: 'A message from the server.' }} />,
      },
    ],
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
            heading="Conversation"
            rows={[...TURN_ROWS, flowerRow()]}
            renderFlower={(row) => (
              <TurnFlower key={row.key} title={row.title} sub={row.sub} open={row.open} />
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
        name: 'about this flower',
        wide: true,
        render: () => (
          <LabComposer
            view={composerView({ ...atRest, runId: 'run-id', target: { kind: 'flower' } })}
          />
        ),
      },
      {
        name: 'about a wallet',
        wide: true,
        figmaName: 'Question composer',
        figmaNode: '39:930',
        render: () => (
          <LabComposer
            view={composerView({
              ...atRest,
              runId: 'run-id',
              target: {
                kind: 'wallet',
                line: '[About account astro-stakers.poolv1.near, in the near-validators flower, data as of 2026-11-03]',
              },
            })}
          />
        ),
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
    id: 'Speech',
    group: 'The conversation',
    figmaName: 'Make a flower / One petal',
    figmaNode: '39:862',
    source: 'apps/web/components/chat/Speech.tsx',
    states: [
      {
        name: 'the first question',
        wide: true,
        render: () => (
          <Speech speaker="Original question">Who holds the JTO token on Solana?</Speech>
        ),
      },
      {
        name: 'a question about a petal',
        wide: true,
        render: () => (
          <Speech speaker="You" note="About account astro-stakers.poolv1.near">
            Who is behind this one?
          </Speech>
        ),
      },
      {
        name: 'the agent',
        wide: true,
        render: () => (
          <Speech speaker="Petals" agent>
            <Markdown blocks={parseMarkdown('Those ten hold **48.55%** between them.')} />
          </Speech>
        ),
      },
    ],
  },
  {
    id: 'TurnStatus',
    group: 'The conversation',
    figmaName: 'Make a flower / Reading the record',
    figmaNode: '39:668',
    source: 'apps/web/components/chat/TurnStatus.tsx',
    states: [
      { name: 'sending', wide: true, render: () => <TurnStatus row={turnRow('sending')} /> },
      {
        name: 'working',
        wide: true,
        render: () => (
          <TurnStatus row={turnRow('working', { headline: 'Reading the shared map…' })} />
        ),
      },
      { name: 'lost', wide: true, render: () => <TurnStatus row={turnRow('lost')} /> },
    ],
  },
  {
    id: 'ConnectWallet',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/ConnectWallet.tsx',
    states: [
      {
        name: 'nothing waiting',
        wide: true,
        render: () => <ConnectWallet question="" busy={false} failed={null} onConnect={() => {}} />,
      },
      {
        name: 'a question waiting, and the last try failed',
        wide: true,
        render: () => (
          <ConnectWallet
            question="Who stands behind NEAR's validators?"
            busy={false}
            failed="NEAR didn't answer. Try again."
            onConnect={() => {}}
          />
        ),
      },
    ],
  },
  {
    id: 'WhoIsHere',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/WhoIsHere.tsx',
    states: [
      {
        name: 'connected',
        wide: true,
        render: () => <WhoIsHere account="elcocoel.near" onDisconnect={() => {}} />,
      },
    ],
  },
  {
    id: 'ModelOptions',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/ModelOptions.tsx',
    states: [
      {
        name: 'one picked',
        wide: true,
        render: () => (
          <ModelOptions
            options={[
              {
                id: 'a',
                label: 'DeepSeek V4.1 Flash',
                sub: 'Signed  ·  NEAR AI’s enclave  ·  $0.02 a flower',
                on: true,
              },
              {
                id: 'b',
                label: 'Claude Haiku 5.5',
                sub: 'Passed through  ·  Anthropic  ·  $0.007 a flower',
                on: false,
              },
            ]}
            onPick={() => {}}
          />
        ),
      },
    ],
  },
  {
    id: 'JobRow',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/JobRow.tsx',
    states: [
      {
        name: 'sent to an agent',
        render: () => <JobRow text="Sent to Claude Code: Map RaidGuild's proposals" />,
      },
      {
        name: 'reported',
        render: () => (
          <JobRow
            text="Your own agent finished: Map RaidGuild's proposals"
            summary="246 proposals, by author, added as a layer."
          />
        ),
      },
    ],
  },
  {
    id: 'ProfileHead',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/ProfileHead.tsx',
    states: [
      {
        name: 'with a NEAR Social profile',
        render: () => (
          <ProfileHead
            account="a-name.near"
            social={{
              kind: 'profile',
              profile: { name: 'A name on NEAR Social', about: null, avatar: null, links: [] },
            }}
            disconnectLabel="Disconnect"
            onDisconnect={() => {}}
          />
        ),
      },
      {
        name: 'no public profile, a 64-character account',
        render: () => (
          <ProfileHead
            account="02b85f8c8bbfbcc34f4d30b55724f36336768f05c27c2d7f97936e5d699018fc"
            social={{ kind: 'none' }}
            disconnectLabel="Disconnect"
            onDisconnect={() => {}}
          />
        ),
      },
    ],
  },
  {
    id: 'Profile',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/Profile.tsx',
    states: [
      {
        name: 'with a NEAR Social profile',
        render: () => (
          <Profile
            social={{
              kind: 'profile',
              profile: {
                name: 'A name on NEAR Social',
                about: 'A short bio, in the account’s own words.',
                avatar: null,
                links: [
                  { service: 'github', value: 'a-handle' },
                  { service: 'x', value: 'a-handle' },
                ],
              },
            }}
            onEdit={() => {}}
          />
        ),
      },
      {
        name: 'no public profile yet',
        render: () => <Profile social={{ kind: 'none' }} onEdit={() => {}} />,
      },
      {
        name: 'still reading',
        render: () => <Profile social={{ kind: 'reading' }} />,
      },
      {
        name: "NEAR Social didn't answer",
        render: () => <Profile social={{ kind: 'unread' }} />,
      },
    ],
  },
  {
    id: 'Funds',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/Funds.tsx',
    states: [
      {
        name: 'credit, as on the live site (no contract)',
        render: () => (
          <Funds balance="0.42" held={null} phase="ready" withdrew={null} onWithdraw={() => {}} />
        ),
      },
      {
        name: 'holding NEAR in the contract',
        render: () => (
          <Funds
            balance="0.84"
            held="840000000000000000000000"
            phase="ready"
            withdrew={null}
            onWithdraw={() => {}}
          />
        ),
      },
      {
        name: 'waiting for the wallet',
        render: () => (
          <Funds
            balance="0.84"
            held="840000000000000000000000"
            phase="withdrawing"
            withdrew={null}
            onWithdraw={() => {}}
          />
        ),
      },
      {
        name: 'withdrew',
        render: () => (
          <Funds balance="0.00" held="0" phase="withdrew" withdrew="0.84" onWithdraw={() => {}} />
        ),
      },
      {
        name: "didn't go through",
        render: () => (
          <Funds
            balance="0.84"
            held="840000000000000000000000"
            phase="failed"
            withdrew={null}
            onWithdraw={() => {}}
          />
        ),
      },
      {
        name: 'the balance can’t be read',
        render: () => (
          <Funds balance={null} held={null} phase="ready" withdrew={null} onWithdraw={() => {}} />
        ),
      },
      {
        name: 'nothing held',
        render: () => (
          <Funds balance="0.00" held="0" phase="ready" withdrew={null} onWithdraw={() => {}} />
        ),
      },
    ],
  },
  {
    id: 'PayRow',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/PayRow.tsx',
    states: [
      {
        name: 'out of credit',
        render: () => <PayRow phase="ready" added={null} onPay={() => {}} />,
      },
      {
        name: 'waiting for the wallet',
        render: () => <PayRow phase="paying" added={null} onPay={() => {}} />,
      },
      { name: 'added', render: () => <PayRow phase="added" added="1" onPay={() => {}} /> },
      {
        name: "didn't go through",
        render: () => <PayRow phase="failed" added={null} onPay={() => {}} />,
      },
    ],
  },
  {
    id: 'ConversationList',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/ConversationList.tsx',
    states: [
      {
        name: "a first afternoon: one open, two working, Petals' agent and your own",
        wide: true,
        render: () => <ConversationList rows={PANEL_STATES.five.rows} />,
      },
      {
        name: 'in a project',
        wide: true,
        render: () => (
          <ConversationList
            rows={PANEL_STATES.forty.rows.filter((r) => r.project === 'p2')}
            depth={1}
          />
        ),
      },
    ],
  },
  {
    id: 'TurnFlower',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/TurnFlower.tsx',
    states: [
      {
        name: 'drawing',
        wide: true,
        render: () => <TurnFlower title="Near validators" sub="60 petals" open={false} />,
      },
      {
        name: 'earlier, can come back',
        wide: true,
        render: () => (
          <TurnFlower
            title="NEAR validators"
            sub="60 petals  ·  NEAR  ·  3 Nov 2026"
            open={false}
            thumb={svgImage(drawn().svg)}
          />
        ),
      },
      {
        name: 'in the panel',
        wide: true,
        render: () => (
          <TurnFlower
            title="NEAR validators"
            sub="10 petals  ·  NEAR  ·  3 Nov 2026"
            open
            thumb={svgImage(drawn().svg)}
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
    id: 'LegendKeys',
    group: 'The flower',
    figmaName: 'Make a flower / One petal',
    figmaNode: '40:764',
    source: 'apps/web/components/Legend.tsx',
    states: [
      {
        name: 'a petal selected',
        wide: true,
        render: () => <LegendKeys keys={[{ label: 'Selected', swatch: 'selected' }]} />,
      },
    ],
  },
  {
    id: 'FlowerTile',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/FlowerTile.tsx',
    states: [
      {
        name: 'a stored flower',
        render: () => (
          <FlowerTile
            title="Who stands behind NEAR’s validators?"
            where="Near validators   /   3 Nov 2026"
            badge="Fixture"
            image={svgImage(drawn().svg)}
            href="#flowertile"
          />
        ),
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
          <PetalDetails petal={petal('near-validators-default', (p) => p.rank === 1)} unit="NEAR" />
        ),
      },
      {
        name: 'a named petal, can be closed',
        wide: true,
        figmaName: 'Selected petal detail',
        figmaNode: '39:924',
        render: () => (
          <LabPetalClose petal={petal('near-validators-default', (p) => p.rank === 1)} />
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
    id: 'AgentKeyCopy',
    group: 'Actions',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/AgentKeyCopy.tsx',
    states: [
      // as this browser is: Connect when no one is signed in, the copy when someone is
      { name: 'as this browser is', wide: true, render: () => <AgentKeyCopy /> },
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
  Landing: 'the whole landing page, at /; each of its sections is here',
  InteractionSurface: 'wires the ViewModels to the boxes and the flower, and it lives at /make',
  FlowerCanvas: 'the live flower fills the window, so its bench is its own page, /lab/flower',
  ConversationThread: 'Thread and TurnFlower wired together, and each of those is here',
  FloatBox: 'a BarBox fixed to the window and placed by hand: it lives at /make',
  SiteChrome: 'the Nav, drawn here, around a reading column; it holds no state of its own',
  FrontDoor: 'draws nothing: it opens the wallet when the landing is left for /make (proposal)',
  Lobby: 'wires useLobby to the WorkMenu and the tiles, and it lives at /lobby',
  WorkMenu:
    'the SideRail and the list, both here, fixed to the window: it lives at /lobby and /make',
};
