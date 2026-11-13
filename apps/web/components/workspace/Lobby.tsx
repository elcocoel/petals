// The lobby, one page with the profile, zoned as the landing is: bands edge to edge (ui/Section), each named
// in the wordmark's face (ui/SectionName), its parts in the landing's language. /lobby and /profile both show it,
// beside the side panel's bar (app/(work)/WorkPanel.tsx). From the top:
// - the bar: the page's name, and the account menu at the top right, where well-made apps keep it (the profile's
//   editor, and Disconnect, the one way out of the account);
// - the person: their picture, an eyebrow saying what's true of the account, their name in the title's size, the
//   bio and declared links under it and its one action; beside it, the Wallets they've proven and the way to add
//   another. The profile's editor opens over the band, the Wallets under it;
// - Balance: the credit in the display's size, Add funds (the pay row's own flow, unfolding under it) and
//   Withdraw, and the tip; beside it, the Usage card;
// - one illustrated quote, in a band of its own, the art given room;
// - Your work: the three counts of their Contribution, then their Conversations, Claims, what they Published,
//   and the maps they're On the map with, as cards in pairs.
// Every card has one title and one job (components/ui/Card.tsx); a list that grows keeps a set height and
// scrolls inside. Props only: app/(work)/lobby/LobbySurface.tsx wires useLobby to it. Words from
// lib/lobby-view.ts and lib/profile-view.ts.
import type { ComponentProps } from 'react';
import type { ContributionView } from '../../lib/contribution-view.ts';
import type { ConversationRow } from '../../lib/conversation-list.ts';
import { shortId } from '../../lib/flower-view.ts';
import {
  lobbyWords,
  type MapTile,
  type ProfileEditorView,
  type SocialState,
  type WithdrawPhase,
} from '../../lib/lobby-view.ts';
import type { Money } from '../../lib/pay.ts';
import type { PowerQuoteItem } from '../../lib/power-quotes.ts';
import type {
  AddWalletPhase,
  ClaimsView,
  UsageView,
  WalletKind,
  WalletRow,
} from '../../lib/profile-view.ts';
import { PayRow } from '../chat/PayRow.tsx';
import { MapList } from '../MapList.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Card } from '../ui/Card.tsx';
import { Section } from '../ui/Section.tsx';
import { SectionName } from '../ui/SectionName.tsx';
import { AccountMenu } from './AccountMenu.tsx';
import { Claims } from './Claims.tsx';
import { Contribution } from './Contribution.tsx';
import { Conversations } from './Conversations.tsx';
import { Funds } from './Funds.tsx';
import { Profile } from './Profile.tsx';
import { ProfileEditor } from './ProfileEditor.tsx';
import { ProfileHead } from './ProfileHead.tsx';
import { Published } from './Published.tsx';
import { QuoteBand } from './QuoteBand.tsx';
import type { TipView } from './TipControl.tsx';
import { Usage } from './Usage.tsx';
import { Wallets } from './Wallets.tsx';

/** The one map, a row per address, as the Power Map lists it. No hard-coded colour key over it. */
export interface LobbyMap {
  tiles: MapTile[];
}

export function Lobby({
  profile,
  menu,
  leave,
  editor,
  funds,
  add,
  usage,
  wallets,
  adding,
  addWallet,
  stopAdding,
  claims,
  conversations,
  map,
  contribution,
  quote,
  tip,
}: {
  /** The wallet this session signed in with, and the profile Petals keeps or NEAR Social's. */
  profile: {
    account: string | null;
    /** The chain the account is on, by name; null until it's read. */
    chain: string | null;
    social: SocialState;
    edit?: () => void;
    saved: boolean;
    published: boolean;
  };
  /** The account menu: whether it's open. */
  menu: { open: boolean; toggle: () => void; close: () => void };
  /** Signs out, from the account menu. */
  leave: () => void;
  /** The profile's editor, while it's open: it takes the profile's place in its band. */
  editor: ProfileEditorView | null;
  funds: {
    balance: Money | null;
    held: string | null;
    phase: WithdrawPhase;
    withdrew: string | null;
    withdraw: () => void;
  };
  /** Add funds: whether the pay row is open under the balance, and the row itself. */
  add: { open: boolean; toggle: () => void; row: Omit<ComponentProps<typeof PayRow>, 'first'> };
  /** Every call charged to them (usage/v1), in the Usage card. */
  usage: UsageView | 'reading' | 'unread';
  wallets: WalletRow[] | 'reading' | 'unread';
  adding: AddWalletPhase;
  /** Asks a wallet to sign; with several of one kind, the one picked by its id. */
  addWallet: (kind: WalletKind, pick?: string) => void;
  /** Stops waiting for a wallet, or puts the pick away. */
  stopAdding: () => void;
  claims: ClaimsView | 'reading' | 'unread';
  conversations: ConversationRow[];
  map: LobbyMap;
  /** The person's contribution to the map, three counts and what they published (credit/v1). */
  contribution: ContributionView | 'reading' | 'unread';
  /** The visit's one illustrated quote, in its own band; none until it's picked. */
  quote: PowerQuoteItem | null;
  /** The person's tip, in the Balance band. */
  tip: TipView;
}) {
  const named = profile.social.kind === 'profile' ? profile.social.profile : null;
  const walletsCard = (
    <Wallets wallets={wallets} adding={adding} onAdd={addWallet} onStop={stopAdding} />
  );
  return (
    <main aria-label={lobbyWords.page} data-surface="ground" className="flex h-dvh bg-surface">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <Section as="nav" padding="bar" rule="bottom">
          <div className="flex items-center justify-between gap-block-gap">
            <SectionName name={lobbyWords.page} />
            {profile.account && (
              <AccountMenu
                name={named?.name ?? shortId(profile.account)}
                full={profile.account}
                avatar={named?.avatar ?? null}
                open={menu.open}
                onToggle={menu.toggle}
                onClose={menu.close}
                {...(profile.edit ? { onEdit: profile.edit } : {})}
                onLeave={leave}
              />
            )}
          </div>
        </Section>

        <Section id="profile">
          {editor ? (
            <div className="flex flex-col gap-column-gap">
              <ProfileEditor view={editor} />
              {walletsCard}
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-column-gap lg:grid-cols-split-flip">
              <div className="flex min-w-0 flex-col gap-space-32">
                <ProfileHead
                  account={profile.account}
                  chain={profile.chain}
                  social={profile.social}
                />
                <Profile
                  social={profile.social}
                  onEdit={profile.edit}
                  saved={profile.saved}
                  published={profile.published}
                />
              </div>
              {walletsCard}
            </div>
          )}
        </Section>

        <Section
          tone="stone"
          rule="top"
          id="balance"
          head={<SectionName name={lobbyWords.balance} />}
          layout="split"
          figure="start"
        >
          <Funds
            balance={funds.balance}
            held={funds.held}
            phase={funds.phase}
            withdrew={funds.withdrew}
            onWithdraw={funds.withdraw}
            adding={add.open}
            onAdd={add.toggle}
            add={<PayRow first {...add.row} />}
            tip={tip}
          />
          <Usage usage={usage} />
        </Section>

        {quote && <QuoteBand quote={quote} />}

        <Section rule="top" id="work" head={<SectionName name={lobbyWords.work} />}>
          <div className="flex flex-col gap-column-gap">
            <Contribution contribution={contribution} />
            <div className="grid grid-cols-1 gap-block-gap lg:grid-cols-2">
              <Conversations rows={conversations} />
              <Claims claims={claims} />
              <Published contribution={contribution} />
              <Card
                title={lobbyWords.map}
                labelledBy="lobby-map"
                badge={map.tiles.length > 0 ? <Badge>{map.tiles.length}</Badge> : undefined}
              >
                {map.tiles.length > 0 ? (
                  <div className="max-h-figure-height overflow-y-auto overscroll-none">
                    <MapList label={lobbyWords.map} rows={map.tiles} />
                  </div>
                ) : (
                  <p className="my-0 type-body text-muted">{lobbyWords.mapEmpty}</p>
                )}
              </Card>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
