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
import { MetaRow } from '../components/ui/MetaRow.tsx';
import { Nav } from '../components/ui/Nav.tsx';
import { Numeral } from '../components/ui/Numeral.tsx';
import { Section } from '../components/ui/Section.tsx';
import { SectionHead } from '../components/ui/SectionHead.tsx';
import { SiteChrome } from '../components/ui/SiteChrome.tsx';
import { Surface } from '../components/ui/Surface.tsx';
import { Terminal } from '../components/ui/Terminal.tsx';
import { TextLink } from '../components/ui/TextLink.tsx';
import { Thumb } from '../components/ui/Thumb.tsx';
import { Transcript } from '../components/ui/Transcript.tsx';
import { Wordmark } from '../components/ui/Wordmark.tsx';
import {
  cell,
  type GlyphKind,
  heroFlower,
  heroLeaders,
  readingFlower,
  type ThumbKind,
} from '../lib/figures.ts';
import { landingCopy } from '../lib/landing-copy.ts';
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
  group: 'Primitives' | 'The conversation' | 'The flower' | 'Reading' | 'Actions' | 'Landing';
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
  group: 'Landing',
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
        name: 'primary, small, arrow',
        figmaName: 'Petals / Ask box',
        figmaNode: '67:2512',
        render: () => (
          <Button size="small" arrow>
            Ask
          </Button>
        ),
      },
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
    states: [
      { name: 'default', render: () => <TextLink href="#textlink">Explore</TextLink> },
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
    id: 'Arrow',
    group: 'Primitives',
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
    id: 'Wordmark',
    group: 'Primitives',
    figmaName: 'Petals / Wordmark',
    figmaNode: '12:12',
    source: 'apps/web/components/ui/Wordmark.tsx',
    surfaces: surfaceNames,
    states: [
      { name: 'nav', render: () => <Wordmark /> },
      { name: 'footer', wide: true, render: () => <Wordmark size="footer" /> },
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
        name: 'asking at an address',
        wide: true,
        render: () => <AskBox label="Ask" placeholder={ASK.placeholder} to="#askbox" />,
      },
      {
        name: 'small',
        wide: true,
        figmaName: 'Petals / Ask box',
        figmaNode: '67:2512',
        render: () => (
          <AskBox label="Ask" placeholder="Who decides in this DAO?" size="small" to="#askbox" />
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
    id: 'Caption',
    group: 'Primitives',
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
    id: 'MetaRow',
    group: 'Primitives',
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
    id: 'ActionRow',
    group: 'Primitives',
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
    id: 'AskBlock',
    group: 'Landing',
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
    id: 'Section',
    group: 'Primitives',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Section.tsx',
    states: [
      ...surfaceNames.map((kind) => ({
        name: `${kind}, section padding`,
        wide: true,
        render: () => (
          <Section kind={kind}>
            <Caption>A band on {kind}</Caption>
          </Section>
        ),
      })),
      {
        name: 'a rule on top, hero padding',
        wide: true,
        render: () => (
          <Section rule="top" padding="hero">
            <Caption>hero</Caption>
          </Section>
        ),
      },
      {
        name: 'a rule below, nav padding',
        wide: true,
        render: () => (
          <Section as="nav" rule="bottom" padding="nav">
            <Caption>nav</Caption>
          </Section>
        ),
      },
      {
        name: 'footer padding',
        wide: true,
        render: () => (
          <Section as="footer" padding="footer">
            <Caption>footer</Caption>
          </Section>
        ),
      },
    ],
  },
  {
    id: 'SectionHead',
    group: 'Primitives',
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
    id: 'Numeral',
    group: 'Primitives',
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
    id: 'Callout',
    group: 'Primitives',
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
        name: 'without one',
        figmaName: 'Callout',
        figmaNode: '67:2529',
        render: () => (
          <Callout who={landingCopy.howItWorks.stepThree.who}>
            {landingCopy.howItWorks.stepThree.text}
          </Callout>
        ),
      },
    ],
  },
  {
    id: 'Transcript',
    group: 'Landing',
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
      {
        name: 'no lines yet',
        wide: true,
        render: () => <Transcript start={FIGURE.start} end={FIGURE.end} lines={[]} />,
      },
    ],
  },
  {
    id: 'Terminal',
    group: 'Landing',
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
    id: 'FaqItem',
    group: 'Landing',
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
    id: 'GalleryCard',
    group: 'Landing',
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
    id: 'Glyph',
    group: 'Primitives',
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
    id: 'Thumb',
    group: 'Primitives',
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
    id: 'Cell',
    group: 'Primitives',
    figmaName: 'Petals / Cell',
    figmaNode: '12:16',
    source: 'apps/web/components/ui/Cell.tsx',
    surfaces: surfaceNames,
    states: [{ name: 'as wide as its parent', wide: true, render: () => <Cell /> }],
  },
  {
    id: 'CellRepeat',
    group: 'Primitives',
    figmaName: 'Petals / Cell repeat',
    figmaNode: '24:209',
    source: 'apps/web/components/ui/Cell.tsx',
    surfaces: surfaceNames,
    states: [{ name: 'as wide as its parent', wide: true, render: () => <CellRepeat /> }],
  },
  {
    id: 'Drawing',
    group: 'Primitives',
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
    id: 'Nav',
    group: 'Primitives',
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
  {
    id: 'Footer',
    group: 'Landing',
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
    id: 'SiteChrome',
    group: 'Primitives',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/SiteChrome.tsx',
    states: [
      {
        name: 'around a page',
        wide: true,
        render: () => <SiteChrome>A page in the reading column.</SiteChrome>,
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
  section('Hero', 'apps/web/components/landing/Hero.tsx', 'Hero', '66:2188', () => <Hero />),
  section(
    'AnnotatedFlower',
    'apps/web/components/landing/AnnotatedFlower.tsx',
    'Figure · annotated flower',
    '66:2206',
    () => <AnnotatedFlower />,
  ),
  {
    id: 'HeroesStrip',
    group: 'Landing',
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
      {
        name: 'another one current',
        render: () => <HeroesStrip thumbs={['blocs', 'even', 'tower']} active={2} />,
      },
    ],
  },
  section(
    'FlowerRead',
    'apps/web/components/landing/FlowerRead.tsx',
    'A flower, already read',
    '66:2232',
    () => <FlowerRead />,
  ),
  {
    id: 'Step',
    group: 'Landing',
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
];

/** Exported by components/ but not drawn here, each for a stated reason. */
export const NOT_IN_LAB: Record<string, string> = {
  AgentHome: 'a server page: it fetches, so it has no state to show from props',
  Chat: 'wires the ViewModel to its views, and each of those views is here',
};
