// The lobby (specs/004-workspace, W3; the redo, Elco's "Build it" on the Figma frame, 10 Nov): beside the
// side panel, which is the layout's (app/(work)/WorkPanel.tsx, PANEL's), from the top, the person (ProfileHead), their
// Public profile and Balance cards side by side, and the map's card under them. Each card has one title
// and one job (components/ui/Card.tsx). Checked against design/minimally-good.md.
// Props only: app/(work)/lobby/LobbySurface.tsx wires useLobby to it. It lays out the small set's parts and adds
// no look of its own. Words from lib/lobby-view.ts.
import type { LegendKey } from '../../lib/flower-view.ts';
import {
  lobbyWords,
  type MapTile,
  type ProfileEditorView,
  type SocialState,
  type WithdrawPhase,
} from '../../lib/lobby-view.ts';
import type { Money } from '../../lib/pay.ts';
import { FlowerTile } from '../FlowerTile.tsx';
import { LegendKeys } from '../Legend.tsx';
import { Badge } from '../ui/Badge.tsx';
import { Card } from '../ui/Card.tsx';
import { Funds } from './Funds.tsx';
import { Profile } from './Profile.tsx';
import { ProfileEditor } from './ProfileEditor.tsx';
import { ProfileHead } from './ProfileHead.tsx';

/** The one map, a card per address, as the Power Map lists it, with one colour key over the pictures. */
export interface LobbyMap {
  tiles: MapTile[];
  keys: LegendKey[];
}

export function Lobby({
  profile,
  funds,
  editor,
  map,
}: {
  /** The wallet this session signed in with, and its public profile on NEAR Social. */
  profile: { account: string | null; social: SocialState; edit?: () => void; saved: boolean };
  /** The public profile's editor, while it's open: it takes the Public profile card's place. */
  editor: ProfileEditorView | null;
  funds: {
    balance: Money | null;
    held: string | null;
    phase: WithdrawPhase;
    withdrew: string | null;
    withdraw: () => void;
  };
  map: LobbyMap;
}) {
  return (
    <main aria-label={lobbyWords.page} data-surface="ground" className="flex h-dvh bg-surface">
      <div className="flex min-w-0 flex-1 flex-col gap-space-32 overflow-y-auto px-page-inset py-column-gap">
        <ProfileHead account={profile.account} social={profile.social} />
        <div className="grid grid-cols-1 items-start gap-block-gap lg:grid-cols-3">
          <div className={`min-w-0 ${editor ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
            {editor ? (
              <ProfileEditor view={editor} />
            ) : (
              <Profile social={profile.social} onEdit={profile.edit} saved={profile.saved} />
            )}
          </div>
          <Funds
            balance={funds.balance}
            held={funds.held}
            phase={funds.phase}
            withdrew={funds.withdrew}
            onWithdraw={funds.withdraw}
          />
        </div>
        <Card
          title={lobbyWords.map}
          labelledBy="lobby-map"
          badge={map.tiles.length > 0 ? <Badge>{map.tiles.length}</Badge> : undefined}
        >
          {map.tiles.length > 0 ? (
            <>
              <LegendKeys keys={map.keys} />
              <ul className="gallery">
                {map.tiles.map((t) => (
                  <li key={t.key}>
                    <FlowerTile
                      title={t.title}
                      where={t.where}
                      badge={t.badge}
                      image={t.image}
                      href={t.href}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="my-0 type-caption text-muted">{lobbyWords.mapEmpty}</p>
          )}
        </Card>
      </div>
    </main>
  );
}
