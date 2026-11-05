// Every component, in every state props can reach, from saved fixtures (T176). figmaName and
// figmaNode are how an agent finds the matching frame by hand; null means Figma has none yet. A test
// holds this list to what components/ exports (apps/web/test/lab-registry.test.ts).
//
// Biggest first, in the page's order: Sections, Blocks, Controls and Marks are what the landing page's
// imports reach; the other groups aren't on it and stay closed on the page.
//
// QuotePanel, PublishFlow, CopyPrompt and Flower still keep their later states in hooks, so only the
// first state shows here until they take them as props, as the chat's views do. Their controls are
// live on the page.
import type { SurfaceName } from '@petal/tokens';
import { surfaceNames } from '@petal/tokens';
import type { ReactNode } from 'react';
import { CopyPrompt } from '../components/CopyPrompt.tsx';
import { Stage } from '../components/canvas/Stage.tsx';
import { StagedFlower } from '../components/canvas/StagedFlower.tsx';
import { AnsweredBy } from '../components/chat/AnsweredBy.tsx';
import { Speech } from '../components/chat/Speech.tsx';
import { Steps } from '../components/chat/Steps.tsx';
import { Thread } from '../components/chat/Thread.tsx';
import { TurnFlower } from '../components/chat/TurnFlower.tsx';
import { TurnStatus } from '../components/chat/TurnStatus.tsx';
import { Flower } from '../components/Flower.tsx';
import { FlowerSheet } from '../components/FlowerSheet.tsx';
import { FlowerTile } from '../components/FlowerTile.tsx';
import { Interpretation, SignatureLine } from '../components/Interpretation.tsx';
import { Legend, LegendKeys } from '../components/Legend.tsx';
import { AnnotatedFlower } from '../components/landing/AnnotatedFlower.tsx';
import { ClosingAsk } from '../components/landing/ClosingAsk.tsx';
import { FlowerRead } from '../components/landing/FlowerRead.tsx';
import { ForBuilders } from '../components/landing/ForBuilders.tsx';
import { GallerySection } from '../components/landing/GallerySection.tsx';
import { Hero } from '../components/landing/Hero.tsx';
import { HeroesStrip } from '../components/landing/HeroesStrip.tsx';
import { HowItWorks } from '../components/landing/HowItWorks.tsx';
import { JoinCommunity } from '../components/landing/JoinCommunity.tsx';
import { Questions } from '../components/landing/Questions.tsx';
import { Step } from '../components/landing/Step.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { PetalDetails } from '../components/PetalDetails.tsx';
import { PublishFlow } from '../components/PublishFlow.tsx';
import { QuotePanel } from '../components/QuotePanel.tsx';
import { SourceList } from '../components/Sources.tsx';
import { ActionRow } from '../components/ui/ActionRow.tsx';
import { Arrow } from '../components/ui/Arrow.tsx';
import { AskBlock } from '../components/ui/AskBlock.tsx';
import { AskBox } from '../components/ui/AskBox.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Callout } from '../components/ui/Callout.tsx';
import { Caption } from '../components/ui/Caption.tsx';
import { Cell, CellRepeat } from '../components/ui/Cell.tsx';
import { Drawing } from '../components/ui/Drawing.tsx';
import { Eyebrow } from '../components/ui/Eyebrow.tsx';
import { FaqItem } from '../components/ui/FaqItem.tsx';
import { Footer } from '../components/ui/Footer.tsx';
import { GalleryCard } from '../components/ui/GalleryCard.tsx';
import { Glyph } from '../components/ui/Glyph.tsx';
import { Icon, type IconName } from '../components/ui/Icon.tsx';
import { MetaRow } from '../components/ui/MetaRow.tsx';
import { Nav } from '../components/ui/Nav.tsx';
import { Numeral } from '../components/ui/Numeral.tsx';
import { Section } from '../components/ui/Section.tsx';
import { SectionHead } from '../components/ui/SectionHead.tsx';
import { Surface } from '../components/ui/Surface.tsx';
import { Terminal } from '../components/ui/Terminal.tsx';
import { TextLink } from '../components/ui/TextLink.tsx';
import { Thumb } from '../components/ui/Thumb.tsx';
import { Transcript } from '../components/ui/Transcript.tsx';
import { Wordmark } from '../components/ui/Wordmark.tsx';
import { FlowerPanel } from '../components/workspace/FlowerPanel.tsx';
import { FlowerShelf } from '../components/workspace/FlowerShelf.tsx';
import { NavigationRail } from '../components/workspace/NavigationRail.tsx';
import { ReadingKey } from '../components/workspace/ReadingKey.tsx';
import { WorkspaceFrame } from '../components/workspace/WorkspaceFrame.tsx';
import { WorkspaceHeader } from '../components/workspace/WorkspaceHeader.tsx';
import {
  cell,
  type GlyphKind,
  heroFlower,
  heroLeaders,
  readingFlower,
  type ThumbKind,
} from '../lib/figures.ts';
import { legendKeys, readingKey, svgImage } from '../lib/flower-view.ts';
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
  TURN_ROWS,
} from './fixtures.ts';
import { LabComposer, LabPetalClose } from './LabComposer.tsx';

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
  group:
    | 'Sections'
    | 'Blocks'
    | 'Controls'
    | 'Marks'
    | 'The workspace'
    | 'The conversation'
    | 'The flower'
    | 'Reading'
    | 'Actions';
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

const GLYPHS: { kind: GlyphKind; name: string; node: string }[] = [
  { kind: 'concentration', name: 'Concentration', node: '54:1886' },
  { kind: 'flows', name: 'Flows', node: '54:1892' },
  { kind: 'bloc', name: 'Bloc', node: '54:1897' },
  { kind: 'same-hands', name: 'Same hands', node: '54:1902' },
  { kind: 'empty-quorum', name: 'Empty quorum', node: '54:1906' },
  { kind: 'payout', name: 'Payout', node: '54:1912' },
];
const THUMBS: { kind: ThumbKind; name: string; node: string }[] = [
  { kind: 'tower', name: 'Tower', node: '56:1934' },
  { kind: 'even', name: 'Even', node: '56:1939' },
  { kind: 'blocs', name: 'Blocs', node: '56:1945' },
];
const ASK = landingCopy.ask;
const FAQ = landingCopy.questions.items[0];
const FIGURE = landingCopy.flowerRead.transcript;
const TERMINAL = landingCopy.builders.terminal;
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

const LISTED = [
  {
    id: '3394fb875bf97c1af8191566',
    title: 'Who stands behind NEAR’s validators?',
    network: 'near-validators',
    as_of: '2026-11-03T19:42:00Z',
    maker: null,
    published_at: null,
    where: 'fixture' as const,
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
const ICONS: IconName[] = ['home', 'plus', 'gallery', 'connect'];

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
    'FlowerRead',
    'apps/web/components/landing/FlowerRead.tsx',
    'A flower, already read',
    '66:2232',
    () => <FlowerRead />,
  ),
  section(
    'HowItWorks',
    'apps/web/components/landing/HowItWorks.tsx',
    'How it works',
    '66:2268',
    () => <HowItWorks />,
  ),
  section(
    'Questions',
    'apps/web/components/landing/Questions.tsx',
    'Questions Petals answers',
    '66:2289',
    () => <Questions />,
  ),
  section(
    'GallerySection',
    'apps/web/components/landing/GallerySection.tsx',
    'The atlas',
    '66:2303',
    () => <GallerySection />,
  ),
  section(
    'ForBuilders',
    'apps/web/components/landing/ForBuilders.tsx',
    'For builders',
    '66:2316',
    () => <ForBuilders />,
  ),
  section(
    'ClosingAsk',
    'apps/web/components/landing/ClosingAsk.tsx',
    'Closing ask',
    '66:2336',
    () => <ClosingAsk />,
  ),
  section(
    'JoinCommunity',
    'apps/web/components/landing/JoinCommunity.tsx',
    'Join the community',
    '66:2346',
    () => <JoinCommunity />,
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
    states: landingCopy.gallery.cards.map((card, i) => ({
      name: card.title,
      render: () => (
        <GalleryCard
          thumb={(['blocs', 'even', 'tower'] as const)[i] ?? 'even'}
          href="#gallerycard"
          {...card}
        />
      ),
    })),
  },
  {
    id: 'FaqItem',
    group: 'Blocks',
    figmaName: 'Petals / FAQ item',
    figmaNode: '67:2538',
    source: 'apps/web/components/ui/FaqItem.tsx',
    surfaces: surfaceNames,
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
              <Thumb kind="even" size="step" />
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
    surfaces: surfaceNames,
    states: [
      {
        name: 'with an action',
        figmaName: 'Agent line',
        figmaNode: '66:2228',
        render: () => (
          <Callout
            who={landingCopy.hero.callout.who}
            action={{ label: landingCopy.hero.callout.action, href: '#callout' }}
          >
            {landingCopy.hero.callout.text}
          </Callout>
        ),
      },
      {
        name: 'compact, without one',
        figmaName: 'Callout',
        figmaNode: '67:2529',
        render: () => (
          <Callout size="compact" who={landingCopy.howItWorks.stepThree.who}>
            {landingCopy.howItWorks.stepThree.text}
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
    id: 'Terminal',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Terminal.tsx',
    surfaces: surfaceNames,
    states: [
      {
        name: 'each kind of line',
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
    surfaces: surfaceNames,
    states: [
      {
        name: 'with a label',
        wide: true,
        render: () => (
          <AskBlock
            placeholder={ASK.placeholder}
            action={ASK.action}
            starterLabel={landingCopy.hero.starterLabel}
            starters={landingCopy.hero.starters}
          />
        ),
      },
      {
        name: 'without one',
        wide: true,
        render: () => (
          <AskBlock
            placeholder={ASK.placeholder}
            action={ASK.action}
            starters={landingCopy.closing.starters}
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
    surfaces: surfaceNames,
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
        wide: true,
        figmaName: 'Ask',
        figmaNode: '66:2337',
        render: () => <SectionHead size="compact" title={landingCopy.closing.title} />,
      },
      {
        name: 'title, with a paragraph',
        wide: true,
        figmaName: 'Intro',
        figmaNode: '66:2290',
        render: () => (
          <SectionHead
            eyebrow={landingCopy.questions.eyebrow}
            title={landingCopy.questions.title}
            body={landingCopy.questions.body}
          />
        ),
      },
      {
        name: 'title, no paragraph',
        wide: true,
        render: () => (
          <SectionHead eyebrow={landingCopy.gallery.eyebrow} title={landingCopy.gallery.title} />
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
    states: surfaceNames.map((kind) => ({
      name: kind,
      wide: true,
      render: () => (
        <Section kind={kind}>
          <Caption>{landingCopy.gallery.caption}</Caption>
        </Section>
      ),
    })),
  },
  {
    id: 'ActionRow',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/ActionRow.tsx',
    surfaces: surfaceNames,
    states: [
      {
        name: 'a button and a link',
        figmaName: 'CTA',
        figmaNode: '66:2265',
        render: () => (
          <ActionRow>
            <Button href="#actionrow">{landingCopy.howItWorks.ask}</Button>
            <TextLink href="#actionrow" arrow>
              {landingCopy.howItWorks.gallery}
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
            <Button href="#actionrow">{landingCopy.community.join}</Button>
            <Button variant="secondary" href="#actionrow">
              {landingCopy.community.support}
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
    surfaces: surfaceNames,
    states: [
      {
        name: 'two captions',
        wide: true,
        render: () => <MetaRow start={FIGURE.start} end={FIGURE.end} />,
      },
    ],
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
        render: () => <AnnotatedFlower />,
      },
    ],
  },
  {
    id: 'HeroesStrip',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/landing/HeroesStrip.tsx',
    states: [
      {
        name: 'the first one current',
        figmaName: 'Heroes strip',
        figmaNode: '66:2396',
        render: () => <HeroesStrip thumbs={['blocs', 'even', 'tower', 'blocs', 'even']} />,
      },
    ],
  },
  {
    id: 'AskBox',
    group: 'Controls',
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
        wide: true,
        figmaName: 'Question composer',
        figmaNode: '39:930',
        render: () => (
          <AskBox size="composer" label="Ask" placeholder="Ask about this wallet…" canAsk={false} />
        ),
      },
      {
        name: 'composer, filled',
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
      {
        name: 'link',
        figmaName: 'Petals / Link',
        figmaNode: '23:159',
        render: () => <Button variant="link">Close detail</Button>,
      },
      { name: 'quiet', render: () => <Button variant="quiet">Interpretation and sources</Button> },
      {
        name: 'quiet, on',
        render: () => (
          <Button variant="quiet" pressed>
            Interpretation and sources
          </Button>
        ),
      },
      {
        name: 'row',
        wide: true,
        render: () => <Button variant="row">Something that opens</Button>,
      },
      {
        name: 'row, open',
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
    surfaces: surfaceNames,
    states: [
      { name: 'default', render: () => <TextLink href="#textlink">Explore</TextLink> },
      {
        name: 'quiet',
        render: () => (
          <TextLink variant="quiet" href="#textlink">
            Publish on NEAR
          </TextLink>
        ),
      },
      {
        name: 'in the rail',
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
    surfaces: surfaceNames,
    states: [
      { name: 'nav', render: () => <Wordmark /> },
      { name: 'footer', wide: true, render: () => <Wordmark size="footer" /> },
      {
        name: 'workspace',
        figmaName: 'Workspace header',
        figmaNode: '39:863',
        render: () => <Wordmark size="workspace" />,
      },
      { name: 'display', wide: true, render: () => <Wordmark size="display" /> },
    ],
  },
  {
    id: 'Cell',
    group: 'Marks',
    figmaName: 'Petals / Cell',
    figmaNode: '12:16',
    source: 'apps/web/components/ui/Cell.tsx',
    surfaces: surfaceNames,
    states: [
      { name: 'small, beside a speaker', render: () => <Cell /> },
      { name: 'medium, beside a status', render: () => <Cell size="medium" /> },
      { name: 'large, opening a panel', render: () => <Cell size="large" /> },
      { name: 'as wide as its parent', wide: true, render: () => <Cell size="fill" /> },
    ],
  },
  {
    id: 'CellRepeat',
    group: 'Marks',
    figmaName: 'Petals / Cell repeat',
    figmaNode: '24:209',
    source: 'apps/web/components/ui/Cell.tsx',
    surfaces: surfaceNames,
    states: [{ name: 'as wide as its parent', wide: true, render: () => <CellRepeat /> }],
  },
  {
    id: 'Thumb',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Thumb.tsx',
    surfaces: surfaceNames,
    states: THUMBS.flatMap(({ kind, name, node }) =>
      (['strip', 'step', 'card'] as const).map((size) => ({
        name: `${name}, ${size}`,
        figmaName: `Petals / Thumb / ${name}`,
        figmaNode: node,
        render: () => <Thumb kind={kind} size={size} />,
      })),
    ),
  },
  {
    id: 'Glyph',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Glyph.tsx',
    surfaces: surfaceNames,
    states: GLYPHS.flatMap(({ kind, name, node }) => [
      {
        name: `${name}, row`,
        figmaName: `Petals / Glyph / ${name}`,
        figmaNode: node,
        render: () => <Glyph kind={kind} />,
      },
      {
        name: `${name}, step`,
        figmaName: `Petals / Glyph / ${name}`,
        figmaNode: node,
        render: () => <Glyph kind={kind} size="step" />,
      },
    ]),
  },
  {
    id: 'Numeral',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Numeral.tsx',
    surfaces: surfaceNames,
    states: [
      {
        name: 'default',
        figmaName: '01',
        figmaNode: '66:2275',
        render: () => <Numeral>01</Numeral>,
      },
    ],
  },
  {
    id: 'Icon',
    group: 'Marks',
    figmaName: 'Workspace / Navigation rail',
    figmaNode: '43:748',
    source: 'apps/web/components/ui/Icon.tsx',
    surfaces: surfaceNames,
    states: ICONS.map((name) => ({ name, render: () => <Icon name={name} /> })),
  },
  {
    id: 'Arrow',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Arrow.tsx',
    surfaces: surfaceNames,
    states: [
      { name: 'plain', render: () => <Arrow /> },
      { name: 'accent', render: () => <Arrow accent /> },
      { name: 'back', render: () => <Arrow back /> },
    ],
  },
  {
    id: 'Drawing',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Drawing.tsx',
    states: [
      {
        name: 'the hero flower',
        wide: true,
        figmaName: 'Flower',
        figmaNode: '66:2207',
        render: () => <Drawing drawing={heroFlower} className="h-auto w-full" />,
      },
      {
        name: 'the hero’s leader lines',
        wide: true,
        figmaName: 'Leaders',
        figmaNode: '66:2215',
        render: () => <Drawing drawing={heroLeaders} className="h-auto w-full" />,
      },
      {
        name: 'the reading flower',
        wide: true,
        figmaName: 'Flower',
        figmaNode: '66:2234',
        render: () => <Drawing drawing={readingFlower} className="h-auto w-full" />,
      },
      {
        name: 'the cell',
        wide: true,
        figmaName: 'Petals / Cell',
        figmaNode: '12:16',
        render: () => <Drawing drawing={cell} className="h-auto w-full" />,
      },
    ],
  },
  {
    id: 'Eyebrow',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Eyebrow.tsx',
    surfaces: surfaceNames,
    states: [
      { name: 'default', render: () => <Eyebrow>01 ONE PETAL HOLDS 18% OF THE SAY</Eyebrow> },
      { name: 'above a section', render: () => <Eyebrow tone="primary">THE ATLAS</Eyebrow> },
      {
        name: 'above a section, on ink',
        render: () => <Eyebrow tone="accent">FOR BUILDERS</Eyebrow>,
      },
    ],
  },
  {
    id: 'Caption',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Caption.tsx',
    surfaces: surfaceNames,
    states: [
      { name: 'a line', render: () => <Caption>{landingCopy.community.caption}</Caption> },
      {
        name: 'under a figure',
        render: () => <Caption as="figcaption">{landingCopy.hero.caption}</Caption>,
      },
    ],
  },
  {
    id: 'Surface',
    group: 'Marks',
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
    id: 'WorkspaceHeader',
    group: 'The workspace',
    figmaName: 'Workspace header',
    figmaNode: '39:863',
    source: 'apps/web/components/workspace/WorkspaceHeader.tsx',
    states: [
      {
        name: 'default',
        wide: true,
        render: () => <WorkspaceHeader section="Make a flower" />,
      },
    ],
  },
  {
    id: 'NavigationRail',
    group: 'The workspace',
    figmaName: 'Workspace / Navigation rail',
    figmaNode: '43:748',
    source: 'apps/web/components/workspace/NavigationRail.tsx',
    states: [{ name: 'default', render: () => <NavigationRail /> }],
  },
  {
    id: 'WorkspaceFrame',
    group: 'The workspace',
    figmaName: 'Make a flower / New question',
    figmaNode: '43:736',
    source: 'apps/web/components/workspace/WorkspaceFrame.tsx',
    states: [
      {
        name: 'the frame',
        wide: true,
        render: () => (
          <div className="h-section-padding w-full overflow-hidden border border-hairline">
            <WorkspaceFrame section="Make a flower">
              <p className="p-text-gap">The page’s columns.</p>
            </WorkspaceFrame>
          </div>
        ),
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
    source: 'apps/web/components/workspace/FlowerPanel.tsx',
    states: [
      {
        name: 'a flower open',
        wide: true,
        render: () => (
          <div className="flex h-flower-width w-full flex-col overflow-auto border border-hairline">
            <FlowerPanel view={panelView()} />
          </div>
        ),
      },
      {
        name: 'a petal selected',
        wide: true,
        ...ONE_PETAL,
        render: () => (
          <div className="flex h-flower-width w-full flex-col overflow-auto border border-hairline">
            <FlowerPanel
              view={panelView('astro-stakers.poolv1.near')}
              petal={petal('near-validators-default', (p) => p.rank === 1)}
              unit="NEAR"
            />
          </div>
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
    id: 'Stage',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/canvas/Stage.tsx',
    states: [
      {
        name: 'anything in its world',
        wide: true,
        render: () => (
          <div className="flex h-tile-width w-full flex-col border border-hairline">
            <Stage label="Three squares" fitKey="squares">
              <rect className="fill-accent" x="0" y="0" width="100" height="100" />
              <rect className="fill-hairline" x="120" y="0" width="100" height="100" />
              <rect className="fill-primary" x="240" y="0" width="100" height="100" />
            </Stage>
          </div>
        ),
      },
    ],
  },
  {
    id: 'StagedFlower',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/canvas/StagedFlower.tsx',
    states: [
      {
        name: 'a flower on a stage',
        wide: true,
        render: () => (
          <div className="flex h-tile-width w-full flex-col border border-hairline">
            <Stage label="NEAR validators" fitKey="flower">
              <StagedFlower svg={drawn().svg} selected="astro-stakers.poolv1.near" />
            </Stage>
          </div>
        ),
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
        name: 'by kind',
        wide: true,
        render: () => (
          <LegendKeys keys={legendKeys(golden('near-validators-default').rendered.legend)} />
        ),
      },
      {
        name: 'a petal selected',
        wide: true,
        render: () => (
          <LegendKeys keys={legendKeys(golden('near-validators-default').rendered.legend, true)} />
        ),
      },
      {
        name: 'with backers',
        wide: true,
        render: () => (
          <LegendKeys keys={legendKeys(golden('near-validators-backers').rendered.legend)} />
        ),
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
  Workspace: 'wires the ViewModel to its views, and each of those views is here',
  SiteChrome: 'the Nav, drawn here, around a reading column; it holds no state of its own',
};
