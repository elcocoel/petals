// The lobby, one page with the profile (Elco, 11 Nov, on /profile: "this is closer to what I wanted the
// lobby to be ... we might want to unify them and use this overall"; #79's investigator's card, with the
// lobby's map). /lobby and /profile both show it. Beside the side panel, which is the layout's
// (app/(work)/WorkPanel.tsx, PANEL's), from the top, the person (ProfileHead); then the widgets in rows of
// two, each pair the same height: their Profile card beside the Wallets they've proven, their Contribution to
// the map (wave 8: three counts) beside their Balance, the Claims they and their agents keep about accounts beside their
// Conversations, and the map across the page. Each card
// has one title and one job (components/ui/Card.tsx); a list that grows keeps a set height and scrolls
// inside (Elco: "I don't like the idea that the claims widget is infinite"). The editor opens over the
// whole row, the width of the page.
// Props only: app/(work)/lobby/LobbySurface.tsx wires useLobby to it. Words from lib/lobby-view.ts and
// lib/profile-view.ts.

import type { ContributionView } from '../../lib/contribution-view.ts';
import type { ConversationRow } from '../../lib/conversation-list.ts';
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
import { MapList } from '../MapList.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Card } from '../ui/Card.tsx';
import { Claims } from './Claims.tsx';
import { Contribution } from './Contribution.tsx';
import { Conversations } from './Conversations.tsx';
import { Funds } from './Funds.tsx';
import { Profile } from './Profile.tsx';
import { ProfileEditor } from './ProfileEditor.tsx';
import { ProfileHead } from './ProfileHead.tsx';
import { Wallets } from './Wallets.tsx';

/** The one map, a row per address, as the Power Map lists it. No colour key over it (Elco, 12 Nov: "having
 * this hard coded legend on the top. Probably not going to stay this way"). */
export interface LobbyMap {
  tiles: MapTile[];
}

export function Lobby({
  profile,
  editor,
  funds,
  usage,
  wallets,
  adding,
  addWallet,
  claims,
  conversations,
  map,
  contribution,
  quotes,
}: {
  /** The wallet this session signed in with, and the profile Petals keeps or NEAR Social's. */
  profile: {
    account: string | null;
    social: SocialState;
    edit?: () => void;
    saved: boolean;
    published: boolean;
  };
  /** The profile's editor, while it's open: it takes the Profile card's place. */
  editor: ProfileEditorView | null;
  funds: {
    balance: Money | null;
    held: string | null;
    phase: WithdrawPhase;
    withdrew: string | null;
    withdraw: () => void;
  };
  /** Every call charged to them (usage/v1), in the Balance widget. */
  usage: UsageView | 'reading' | 'unread';
  wallets: WalletRow[] | 'reading' | 'unread';
  adding: AddWalletPhase;
  addWallet: (kind: WalletKind) => void;
  claims: ClaimsView | 'reading' | 'unread';
  conversations: ConversationRow[];
  map: LobbyMap;
  /** The person's contribution to the map, three counts (wave 8, SYSTEMS's credit/v1). */
  contribution: ContributionView | 'reading' | 'unread';
  /** An illustrated power quote for each widget with nothing in it yet (#89, wave 7). */
  quotes: Record<
    'profile' | 'claims' | 'usage' | 'conversations' | 'contribution',
    PowerQuoteItem | null
  >;
}) {
  return (
    <main aria-label={lobbyWords.page} data-surface="ground" className="flex h-dvh bg-surface">
      <div className="flex min-w-0 flex-1 flex-col gap-space-32 overflow-y-auto px-page-inset py-column-gap">
        <ProfileHead account={profile.account} social={profile.social} />
        {/* rows of two widgets, each pair the same height, titles on one line (Elco, 11 Nov: "the profile
            card is unaligned with the balance card") */}
        <div className="grid grid-cols-1 gap-block-gap lg:grid-cols-3">
          <div className={`grid min-w-0 ${editor ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
            {editor ? (
              <ProfileEditor view={editor} />
            ) : (
              <Profile
                social={profile.social}
                onEdit={profile.edit}
                saved={profile.saved}
                published={profile.published}
                quote={quotes.profile}
              />
            )}
          </div>
          <Wallets wallets={wallets} adding={adding} onAdd={addWallet} />
          <div className="grid min-w-0 lg:col-span-2">
            <Contribution contribution={contribution} quote={quotes.contribution} />
          </div>
          <Funds
            balance={funds.balance}
            held={funds.held}
            phase={funds.phase}
            withdrew={funds.withdrew}
            onWithdraw={funds.withdraw}
            usage={usage}
            quote={quotes.usage}
          />
          <div className="grid min-w-0 lg:col-span-2">
            <Claims claims={claims} quote={quotes.claims} />
          </div>
          <Conversations rows={conversations} quote={quotes.conversations} />
          <div className="grid min-w-0 lg:col-span-3">
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
                <p className="my-0 type-caption text-muted">{lobbyWords.mapEmpty}</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
