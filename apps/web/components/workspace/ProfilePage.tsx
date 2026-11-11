// The profile page (#79; Elco, 9 Nov: "a profile area where people gain credibility as investigators and
// researchers"; META, 11 Nov: build LOBBY's lean, the profile as its own page, the investigator's card):
// beside the side panel, from the top, the person (ProfileHead); then, on the left, their Profile card, what
// they say of themselves, and under it what backs them, the Claims they and their agents keep about
// accounts; on the right, the Wallets they've proven, their Balance and their Conversations. Each card has
// one title and one job (components/ui/Card.tsx). The editor opens over both columns, the width of the page.
// Props only: app/(work)/profile/ProfileSurface.tsx wires useProfilePage to it. Words from lib/profile-view.ts.
import type { ConversationRow } from '../../lib/conversation-list.ts';
import type { ProfileEditorView, SocialState, WithdrawPhase } from '../../lib/lobby-view.ts';
import type { Money } from '../../lib/pay.ts';
import { type ClaimsView, profilePageWords, type WalletRow } from '../../lib/profile-view.ts';
import { Claims } from './Claims.tsx';
import { Conversations } from './Conversations.tsx';
import { Funds } from './Funds.tsx';
import { Profile } from './Profile.tsx';
import { ProfileEditor } from './ProfileEditor.tsx';
import { ProfileHead } from './ProfileHead.tsx';
import { Wallets } from './Wallets.tsx';

export function ProfilePage({
  profile,
  editor,
  funds,
  wallets,
  claims,
  conversations,
}: {
  /** The wallet this session signed in with, and the profile Petals keeps or NEAR Social's. */
  profile: { account: string | null; social: SocialState; edit?: () => void; saved: boolean };
  /** The profile's editor, while it's open: it takes the Profile card's place. */
  editor: ProfileEditorView | null;
  funds: {
    balance: Money | null;
    held: string | null;
    phase: WithdrawPhase;
    withdrew: string | null;
    withdraw: () => void;
  };
  wallets: WalletRow[] | 'reading' | 'unread';
  claims: ClaimsView | 'reading' | 'unread';
  conversations: ConversationRow[];
}) {
  return (
    <main
      aria-label={profilePageWords.page}
      data-surface="ground"
      className="flex h-dvh bg-surface"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-space-32 overflow-y-auto px-page-inset py-column-gap">
        <ProfileHead account={profile.account} social={profile.social} />
        <div className="grid grid-cols-1 items-start gap-block-gap lg:grid-cols-3">
          {editor && (
            <div className="min-w-0 lg:col-span-3">
              <ProfileEditor view={editor} />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-block-gap lg:col-span-2">
            {!editor && (
              <Profile social={profile.social} onEdit={profile.edit} saved={profile.saved} />
            )}
            <Claims claims={claims} />
          </div>
          <div className="flex min-w-0 flex-col gap-block-gap">
            <Wallets wallets={wallets} />
            <Funds
              balance={funds.balance}
              held={funds.held}
              phase={funds.phase}
              withdrew={funds.withdrew}
              onWithdraw={funds.withdraw}
            />
            <Conversations rows={conversations} />
          </div>
        </div>
      </div>
    </main>
  );
}
