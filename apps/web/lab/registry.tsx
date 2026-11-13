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

import type { Credit } from '@petal/core';
import { DEFAULT_VIEW, DIMENSIONS, EVERY_FLOWER, inUse } from '@petal/core/view';
import { grades } from '@petal/core/wedge/keys';
import type { SurfaceName } from '@petal/tokens';
import { surfaceNames } from '@petal/tokens';
import type { ReactNode } from 'react';
import { CopyPrompt } from '../components/CopyPrompt.tsx';
import { AnsweredBy } from '../components/chat/AnsweredBy.tsx';
import { CeremonyCard } from '../components/chat/CeremonyCard.tsx';
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
import { Flower } from '../components/Flower.tsx';
import { FlowerSheet } from '../components/FlowerSheet.tsx';
import { FlowerTile } from '../components/FlowerTile.tsx';
import { Interpretation, SignatureLine } from '../components/Interpretation.tsx';
import { Legend, LegendKeys } from '../components/Legend.tsx';
import { AnnotatedFlower } from '../components/landing/AnnotatedFlower.tsx';
import { BackIt } from '../components/landing/BackIt.tsx';
import { BuildWithUs } from '../components/landing/BuildWithUs.tsx';
import { GallerySection } from '../components/landing/GallerySection.tsx';
import { GiveToAgent } from '../components/landing/GiveToAgent.tsx';
import { Hero } from '../components/landing/Hero.tsx';
import { Glass } from '../components/landing/HeroGlass.tsx';
import { HeroStory } from '../components/landing/HeroStory.tsx';
import { HeroTools } from '../components/landing/HeroTools.tsx';
import { HowItWorks } from '../components/landing/HowItWorks.tsx';
import { LandingMap } from '../components/landing/LandingMap.tsx';
import { LiveReading } from '../components/landing/LiveReading.tsx';
import { MapHero } from '../components/landing/MapHero.tsx';
import { Questions } from '../components/landing/Questions.tsx';
import { Scene } from '../components/landing/Scene.tsx';
import { StoryFlower } from '../components/landing/StoryFlower.tsx';
import { MapClaims } from '../components/MapClaims.tsx';
import { MapLayers } from '../components/MapLayers.tsx';
import { MapList } from '../components/MapList.tsx';
import { MapProposal } from '../components/MapProposal.tsx';
import { MapSearch } from '../components/MapSearch.tsx';
import { MapStrata } from '../components/MapStrata.tsx';
import { Markdown } from '../components/Markdown.tsx';
import { NextSteps } from '../components/NextSteps.tsx';
import { Oops } from '../components/Oops.tsx';
import { PetalClaims } from '../components/PetalClaims.tsx';
import { PetalDetails } from '../components/PetalDetails.tsx';
import { PowerQuote } from '../components/PowerQuote.tsx';
import { PublishFlow } from '../components/PublishFlow.tsx';
import { PublishPress } from '../components/PublishPress.tsx';
import { QuotePanel } from '../components/QuotePanel.tsx';
import { SourceList } from '../components/Sources.tsx';
import { ToMapLines } from '../components/ToMapLines.tsx';
import { ActionRow } from '../components/ui/ActionRow.tsx';
import { AskBlock } from '../components/ui/AskBlock.tsx';
import { AskBox } from '../components/ui/AskBox.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { BarBox } from '../components/ui/BarBox.tsx';
import { Button } from '../components/ui/Button.tsx';
import { Callout } from '../components/ui/Callout.tsx';
import { Card } from '../components/ui/Card.tsx';
import { ChooseFile } from '../components/ui/ChooseFile.tsx';
import { ColourPick } from '../components/ui/ColourPick.tsx';
import { Drawing } from '../components/ui/Drawing.tsx';
import { EmptySlot } from '../components/ui/EmptySlot.tsx';
import { FaqItem } from '../components/ui/FaqItem.tsx';
import { Field } from '../components/ui/Field.tsx';
import { Footer } from '../components/ui/Footer.tsx';
import { GalleryCard } from '../components/ui/GalleryCard.tsx';
import { Icon, type IconName } from '../components/ui/Icon.tsx';
import { IconButton } from '../components/ui/IconButton.tsx';
import { LineRow } from '../components/ui/LineRow.tsx';
import { Logo } from '../components/ui/Logo.tsx';
import { MetaRow } from '../components/ui/MetaRow.tsx';
import { Mono } from '../components/ui/Mono.tsx';
import { Nav } from '../components/ui/Nav.tsx';
import { NavItem } from '../components/ui/NavItem.tsx';
import { OrgBadge } from '../components/ui/OrgBadge.tsx';
import { Overlay } from '../components/ui/Overlay.tsx';
import { PlateLink } from '../components/ui/PlateLink.tsx';
import { Ramp } from '../components/ui/Ramp.tsx';
import { Range } from '../components/ui/Range.tsx';
import { RowField } from '../components/ui/RowField.tsx';
import { Section } from '../components/ui/Section.tsx';
import { SectionHead } from '../components/ui/SectionHead.tsx';
import { Select } from '../components/ui/Select.tsx';
import { SourceLink } from '../components/ui/SourceLink.tsx';
import { Switch } from '../components/ui/Switch.tsx';
import { Terminal } from '../components/ui/Terminal.tsx';
import { TextLink } from '../components/ui/TextLink.tsx';
import { Tip } from '../components/ui/Tip.tsx';
import { Transcript } from '../components/ui/Transcript.tsx';
import { Wordmark } from '../components/ui/Wordmark.tsx';
import { ViewLegend } from '../components/ViewLegend.tsx';
import { WalletFacts } from '../components/WalletFacts.tsx';
import { Claims } from '../components/workspace/Claims.tsx';
import { Contribution } from '../components/workspace/Contribution.tsx';
import { Conversations } from '../components/workspace/Conversations.tsx';
import { FlowerShelf } from '../components/workspace/FlowerShelf.tsx';
import { Funds } from '../components/workspace/Funds.tsx';
import { MappingBox } from '../components/workspace/MappingBox.tsx';
import { NotSignedIn } from '../components/workspace/NotSignedIn.tsx';
import { Profile } from '../components/workspace/Profile.tsx';
import { ProfileEditor } from '../components/workspace/ProfileEditor.tsx';
import { ProfileHead } from '../components/workspace/ProfileHead.tsx';
import { ReadingKey } from '../components/workspace/ReadingKey.tsx';
import { TipControl } from '../components/workspace/TipControl.tsx';
import { DimensionChoices, ViewControls } from '../components/workspace/ViewControls.tsx';
import { Wallets } from '../components/workspace/Wallets.tsx';
import { FlowerPanel } from '../flower/FlowerPanel.tsx';
import type { PublishableData } from '../lib/agent-client.ts';
import { ceremonyView } from '../lib/ceremony.ts';
import type { AnnotationRow } from '../lib/claim-lines.ts';
import { contributionView } from '../lib/contribution-view.ts';
import type { DrawingKind } from '../lib/figures.ts';
import { keysOf, oneKey, readingKey, svgImage } from '../lib/flower-view.ts';
import { settledMs } from '../lib/hero-story.ts';
import { intentWords, type TopUpView, tokenChoices } from '../lib/intents.ts';
import { type JobControlsView, jobMoves, jobWords } from '../lib/jobs.ts';
import { landingCopy } from '../lib/landing-copy.ts';
import type { ProfileEditorView } from '../lib/lobby-view.ts';
import { mapClaimGroups } from '../lib/map-claims.ts';
import { mappingView, toMapLines } from '../lib/mapping.ts';
import { drawingTile, type MapCard, mapTile } from '../lib/maps.ts';
import { parseMarkdown } from '../lib/markdown.ts';
import { oopsWords } from '../lib/oops-words.ts';
import { openingMessage } from '../lib/opening.ts';
import { flowerPanelView, type PanelFlower, shelfView } from '../lib/panel-view.ts';
import { viewChoices } from '../lib/person-view.ts';
import { POWER_QUOTES } from '../lib/power-quotes.ts';
import { claimsView, usageView, walletRows } from '../lib/profile-view.ts';
import { publishPressView, publishWords, signerOf } from '../lib/publish-press.ts';
import type { Done } from '../lib/thread.ts';
import { answeredBy, composerView, type TurnRow, threadView } from '../lib/thread-view.ts';
import { tipLine } from '../lib/tip.ts';
import { withData, withScale } from '../lib/view-edit.ts';
import {
  entry,
  flowerRow,
  golden,
  logo,
  MARKDOWN,
  petal,
  prepared,
  STEPS,
  signature,
  specimen,
  TURN_ROWS,
} from './fixtures.ts';
import { LabComposer, LabPetalClose } from './LabComposer.tsx';
import { LabChains, LabFoldingLegend, LabLegend } from './LabOverlays.tsx';
import { LabAction, LabAgent, LabFold, LabProject, LabRail } from './LabPanel.tsx';
import { LAB_CLAIM_NAMES, LAB_MAP_CLAIMS } from './map-claims-fixtures.ts';
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
  threadView({
    items: [],
    busy,
    runId: 'run',
    turn,
    lostAgain,
    recorded: false,
    view: DEFAULT_VIEW,
  });
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

/** Maps as the live list gives them (names from it, 11 Nov), each picture one of the goldens: MapList's rows. */
const pictures = () =>
  (['near-validators-default', 'house-of-stake-default', 'near-validators-backers'] as const).map(
    (g) => svgImage(golden(g).rendered.svg),
  );
const mapCard = (
  [id, name, title, chain, address, readings, as_of]: [
    string,
    string,
    string,
    string,
    string | null,
    number,
    string,
  ],
  i: number,
  pics: readonly string[],
): MapCard => ({
  id,
  name,
  title,
  about: title,
  chain,
  address,
  picture: pics[i % pics.length] as string,
  view_url: '#maplist',
  keys: [],
  readings: Array.from({ length: readings }, (_, n) => ({
    snapshot: `${id}:${n}`,
    as_of,
    network: id,
    about: title,
    title,
    count: null,
    made_by: 'mapping.petals.near',
    drawings: ['Default', 'Who backs it'].map((d, k) => ({
      sha: `${id}:${n}:${k}`,
      name: d,
      view_url: '#maplist',
      picture: pics[(i + k) % pics.length] as string,
      keys: [],
      made_by: 'mapping.petals.near',
    })),
  })),
});
const SOL = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const maps = () => {
  const pics = pictures();
  return (
    [
      [
        'near:validators',
        'NEAR validators',
        'NEAR validators',
        'near:mainnet',
        null,
        3,
        '2026-11-10T19:42:00Z',
      ],
      [
        `${SOL}:SKRb`,
        'Seeker / SKR',
        'SPL holders SKRb…ZhW3',
        SOL,
        'SKRbvo6Gf7GondiT3BbTfuRDPqLWei4j2Qy2NPGZhW3',
        1,
        '2026-11-09T03:08:50Z',
      ],
      [
        'eip155:100:0x30d1',
        'Accelerationist Voting',
        'vACCL holders, Gnosis',
        'gnosis',
        '0x30d1185c234a2e460f396e2fe3c71f5dc4a06add',
        1,
        '2026-11-09T03:03:40Z',
      ],
      [
        `${SOL}:WCTk`,
        'WalletConnect Token / WCT',
        'SPL holders WCTk…YTBY',
        SOL,
        'WCTk5xWdn5SYg56twGj32sUF3W4WFQ48ogezLBuYTBY',
        2,
        '2026-11-09T03:02:09Z',
      ],
      [
        'eip155:100:0xb11a',
        'Yggdrasil',
        'YGG holders, Gnosis',
        'gnosis',
        '0xb11a9938052c8fa59fd3f3875c3cbf1b2c0ac20e',
        1,
        '2026-11-09T02:55:40Z',
      ],
      [
        'eip155:1:0xdefa',
        'KNC',
        'KNC active holders, Ethereum',
        'ethereum',
        '0xdefa4e8a7bcba345f687a2f1456f5edd9ce97202',
        1,
        '2026-11-09T02:37:11Z',
      ],
      [
        'eip155:1:0x64aa',
        'OHM',
        'OHM active holders, Ethereum',
        'ethereum',
        '0x64aa3364f17a4d01c6f1751fd97c2bd3d7e7f1d5',
        4,
        '2026-11-09T02:30:47Z',
      ],
      [
        'near:house-of-stake',
        'House of Stake',
        'veNEAR holders',
        'near:mainnet',
        'venear.dao',
        1,
        '2026-11-08T12:00:00Z',
      ],
    ] as const
  ).map((m, i) => mapCard([...m], i, pics));
};
const mapRows = (maps: readonly MapCard[]) => maps.map((m) => ({ key: m.id, ...mapTile(m) }));

/** The colours a golden drawing paints, and its tail's tone last, as its own key gives them: the legend's keys. */
const goldenKeys = () => {
  const legend = golden('near-validators-default').rendered.legend;
  const of = (primitive: string) =>
    keysOf(legend.find((i) => i.primitive === primitive)?.keys ?? []);
  return oneKey([of('colour'), of('tail')]);
};

/** A job's controls (swarm.md, step 3), as its row shows them at each step. */
const JOB_ACTIONS = {
  stop: () => {},
  retry: () => {},
  pick: () => {},
  setTo: () => {},
  handOver: () => {},
};
const JOB_CONTROLS = {
  taken: {
    heard: jobWords.heard('14:02'),
    moves: jobMoves('taken'),
    picking: null,
    busy: false,
    failed: null,
    actions: JOB_ACTIONS,
  },
  picking: {
    heard: jobWords.heard('14:02'),
    moves: jobMoves('taken'),
    picking: {
      choices: [
        { value: 'claude-code', label: 'Claude Code' },
        { value: 'codex', label: 'Codex' },
      ],
      to: 'claude-code',
    },
    busy: false,
    failed: null,
    actions: JOB_ACTIONS,
  },
  stopped: {
    heard: null,
    moves: jobMoves('stopped'),
    picking: null,
    busy: false,
    failed: null,
    actions: JOB_ACTIONS,
  },
} satisfies Record<string, JobControlsView>;

/** Paying with another token through NEAR Intents, as the pay row shows it at each step. */
const TOPUP_BASE: TopUpView = {
  open: true,
  groups: tokenChoices([
    { asset: 'nep141:base-usdc', chain: 'base', symbol: 'USDC', decimals: 6, usd: 1 },
    { asset: 'nep141:eth-usdc', chain: 'eth', symbol: 'USDC', decimals: 6, usd: 1 },
    { asset: 'nep141:sol', chain: 'sol', symbol: 'SOL', decimals: 9, usd: 150 },
  ]),
  asset: 'nep141:base-usdc',
  usd: '5',
  refund: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
  refundLabel: intentWords.refund('Base'),
  getting: false,
  error: null,
  sent: null,
  copied: null,
  actions: {
    open: () => {},
    setAsset: () => {},
    setUsd: () => {},
    setRefund: () => {},
    get: () => {},
    copy: () => {},
    again: () => {},
  },
};
const TOPUP = {
  picking: TOPUP_BASE,
  sending: {
    ...TOPUP_BASE,
    sent: {
      line: intentWords.send('5.0125', 'USDC', 'Base'),
      address: '0x76b4c56085ED136a8744D52bE956396624a730E8',
      memo: null,
      before: '19:42',
      status: intentWords.status.PENDING_DEPOSIT,
      ended: false,
      landed: false,
    },
  },
  landed: {
    ...TOPUP_BASE,
    sent: {
      line: '',
      address: '',
      memo: null,
      before: null,
      status: intentWords.added(5),
      ended: true,
      landed: true,
    },
  },
} satisfies Record<string, TopUpView>;

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

/** Claims for the lab: a name and a note about one account, a sourced link about another. */
const LAB_CLAIMS: AnnotationRow[] = [
  {
    claim: {
      subject: 'eip155:100:0x3703cde9c3a3f5b0e8fc0e5a3b3c3a3e2e3d03b6',
      verb: 'named',
      object: { value: 'RaidGuild' },
      kind: 'stated',
      by: 'near:mainnet:a-name.near',
    },
    exploration: null,
    added_at: '2026-11-11T10:00:00Z',
  },
  {
    claim: {
      subject: 'eip155:100:0x3703cde9c3a3f5b0e8fc0e5a3b3c3a3e2e3d03b6',
      verb: 'noted',
      object: { value: 'The guild’s treasury: proposals move its funds.' },
      kind: 'sourced',
      evidence: [{ proposal: 'proposal:eip155:100:168', url: 'https://admin.daohaus.club' }],
      by: 'tool:codex@1',
    },
    exploration: null,
    added_at: '2026-11-11T10:05:00Z',
  },
  {
    claim: {
      subject: 'near:mainnet:a-validator.poolv1.near',
      verb: 'linked',
      object: { value: 'https://near.org' },
      kind: 'inferred',
      by: 'near:mainnet:a-name.near',
      via: 'tool:petals-agent@1',
    },
    exploration: null,
    added_at: '2026-11-10T18:00:00Z',
  },
];

/** A credit record for the lab, in core's credit/v1 shape: two published layers. */
const LAB_LAYER = {
  petal: 'claim/v3',
  publication: 'f7'.repeat(32),
  seq: 2,
  confirmed: 0,
  built_on_by: [],
  reused_by: [],
  built_on: 0,
};
const LAB_CREDIT: Credit = {
  petal: 'credit/v1',
  author: 'near:mainnet:a-name.near',
  rule: 'points/v1',
  compose: 'compose/v1',
  layers: [
    {
      ...LAB_LAYER,
      sha256: 'a1'.repeat(32),
      map: 'eip155:100:0xfe1084bc16427e5eb7f13fc19bcd4e641f7d571f',
      title: 'RaidGuild: who holds the shares',
      published_at: '2026-11-11T10:00:00Z',
      first: 120,
    },
    {
      ...LAB_LAYER,
      sha256: 'b2'.repeat(32),
      map: 'near:mainnet:astro-stakers.poolv1.near',
      title: 'Astro Stakers: its delegators',
      published_at: '2026-11-12T18:00:00Z',
      first: 8,
    },
  ],
  totals: { layers: 2, first: 128, confirmed: 35, built_on: 4 },
  composed_from: ['f7'.repeat(32)],
};

/** The editor's view for the lab: every control does nothing. */
const editorView = (over: Partial<ProfileEditorView>): ProfileEditorView => ({
  creating: false,
  account: { shown: 'a-name.near', full: 'a-name.near' },
  draft: {
    name: 'A name on NEAR Social',
    about: 'A short bio, in the account’s own words.',
    links: [{ service: 'github', value: 'a-handle' }],
  },
  picture: null,
  phase: 'editing',
  problem: null,
  setName: () => {},
  setAbout: () => {},
  setLink: () => {},
  addLink: () => {},
  removeLink: () => {},
  choosePicture: () => {},
  save: () => {},
  cancel: () => {},
  ...over,
});

/** Wave 8's fixtures: two authors on TRUMP, Petals' mapping first (specs/005-mapping-brain/composition.md). */
const LAB_PETALS = { author: 'near:mainnet:mapping.petals.near', name: 'Petals’ mapping' };
const LAB_PUBLISH: PublishableData = {
  about: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:6p6x',
  name: 'TRUMP',
  ready: 0,
  private: [],
  published: 0,
  layers: [
    {
      sha256: 'a1',
      petal: 'snapshot/v1',
      title: 'TRUMP holders on Solana',
      cases: {
        new_moment: { states: [{ state: { block: 465695924 }, newest: { block: 465600000 } }] },
        new_subjects: { count: 212 },
        match: { count: 60, authors: [LAB_PETALS] },
      },
    },
    {
      sha256: 'b2',
      petal: 'vesting/v1',
      title: 'TRUMP vesting',
      cases: { new_data: { whats: ['vesting/schedule'] } },
    },
  ],
  totals: {
    new_data: { whats: ['vesting/schedule'] },
    new_moment: { states: [{ state: { block: 465695924 }, newest: { block: 465600000 } }] },
    new_subjects: { count: 212 },
    match: { count: 60, authors: [LAB_PETALS] },
  },
  adds: [
    {
      layer: 'Proposals',
      kind: 'proposals',
      label: 'Proposals kept',
      count: 1,
      goes: false,
      why: 'proposals you kept publish later',
    },
  ],
};
const LAB_SIGN = signerOf([
  {
    network: 'mainnet',
    account_id: 'alice.near',
    proved_at: '2026-11-11T09:00:00Z',
    author: 'near:mainnet:alice.near',
  },
]);

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
  {
    id: 'HeroStory',
    group: 'Sections',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/landing/HeroStory.tsx',
    // HERO ART's V2, approved by Elco (11 Nov); with its lab controls at /lab/landing-hero
    states: [{ name: 'as approved', wide: true, render: () => <HeroStory /> }],
  },
  {
    id: 'StoryFlower',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/landing/StoryFlower.tsx',
    // the hero story's symbolic flower, settled at each beat
    states: [0, 1, 2, 3, 4, 5].map((beat) => ({
      name: `beat ${beat + 1}`,
      render: () => (
        <div className="aspect-3/2 w-full">
          <StoryFlower beat={beat} t={settledMs(beat)} />
        </div>
      ),
    })),
  },
  {
    id: 'HeroTools',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/landing/HeroTools.tsx',
    // the hero's Tools box, the map's own rows, settled at each beat
    states: [0, 1, 2, 4].map((beat) => ({
      name: `beat ${beat + 1}`,
      render: () => (
        <div className="w-1/3">
          <HeroTools beat={beat} t={settledMs(beat)} />
        </div>
      ),
    })),
  },
  {
    id: 'Glass',
    group: 'Marks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/landing/HeroGlass.tsx',
    // the material behind the hero's bubbles: light for the question, smoked ink for the answer
    states: (['light', 'dark'] as const).map((tone) => ({
      name: tone,
      render: () => (
        <div className="relative w-1/2 p-block-gap">
          <Glass tone={tone} glint={0.5} />
          <p className={`relative my-0 type-lead ${tone === 'dark' ? 'text-on-action' : ''}`}>
            {tone === 'dark' ? 'Here’s how power is shared.' : 'Show me my community.'}
          </p>
        </div>
      ),
    })),
  },
  {
    id: 'MapHero',
    group: 'Sections',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/landing/MapHero.tsx',
    // LANDING's lean for the new hero (11 Nov), in place at /lab/landing-hero; no Figma frame yet
    states: [{ name: "LANDING's lean", wide: true, render: () => <MapHero /> }],
  },
  section(
    'LiveReading',
    'apps/web/components/landing/LiveReading.tsx',
    'A flower, already read',
    '66:2232',
    () => <LiveReading view={DEFAULT_VIEW} />,
  ),
  section(
    'HowItWorks',
    'apps/web/components/landing/HowItWorks.tsx',
    'How it works',
    '181:2343',
    () => <HowItWorks />,
  ),
  section(
    'GiveToAgent',
    'apps/web/components/landing/GiveToAgent.tsx',
    'Closing ask',
    '66:2336',
    () => <GiveToAgent />,
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
  {
    ...section(
      'BackIt',
      'apps/web/components/landing/BackIt.tsx',
      'Join the community',
      '66:2346',
      () => <BackIt />,
    ),
    states: [
      {
        name: 'as designed',
        wide: true,
        figmaName: 'Join the community',
        figmaNode: '66:2346',
        render: () => <BackIt />,
      },
      // LANDING's lean for the split's empty half (11 Nov), in place at /lab/landing-hero
      { name: 'columns', wide: true, render: () => <BackIt layout="columns" /> },
    ],
  },
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
    id: 'PlateLink',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/PlateLink.tsx',
    states: [
      {
        name: 'a way in, on paper',
        render: () => (
          <PlateLink href="#platelink" action={landingCopy.backIt.ways[0].action}>
            <span className="type-title">{landingCopy.backIt.ways[0].title}</span>
            <span className="type-body">{landingCopy.backIt.ways[0].body}</span>
          </PlateLink>
        ),
      },
      {
        name: 'a slot with no address yet',
        render: () => (
          <PlateLink action={landingCopy.backIt.ways[3].action}>
            <span className="type-title">{landingCopy.backIt.ways[3].title}</span>
          </PlateLink>
        ),
      },
    ],
  },
  {
    id: 'LandingMap',
    group: 'Blocks',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/landing/LandingMap.tsx',
    states: [
      {
        name: 'live, once near',
        wide: true,
        render: () => <LandingMap />,
      },
    ],
  },
  {
    id: 'Scene',
    group: 'Blocks',
    figmaName: 'Petals / Illustrated scene',
    figmaNode: '179:2273',
    source: 'apps/web/components/landing/Scene.tsx',
    states: [
      {
        name: 'in the row',
        render: () => (
          <ul className="m-0 flex list-none p-0">
            <Scene {...landingCopy.howItWorks.scenes[0]} numeral="01" />
          </ul>
        ),
      },
      {
        name: 'in focus',
        render: () => (
          <ul className="m-0 flex list-none p-0">
            <Scene {...landingCopy.howItWorks.scenes[0]} numeral="01" current />
          </ul>
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
        render: () => <FaqItem {...FAQ} />,
      },
      {
        name: 'closed',
        wide: true,
        render: () => <FaqItem {...FAQ} open={false} />,
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
        render: () => <SectionHead size="compact" title={landingCopy.giveToAgent.title} />,
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
            title={landingCopy.giveToAgent.title}
            body={landingCopy.giveToAgent.body}
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
            <Button href="#actionrow">{landingCopy.nav.ask}</Button>
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
            <Button href="#actionrow">{landingCopy.nav.ask}</Button>
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
    id: 'Logo',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Logo.tsx',
    states: [
      {
        name: "a logo, round, an icon's size",
        render: () => <Logo src={logo('magic-eden')} />,
      },
      {
        name: "in a row of the map's chain list",
        render: () => (
          <div className="w-tile-width">
            <NavItem
              onClick={() => undefined}
              chosen
              logo={logo('safe')}
              label="Gnosis"
              trail="15"
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'OrgBadge',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/OrgBadge.tsx',
    states: [
      {
        name: 'with its logo',
        render: () => <OrgBadge name="Magic Eden" symbol="ME" logo={logo('magic-eden')} />,
      },
      {
        name: 'its logo, and a name that is its symbol',
        render: () => <OrgBadge name="SAFE" symbol="SAFE" logo={logo('safe')} />,
      },
      {
        name: 'no logo: its token symbol',
        render: () => <OrgBadge name="Seeker" symbol="SKR" />,
      },
      {
        name: 'no logo, and a name that is its symbol',
        render: () => <OrgBadge name="OHM" symbol="OHM" />,
      },
      {
        name: 'its type: a DAO',
        render: () => <OrgBadge name="RaidGuild" symbol="RAID" types={['DAO']} />,
      },
      {
        name: 'several types at once',
        render: () => (
          <OrgBadge
            name="SAFE"
            symbol="SAFE"
            logo={logo('safe')}
            types={['multisig', 'treasury']}
          />
        ),
      },
      {
        name: 'any value the data gives',
        render: () => <OrgBadge name="Moloch DAO" symbol="MOL" types={['Moloch v2', 'DAO']} />,
      },
      {
        name: 'no room: the type is cut before the name',
        render: () => (
          <div className="flex w-drawing-144">
            <OrgBadge name="Seeker" symbol="SKR" types={['token', 'Solana Mobile']} />
          </div>
        ),
      },
      {
        name: 'a long name in a narrow place',
        render: () => (
          <div className="flex w-drawing-144">
            <OrgBadge name="Accelerationist Voting" symbol="vACCL" />
          </div>
        ),
      },
      {
        name: 'over a busy flower',
        wide: true,
        render: () => (
          <div className="relative w-full max-w-flower-width">
            {/* biome-ignore lint/performance/noImgElement: a data URL of a golden drawing */}
            <img
              src={svgImage(golden('near-validators-default').rendered.svg)}
              alt=""
              className="block w-full"
            />
            <div className="absolute inset-0 flex flex-wrap content-center items-center justify-center gap-space-8 p-column-gap">
              <OrgBadge
                name="Magic Eden"
                symbol="ME"
                logo={logo('magic-eden')}
                types={['marketplace']}
              />
              <OrgBadge name="SAFE" symbol="SAFE" logo={logo('safe')} types={['multisig']} />
              <OrgBadge name="Seeker" symbol="SKR" />
              <OrgBadge name="OHM" symbol="OHM" />
              <OrgBadge name="NEAR validators" symbol="NEAR" />
            </div>
          </div>
        ),
      },
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
    id: 'ChooseFile',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/ChooseFile.tsx',
    states: [
      {
        name: 'a picture',
        render: () => <ChooseFile label="Choose a picture" accept="image/png" onFile={() => {}} />,
      },
    ],
  },
  {
    id: 'Field',
    group: 'The workspace',
    figmaName: 'Petals / Field',
    figmaNode: '164:2293',
    source: 'apps/web/components/ui/Field.tsx',
    states: [
      {
        name: 'one line',
        render: () => <Field id="lab-field-one" label="Name" value="A name" onChange={() => {}} />,
      },
      {
        name: 'several lines',
        render: () => (
          <Field
            id="lab-field-several"
            label="Bio"
            value="A short bio, in the account’s own words."
            onChange={() => {}}
            lines="several"
          />
        ),
      },
    ],
  },
  {
    id: 'ViewControls',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/ViewControls.tsx',
    states: [
      {
        name: 'the default, colour open (all of it, live: /lab/panel?state=settings)',
        render: () => (
          <ViewControls
            dimensions={DIMENSIONS}
            view={DEFAULT_VIEW}
            defaults={DEFAULT_VIEW}
            choices={viewChoices()}
            pieces={EVERY_FLOWER}
            open="colour"
            onOpen={() => {}}
            onPick={() => {}}
            onScale={() => {}}
            failed={null}
          />
        ),
      },
      {
        name: 'height open on a number, with its scale, and the default to put back',
        render: () => (
          <ViewControls
            dimensions={DIMENSIONS}
            view={withScale(DEFAULT_VIEW, 'height', 'linear')}
            defaults={DEFAULT_VIEW}
            choices={viewChoices()}
            pieces={EVERY_FLOWER}
            open="height"
            onOpen={() => {}}
            onPick={() => {}}
            onScale={() => {}}
            onReset={() => {}}
            failed={null}
          />
        ),
      },
    ],
  },
  {
    id: 'DimensionChoices',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/ViewControls.tsx',
    states: [
      {
        name: 'height’s choices, with its scale (Settings and the legend open these)',
        render: () => (
          <DimensionChoices
            dimension="height"
            view={DEFAULT_VIEW}
            defaults={DEFAULT_VIEW}
            fit={viewChoices().height}
            pieces={EVERY_FLOWER}
            onPick={() => {}}
            onScale={() => {}}
          />
        ),
      },
    ],
  },
  {
    id: 'TipControl',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/TipControl.tsx',
    states: [
      {
        name: 'folded, at 5% (live with the panel: /lab/panel?state=settings)',
        render: () => (
          <TipControl
            percent={5}
            scale={{ min: 0, max: 50, step: 1 }}
            open={false}
            onOpen={() => {}}
            onSlide={() => {}}
            onSet={() => {}}
            line=""
            failed={null}
          />
        ),
      },
      {
        name: 'open, on a measured turn',
        render: () => (
          <TipControl
            percent={10}
            scale={{ min: 0, max: 50, step: 1 }}
            open
            onOpen={() => {}}
            onSlide={() => {}}
            onSet={() => {}}
            line={tipLine(10, { model: 'DeepSeek V4.1 Flash', usd: 0.008 }, 3.56)}
            failed={null}
          />
        ),
      },
      {
        name: 'open at 0%, and a change not kept',
        render: () => (
          <TipControl
            percent={0}
            scale={{ min: 0, max: 50, step: 1 }}
            open
            onOpen={() => {}}
            onSlide={() => {}}
            onSet={() => {}}
            line={tipLine(0, null, null)}
            failed="tip_percent is off the scale"
          />
        ),
      },
    ],
  },
  {
    id: 'Tip',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Tip.tsx',
    states: [
      {
        name: 'said for a moment after a press, beside its row (Connect an agent: Copied)',
        render: () => (
          <span className="relative flex w-sidebar-width">
            <NavItem icon="plus" label="Connect an agent" onClick={() => {}} />
            <Tip label="Copied. Paste it into each agent." side="right" said />
          </span>
        ),
      },
      {
        name: 'a name, shown while the pointer or the keyboard is on its control (as IconButton’s)',
        render: () => <IconButton icon="close" label="Disconnect all agents" onClick={() => {}} />,
      },
    ],
  },
  {
    id: 'Range',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Range.tsx',
    states: [
      {
        name: 'at 5, on 0 to 50 in steps of 1',
        render: () => (
          <span className="flex w-sidebar-width flex-col">
            <Range
              label="Tip"
              min={0}
              max={50}
              step={1}
              value={5}
              shown="5%"
              onChange={() => {}}
              onSet={() => {}}
            />
          </span>
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
    id: 'MapList',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/MapList.tsx',
    states: [
      {
        name: 'every map, as the lobby and the gallery would list them',
        wide: true,
        render: () => (
          <div className="w-full max-w-content-width">
            <MapList label="On the map" rows={mapRows(maps())} />
          </div>
        ),
      },
      {
        name: 'narrow, as in the flower’s box before a flower',
        render: () => (
          <div className="w-gallery-flower-width">
            <MapList label="Already mapped" rows={mapRows(maps().slice(0, 3))} />
          </div>
        ),
      },
      {
        name: 'a map’s drawings, on its page',
        render: () => {
          const m = maps()[6] as MapCard;
          return (
            <div className="w-gallery-flower-width">
              <MapList
                label="Its drawings"
                rows={m.readings
                  .slice(0, 1)
                  .flatMap((r) => r.drawings.map((d) => ({ key: d.sha, ...drawingTile(m, r, d) })))}
              />
            </div>
          );
        },
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
    id: 'Oops',
    group: 'The workspace',
    figmaName: 'Petals / Oops, not logged in',
    figmaNode: '233:2359',
    source: 'apps/web/components/Oops.tsx',
    states: [
      {
        name: 'the 404',
        wide: true,
        render: () => (
          <Oops
            title={oopsWords.notFound.title}
            body={oopsWords.notFound.body}
            primary={<Button arrow>{oopsWords.home}</Button>}
            secondary={<Button variant="quiet">{oopsWords.map}</Button>}
          />
        ),
      },
      {
        name: 'a page that broke',
        wide: true,
        render: () => (
          <Oops
            title={oopsWords.broke.title}
            body={oopsWords.broke.body}
            primary={<Button>{oopsWords.broke.again}</Button>}
            secondary={<Button variant="quiet">{oopsWords.home}</Button>}
          />
        ),
      },
    ],
  },
  {
    id: 'NotSignedIn',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/NotSignedIn.tsx',
    states: [
      {
        name: '/make, not logged in',
        wide: true,
        render: () => <NotSignedIn question="" busy={false} failed={null} onConnect={() => {}} />,
      },
      {
        name: 'a question from the landing waiting, and the last try failed',
        wide: true,
        render: () => (
          <NotSignedIn
            question="Who stands behind NEAR's validators?"
            busy={false}
            failed="NEAR didn't answer. Try again."
            onConnect={() => {}}
          />
        ),
      },
      {
        name: 'a NEAR or an Ethereum wallet (wave 5)',
        wide: true,
        render: () => (
          <NotSignedIn
            question=""
            busy={false}
            failed={null}
            onConnect={() => {}}
            onConnectEvm={() => {}}
            onConnectSolana={() => {}}
          />
        ),
      },
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
                sub: 'Signed  ·  NEAR AI’s enclave  ·  $0.012 a turn · 0.003 NEAR',
                on: true,
              },
              {
                id: 'b',
                label: 'Claude Haiku 5.5',
                sub: 'Passed through  ·  Anthropic',
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
      {
        name: 'a worker on it, with its own conversation',
        render: () => (
          <JobRow
            text="Codex 2 is on it: Map RaidGuild's proposals"
            conversation="/make?elsewhere=exp_lab"
            controls={JOB_CONTROLS.taken}
          />
        ),
      },
      {
        name: 'handing it to another agent',
        render: () => (
          <JobRow
            text="Codex 2 is on it: Map RaidGuild's proposals"
            controls={JOB_CONTROLS.picking}
          />
        ),
      },
      {
        name: 'stopped',
        render: () => (
          <JobRow text="Stopped: Map RaidGuild's proposals" controls={JOB_CONTROLS.stopped} />
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
        name: 'a profile kept in Petals',
        render: () => (
          <ProfileHead
            account="a-name.near"
            social={{
              kind: 'profile',
              profile: { name: 'A name', about: null, avatar: null, links: [] },
              source: 'petals',
            }}
          />
        ),
      },
      {
        name: 'no public profile, a 64-character account',
        render: () => (
          <ProfileHead
            account="02b85f8c8bbfbcc34f4d30b55724f36336768f05c27c2d7f97936e5d699018fc"
            social={{ kind: 'none' }}
          />
        ),
      },
    ],
  },
  {
    id: 'ProfileEditor',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/ProfileEditor.tsx',
    states: [
      { name: 'editing a profile', render: () => <ProfileEditor view={editorView({})} /> },
      {
        name: 'making the first one',
        render: () => (
          <ProfileEditor
            view={editorView({
              creating: true,
              draft: { name: '', about: '', links: [{ service: '', value: '' }] },
            })}
          />
        ),
      },
      {
        name: 'saving',
        render: () => <ProfileEditor view={editorView({ phase: 'saving' })} />,
      },
      {
        name: "NEAR Social didn't take it",
        render: () => (
          <ProfileEditor
            view={editorView({
              phase: 'failed',
              problem:
                'NEAR Social didn’t take it, so nothing changed: profile/avatar: not a fastfs uri.',
            })}
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
        name: 'the NEAR Social profile, before Petals keeps one',
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
              source: 'near-social',
            }}
            onEdit={() => {}}
          />
        ),
      },
      {
        name: 'kept in Petals',
        render: () => (
          <Profile
            social={{
              kind: 'profile',
              profile: { name: 'A name', about: 'A short bio.', avatar: null, links: [] },
              source: 'petals',
            }}
            onEdit={() => {}}
          />
        ),
      },
      {
        name: 'just saved',
        render: () => (
          <Profile
            social={{
              kind: 'profile',
              profile: { name: 'A name', about: 'A short bio.', avatar: null, links: [] },
              source: 'petals',
            }}
            onEdit={() => {}}
            saved
          />
        ),
      },
      {
        name: 'just published to NEAR Social',
        render: () => (
          <Profile
            social={{
              kind: 'profile',
              profile: { name: 'A name', about: 'A short bio.', avatar: null, links: [] },
              source: 'petals',
            }}
            onEdit={() => {}}
            published
          />
        ),
      },
      {
        name: 'no profile yet',
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
        name: 'with its usage, call by call',
        render: () => (
          <Funds
            balance={{ usd: '1.52', near: '0.42' }}
            held={null}
            phase="ready"
            withdrew={null}
            onWithdraw={() => {}}
            usage={usageView(
              [
                {
                  call: 'a',
                  completion: 'a',
                  at: '2026-11-11T18:00:00Z',
                  model: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
                  tokens: { in: 12034, cached: 0, out: 812 },
                  charged_usd: 0.0031,
                  reconciled_at: '2026-11-11T18:05:00Z',
                },
                {
                  call: 'b',
                  completion: 'b',
                  at: '2026-11-11T17:40:00Z',
                  model: 'zai-org/GLM-4.6',
                  tokens: { in: 8001, cached: 2000, out: 1203 },
                  charged_usd: 0.012,
                  reconciled_at: null,
                },
              ],
              0.0151,
              3.6,
              new Date('2026-11-11T20:00:00Z'),
            )}
          />
        ),
      },
      {
        name: 'credit, as on the live site (no contract)',
        render: () => (
          <Funds
            balance={{ usd: '1.52', near: '0.42' }}
            held={null}
            phase="ready"
            withdrew={null}
            onWithdraw={() => {}}
          />
        ),
      },
      {
        name: 'holding NEAR in the contract',
        render: () => (
          <Funds
            balance={{ usd: '3.04', near: '0.84' }}
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
            balance={{ usd: '3.04', near: '0.84' }}
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
          <Funds
            balance={{ usd: '0.00', near: '0.00' }}
            held="0"
            phase="withdrew"
            withdrew="0.84"
            onWithdraw={() => {}}
          />
        ),
      },
      {
        name: "didn't go through",
        render: () => (
          <Funds
            balance={{ usd: '3.04', near: '0.84' }}
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
          <Funds
            balance={{ usd: '0.00', near: '0.00' }}
            held="0"
            phase="ready"
            withdrew={null}
            onWithdraw={() => {}}
          />
        ),
      },
    ],
  },
  {
    id: 'Wallets',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/Wallets.tsx',
    states: [
      {
        name: 'one wallet, proven at sign-in',
        render: () => (
          <Wallets
            wallets={walletRows([
              { network: 'mainnet', account_id: 'a-name.near', proved_at: '2026-11-11T12:00:00Z' },
            ])}
          />
        ),
      },
      {
        name: 'a 64-character account',
        render: () => (
          <Wallets
            wallets={walletRows([
              {
                network: 'mainnet',
                account_id: '02b85f8c8bbfbcc34f4d30b55724f36336768f05c27c2d7f97936e5d699018fc',
                proved_at: '2026-11-09T08:30:00Z',
              },
            ])}
          />
        ),
      },
      {
        name: 'NEAR, Ethereum and Solana wallets, with the three Connects, and one that belongs to someone else',
        render: () => (
          <Wallets
            wallets={walletRows([
              { network: 'mainnet', account_id: 'a-name.near', proved_at: '2026-11-11T12:00:00Z' },
              {
                network: 'eip155',
                account_id: '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be',
                proved_at: '2026-11-12T20:00:00Z',
              },
              {
                network: 'solana',
                account_id: '4buheNoQAwBLYzPF3GASEpZoNhCPot1B1VCwxGLdpW1A',
                proved_at: '2026-11-12T21:00:00Z',
              },
            ])}
            adding={{ kind: 'failed', why: 'That wallet already belongs to another account.' }}
            onAdd={() => {}}
          />
        ),
      },
      { name: 'still reading', render: () => <Wallets wallets="reading" /> },
      { name: "Petals didn't answer", render: () => <Wallets wallets="unread" /> },
    ],
  },
  {
    id: 'Contribution',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/Contribution.tsx',
    states: [
      {
        name: 'three counts',
        render: () => <Contribution contribution={contributionView(LAB_CREDIT)} />,
      },
      {
        name: 'nothing yet',
        render: () => (
          <Contribution
            contribution={contributionView({
              ...LAB_CREDIT,
              layers: [],
              totals: { layers: 0, first: 0, confirmed: 0, built_on: 0 },
            })}
          />
        ),
      },
      { name: 'still reading', render: () => <Contribution contribution="reading" /> },
    ],
  },
  {
    id: 'Claims',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/Claims.tsx',
    states: [
      {
        name: 'claims about two accounts',
        render: () => <Claims claims={claimsView(LAB_CLAIMS)} />,
      },
      { name: 'none yet', render: () => <Claims claims={claimsView([])} /> },
      { name: 'still reading', render: () => <Claims claims="reading" /> },
      { name: "Petals didn't answer", render: () => <Claims claims="unread" /> },
    ],
  },
  {
    id: 'Conversations',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/Conversations.tsx',
    states: [
      {
        name: 'three conversations',
        render: () => (
          <Conversations
            rows={[
              {
                key: 'a',
                title: 'Map RaidGuild',
                by: 'petals',
                when: '2h',
                working: false,
                project: null,
                href: '#a',
                current: false,
              },
              {
                key: 'b',
                title: 'Who votes in House of Stake',
                by: 'own',
                when: '1d',
                working: false,
                project: null,
                href: '#b',
                current: false,
              },
              {
                key: 'c',
                title: 'NEAR validators',
                by: 'petals',
                when: '9 Nov',
                working: false,
                project: null,
                href: '#c',
                current: false,
              },
            ]}
          />
        ),
      },
      { name: 'none yet', render: () => <Conversations rows={[]} /> },
    ],
  },
  {
    id: 'PowerQuote',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/PowerQuote.tsx',
    states: POWER_QUOTES.slice(0, 3).map((q) => ({
      name: q.id,
      render: () => <PowerQuote quote={q} />,
    })),
  },
  {
    id: 'MappingBox',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/workspace/MappingBox.tsx',
    states: [
      {
        name: 'what each layer adds to the map, then the press (wave 8)',
        render: () => (
          <MappingBox
            view={mappingView(LAB_PUBLISH.about, 'TRUMP', LAB_PUBLISH)}
            press={publishPressView(LAB_PUBLISH, 'ready', null, LAB_SIGN)}
            onPublish={() => {}}
          />
        ),
      },
      {
        name: 'no map in front',
        render: () => (
          <MappingBox view={mappingView(null, null, null)} press={null} onPublish={() => {}} />
        ),
      },
    ],
  },
  {
    id: 'ToMapLines',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ToMapLines.tsx',
    states: [
      {
        name: 'the cases (wave 8)',
        render: () => (
          <ToMapLines
            lines={toMapLines({
              new_data: { whats: ['vesting/schedule'] },
              new_moment: {
                states: [{ state: { block: 465695924 }, newest: { block: 465600000 } }],
              },
              new_subjects: { count: 212 },
              match: { count: 60, authors: [LAB_PETALS] },
              differs: { count: 3, authors: [LAB_PETALS] },
            })}
          />
        ),
      },
    ],
  },
  {
    id: 'PublishPress',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/PublishPress.tsx',
    states: [
      {
        name: 'ready',
        render: () => {
          const view = publishPressView(LAB_PUBLISH, 'ready', null, LAB_SIGN);
          return view ? <PublishPress view={view} onPublish={() => {}} /> : null;
        },
      },
      {
        name: 'published',
        render: () => {
          const view = publishPressView(
            LAB_PUBLISH,
            'published',
            publishWords.published('1 new kind of data · 212 new subjects · 60 facts match'),
            LAB_SIGN,
          );
          return view ? <PublishPress view={view} onPublish={() => {}} /> : null;
        },
      },
    ],
  },
  {
    id: 'CeremonyCard',
    group: 'The conversation',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/chat/CeremonyCard.tsx',
    states: [
      {
        name: 'a new map, waiting for the press',
        render: () => (
          <CeremonyCard
            view={ceremonyView({
              tool: 'propose_spec',
              network: 'moloch-v3',
              params: { chain: 'gnosis', dao: '0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986' },
              target_key: 'moloch-v3',
            })}
            onMapIt={() => {}}
          />
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
      {
        name: 'another token: picking it',
        wide: true,
        render: () => <PayRow phase="ready" added={null} onPay={() => {}} topUp={TOPUP.picking} />,
      },
      {
        name: 'another token: the address to send to',
        wide: true,
        render: () => <PayRow phase="ready" added={null} onPay={() => {}} topUp={TOPUP.sending} />,
      },
      {
        name: 'another token: landed',
        render: () => <PayRow phase="ready" added={null} onPay={() => {}} topUp={TOPUP.landed} />,
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
    id: 'Overlay',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Overlay.tsx',
    states: [
      {
        name: 'the chain list as an overlay: press a chain, press the bar to fold',
        render: () => <LabChains />,
      },
      {
        name: 'folded to its bar',
        render: () => <LabChains startsFolded />,
      },
      {
        name: 'one that never folds: no chevron',
        render: () => (
          <Overlay title="Seeker">
            <NavItem label="Readings" trail="1" />
            <NavItem label="Accounts" trail="3,327" />
          </Overlay>
        ),
      },
      {
        name: 'the family over a busy flower: the chain list, the legend, a badge',
        wide: true,
        render: () => (
          <div className="relative w-full max-w-flower-width">
            {/* biome-ignore lint/performance/noImgElement: a data URL of a golden drawing */}
            <img
              src={svgImage(golden('near-validators-default').rendered.svg)}
              alt=""
              className="block w-full"
            />
            <div className="absolute top-space-16 left-space-16">
              <LabChains />
            </div>
            <div className="absolute top-space-16 right-space-16">
              <LabFoldingLegend keys={goldenKeys()} />
            </div>
            <div className="absolute bottom-space-16 left-space-16 flex gap-space-8">
              <OrgBadge
                name="Magic Eden"
                symbol="ME"
                logo={logo('magic-eden')}
                types={['marketplace']}
              />
              <OrgBadge name="RaidGuild" symbol="RAID" types={['DAO']} />
            </div>
          </div>
        ),
      },
    ],
  },
  {
    id: 'SourceLink',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/SourceLink.tsx',
    states: [
      {
        name: 'beside a value an outside source gave, its source and when',
        render: () => (
          <p className="my-0 type-ui">
            $15,099,497 at $0.02 per MNDE
            <span className="type-mono text-muted"> DefiLlama, 11 Nov 2026</span>
            <SourceLink
              href="https://coins.llama.fi/prices/current/solana:MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey"
              name="DefiLlama, 11 Nov 2026"
            />
          </p>
        ),
      },
    ],
  },
  {
    id: 'Select',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Select.tsx',
    states: [
      {
        name: "a dropdown in a tool panel's row: the value it's at, a chevron pointing down",
        render: () => (
          <Select
            label="Height"
            value="share"
            options={[
              { value: 'share', label: 'Share (default)' },
              { value: 'count', label: 'Count' },
              { value: '', label: 'None' },
            ]}
            onChange={() => undefined}
          />
        ),
      },
    ],
  },
  {
    id: 'ColourPick',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/ColourPick.tsx',
    states: [
      {
        name: "a value's swatch: press it for the six keys and 'As it comes'",
        render: () => (
          <span className="flex items-center gap-space-4 type-ui">
            <ColourPick
              label="Colour for contract"
              swatch="key-blue"
              keys={['mint', 'blue', 'coral', 'apricot', 'pink', 'grey']}
              chosen="blue"
              asItComes="As it comes"
              onPick={() => undefined}
            />
            Contract
          </span>
        ),
      },
    ],
  },
  {
    id: 'Ramp',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Ramp.tsx',
    states: [
      {
        name: "a grade's five steps, lightest to darkest",
        render: () => (
          <span className="flex w-tile-width items-center gap-space-8 type-ui text-muted">
            fewest 3
            <Ramp fills={grades().map((k) => k.hex)} label="fewest 3 to most 534" />
            most 534
          </span>
        ),
      },
    ],
  },
  {
    id: 'Switch',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/Switch.tsx',
    states: [
      {
        name: "on, in a tool panel's row: the browser's own switch in the accent",
        render: () => <Switch label="Treasury and price" on onChange={() => undefined} />,
      },
      {
        name: 'off',
        render: () => <Switch label="Insights" on={false} onChange={() => undefined} />,
      },
    ],
  },
  {
    id: 'LineRow',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ui/LineRow.tsx',
    states: [
      {
        name: 'closed: a few lines that wrap, answering as the panel rows do',
        render: () => (
          <div className="w-tile-width">
            <LineRow expanded={false} onClick={() => undefined}>
              <span className="type-ui">
                A claim's words, as long as they are, two lines at most here
              </span>
            </LineRow>
          </div>
        ),
      },
      {
        name: 'open: the soft fill while what is under it shows',
        render: () => (
          <div className="w-tile-width">
            <LineRow expanded onClick={() => undefined}>
              <span className="type-ui">A claim's words</span>
            </LineRow>
          </div>
        ),
      },
    ],
  },
  {
    id: 'NextSteps',
    group: 'The workspace',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/NextSteps.tsx',
    states: [
      {
        name: 'three steps under the agent’s reading, one running, More folded',
        render: () => (
          <div className="w-tile-width">
            <NextSteps
              steps={[
                {
                  key: 'blocs',
                  label: 'Show the blocs',
                  says: 'Who votes alike, on all their votes',
                  onPress: () => undefined,
                },
                {
                  key: 'payouts',
                  label: 'What it paid out',
                  says: 'From its proposals, 2021 to now',
                  busy: true,
                  onPress: () => undefined,
                },
                { key: 'compare', label: 'Compare with…', onPress: () => undefined },
              ]}
              more={{
                open: false,
                onToggle: () => undefined,
                steps: [
                  { key: 'holders', label: 'Read its holders again', onPress: () => undefined },
                ],
              }}
            />
          </div>
        ),
      },
      {
        name: 'More open: the brain’s services, one press each',
        render: () => (
          <div className="w-tile-width">
            <NextSteps
              steps={[{ key: 'blocs', label: 'Show the blocs', onPress: () => undefined }]}
              more={{
                open: true,
                onToggle: () => undefined,
                steps: [
                  {
                    key: 'holders',
                    label: 'Read its holders again',
                    says: 'Petals’ agent · a few cents',
                    onPress: () => undefined,
                  },
                  { key: 'claims', label: 'What Petals’ mapping says', onPress: () => undefined },
                ],
              }}
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'WalletFacts',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/WalletFacts.tsx',
    states: [
      {
        name: 'a chosen wallet in Information: who it is, its kind, what it holds, its share, its dollars',
        render: () => (
          <div className="w-tile-width">
            <WalletFacts
              view={{
                title: 'cronus.near',
                address: null,
                facts: [
                  ['Who it is', 'Not named yet'],
                  ['Kind', 'unknown'],
                  ['Holds', '534 NEAR'],
                  ['Share', '8.19%'],
                ],
                worth: { text: '$1,997.16 at $3.74 per NEAR', source: '1Click, 11 Nov 2026' },
              }}
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'MapStrata',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/MapStrata.tsx',
    states: [
      {
        name: 'a map made by three layers from two authors, all on, the newest just added in your name',
        render: () => (
          <div className="w-tile-width">
            <MapStrata
              layers={[
                {
                  id: 'a1',
                  title: 'RaidGuild members and their shares',
                  kind: 'a reading',
                  standing: 'verified' as const,
                  covers: 'Gnosis block 37,912,004 · 9 Nov 2026',
                  authors: [{ name: "Petals' mapping", signed: false, published: '9 Nov' }],
                  read: '9 Nov 2026',
                  builtOn: 0,
                },
                {
                  id: 'a2',
                  title: 'RaidGuild proposals and how each member voted',
                  kind: 'proposals',
                  standing: 'verified' as const,
                  covers: '3 Feb 2021 to 11 Nov 2026',
                  authors: [{ name: "Petals' mapping", signed: false, published: '11 Nov' }],
                  read: '11 Nov 2026',
                  builtOn: 0,
                },
                {
                  id: 'a3',
                  title: 'Names for 14 members, from the DAO’s own records',
                  kind: 'names',
                  standing: 'inferred' as const,
                  covers: 'as of 12 Nov 2026',
                  authors: [
                    { name: 'elco.near', signed: true, published: '12 Nov' },
                    { name: 'raid.near', signed: true, published: '13 Nov' },
                  ],
                  read: '12 Nov 2026',
                  builtOn: 1,
                },
              ]}
              on={new Set(['a1', 'a2', 'a3'])}
              onToggle={() => undefined}
              joined={new Set(['a3'])}
            />
          </div>
        ),
      },
      {
        name: 'the proposals switched off',
        render: () => (
          <div className="w-tile-width">
            <MapStrata
              layers={[
                {
                  id: 'a1',
                  title: 'RaidGuild members and their shares',
                  kind: 'a reading',
                  standing: 'verified' as const,
                  covers: 'Gnosis block 37,912,004 · 9 Nov 2026',
                  authors: [{ name: "Petals' mapping", signed: false, published: '9 Nov' }],
                  read: '9 Nov 2026',
                  builtOn: 0,
                },
                {
                  id: 'a2',
                  title: 'RaidGuild proposals and how each member voted',
                  kind: 'proposals',
                  standing: 'verified' as const,
                  covers: '3 Feb 2021 to 11 Nov 2026',
                  authors: [{ name: "Petals' mapping", signed: false, published: '11 Nov' }],
                  read: '11 Nov 2026',
                  builtOn: 0,
                },
                {
                  id: 'a3',
                  title: 'Names for 14 members, from the DAO’s own records',
                  kind: 'names',
                  standing: 'inferred' as const,
                  covers: 'as of 12 Nov 2026',
                  authors: [
                    { name: 'elco.near', signed: true, published: '12 Nov' },
                    { name: 'raid.near', signed: true, published: '13 Nov' },
                  ],
                  read: '12 Nov 2026',
                  builtOn: 1,
                },
              ]}
              on={new Set(['a1', 'a3'])}
              onToggle={() => undefined}
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'MapProposal',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/MapProposal.tsx',
    states: [
      {
        name: 'a Sputnik proposal: its words, and the link its text names',
        render: () => (
          <div className="w-tile-width">
            <MapProposal
              view={{
                title: 'Schedule an auction of 2.5% of the total REF supply on Skyward',
                facts: 'Vote · Approved · 13 Jul 2021',
                who: 'By refchef.near',
                votes: '3 for',
                words:
                  'Schedule an auction of 2.5% of the total REF supply on Skyward, as discussed on the forum: the proceeds go to the treasury, and the auction runs for a week.',
                link: { url: 'https://bit.ly/36AJr6G', label: 'A link its text names' },
              }}
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'MapLayers',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/MapLayers.tsx',
    states: [
      {
        name: 'Ref Finance: its members, its proposals, its price, its insights, each with its period',
        render: () => (
          <div className="w-tile-width">
            <MapLayers
              layers={[
                {
                  key: 'r',
                  name: 'Sputnik DAO members on NEAR',
                  period: 'As of 11 Nov 2026',
                  count: '46 accounts',
                  by: "Petals' own mapping",
                },
                {
                  key: 'p',
                  name: 'Proposals',
                  period: '30 Jun 2021 to 5 Nov 2026',
                  count: '1,060',
                },
                {
                  key: 'v',
                  name: 'NEAR price',
                  period: 'On 11 Nov 2026',
                  count: '$3.74',
                  by: '1Click',
                  link: 'https://1click.chaindefuser.com/v0/tokens',
                },
                {
                  key: 'i',
                  name: 'Insights',
                  period: 'On 11 Nov 2026',
                  count: '2',
                  by: "Petals' mapping",
                },
              ]}
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'MapClaims',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/MapClaims.tsx',
    states: [
      {
        name: "folded until asked, as on the map: what's said and how many",
        render: () => (
          <MapClaims
            groups={mapClaimGroups(LAB_MAP_CLAIMS, LAB_CLAIM_NAMES)}
            open={null}
            onOpen={() => undefined}
            fold={{ open: false, onToggle: () => undefined }}
          />
        ),
      },
      {
        name: 'open: each account under its name, each claim in two lines',
        render: () => (
          <MapClaims
            groups={mapClaimGroups(LAB_MAP_CLAIMS, LAB_CLAIM_NAMES)}
            open={null}
            onOpen={() => undefined}
            fold={{ open: true, onToggle: () => undefined }}
          />
        ),
      },
      {
        name: 'an inferred claim pressed: what it rests on, its method and its evidence',
        render: () => {
          const groups = mapClaimGroups(LAB_MAP_CLAIMS, LAB_CLAIM_NAMES);
          const inferred = groups.flatMap((g) => g.lines).find((l) => l.kind === 'inferred');
          return (
            <MapClaims
              groups={groups}
              open={inferred?.key ?? null}
              onOpen={() => undefined}
              fold={{ open: true, onToggle: () => undefined }}
            />
          );
        },
      },
    ],
  },
  {
    id: 'MapSearch',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/MapSearch.tsx',
    states: [
      {
        name: 'empty, at the top of the chain list',
        render: () => (
          <div className="w-tile-width">
            <MapSearch
              q=""
              onType={() => undefined}
              onOrder={() => undefined}
              onClear={() => undefined}
              rows={null}
              status={null}
              onGo={() => undefined}
            />
          </div>
        ),
      },
      {
        name: 'typed: the maps it finds, each with what matched under it and its chain',
        render: () => (
          <div className="w-tile-width">
            <MapSearch
              q="money streaming"
              onType={() => undefined}
              onOrder={() => undefined}
              onClear={() => undefined}
              rows={[
                {
                  at: 0,
                  map: 'eip155:100:0xb152',
                  name: 'MetaCartel Gnosis v2',
                  chain: 'Gnosis',
                  matched: 'Proposal · Sponsorship Proposal: MCON 2 Stream',
                },
                {
                  at: 1,
                  map: 'eip155:1:0x1f98',
                  name: 'Uniswap',
                  chain: 'Ethereum',
                  matched: null,
                },
              ]}
              status={null}
              onGo={() => undefined}
            />
          </div>
        ),
      },
      {
        name: 'nothing found',
        render: () => (
          <div className="w-tile-width">
            <MapSearch
              q="zzzz"
              onType={() => undefined}
              onOrder={() => undefined}
              onClear={() => undefined}
              rows={[]}
              status="Nothing on the map matches."
              onGo={() => undefined}
            />
          </div>
        ),
      },
    ],
  },
  {
    id: 'ViewLegend',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/ViewLegend.tsx',
    states: [
      {
        name: 'read only, as on a published map: the default view',
        render: () => (
          <ViewLegend
            view={DEFAULT_VIEW}
            drawn={inUse(DEFAULT_VIEW, EVERY_FLOWER)}
            pieces={EVERY_FLOWER}
            keys={goldenKeys()}
          />
        ),
      },
      {
        name: 'read only: height straight, no width, no labels',
        render: () => {
          const view = withData(
            withData(
              withScale(DEFAULT_VIEW, 'height', 'linear'),
              'width',
              null,
              EVERY_FLOWER,
              DEFAULT_VIEW,
            ),
            'labels',
            null,
            EVERY_FLOWER,
            DEFAULT_VIEW,
          );
          return (
            <ViewLegend
              view={view}
              drawn={inUse(view, EVERY_FLOWER)}
              pieces={EVERY_FLOWER}
              keys={goldenKeys()}
            />
          );
        },
      },
      {
        name: 'changing the view, as on /make (choose, and it redraws; nothing is saved)',
        render: () => <LabLegend keys={goldenKeys()} />,
      },
      {
        name: 'over a busy flower',
        wide: true,
        render: () => (
          <div className="relative w-full max-w-flower-width">
            {/* biome-ignore lint/performance/noImgElement: a data URL of a golden drawing */}
            <img
              src={svgImage(golden('near-validators-default').rendered.svg)}
              alt=""
              className="block w-full"
            />
            <div className="absolute top-space-16 left-space-16">
              <ViewLegend
                view={DEFAULT_VIEW}
                drawn={inUse(DEFAULT_VIEW, EVERY_FLOWER)}
                pieces={EVERY_FLOWER}
                keys={goldenKeys()}
              />
            </div>
          </div>
        ),
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
    id: 'PetalClaims',
    group: 'The flower',
    figmaName: null,
    figmaNode: null,
    source: 'apps/web/components/PetalClaims.tsx',
    states: [
      // as this browser is: nothing for a visitor; for someone signed in, what they've said and the field
      {
        name: 'as this browser is',
        wide: true,
        render: () => <PetalClaims account="near:mainnet:astro-stakers.poolv1.near" />,
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
  Landing: 'the whole landing page, at /; each of its sections is here',
  HeroStoryView:
    'HeroStory without its clock: HeroStory draws it here, and /lab/landing-hero isolates its layers',
  InteractionSurface: 'wires the ViewModels to the boxes and the flower, and it lives at /make',
  FlowerCanvas: 'the live flower fills the window, so its bench is its own page, /lab/flower',
  ConversationThread: 'Thread and TurnFlower wired together, and each of those is here',
  FloatBox: 'a BarBox fixed to the window and placed by hand: it lives at /make',
  SiteChrome: 'the Nav, drawn here, around a reading column; it holds no state of its own',
  ReadingColumn:
    'the reading column SiteChrome sets pages in, alone: a width and a margin, nothing to see',
  MapAt:
    'wires the Power Map, opened inside one map, to the box of its readings: it lives at /m/<id>',
  FlowerAt:
    'wires useFlowerPage to the Power Map opened inside the flower, and its box: it lives at /f/<id> and /draft',
  FlowerPage:
    'wires useFlowerPage to the flower and its box, filling the area under the nav: it lives at /f/<id> and /draft',
  FrontDoor: 'draws nothing: it opens the wallet when the landing is left for /make (proposal)',
  Lobby:
    'lays out ProfileHead, Profile, Wallets, Claims, Funds, Conversations and the map, each here: it lives at /lobby and /profile',
  Menu: "takes the focus when it shows and closes on any press elsewhere, so it's shown live, from a row's ⋯ at /lab/panel",
  Dialog: "a modal over the page, so it is shown live, from a row's ⋯ menu at /lab/panel",
  WorkMenu:
    'the SideRail and the list, both here, fixed to the window: the layout of /lobby and /make holds it (/lab/panel shows it whole)',
};
