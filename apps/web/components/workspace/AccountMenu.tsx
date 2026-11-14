// The account menu, at the lobby's top right, where well-made apps keep it: the connected account as the
// site's Connect button shows it once someone is connected (the green done look, the account shortened the
// same way, components/ui/ConnectButton.tsx), with the person's own picture from their profile. It opens a
// short list under it: the way to the profile's editor, and Disconnect, the one way out of the account. It holds no state: whether it's open is its ViewModel's, and the list (ui/Menu) says when
// to close. Props only: viewmodels/useLobby.ts holds it. Words from lib/lobby-view.ts.
import { lobbyWords } from '../../lib/lobby-view.ts';
import { Avatar } from '../ui/Avatar.tsx';
import { Button } from '../ui/Button.tsx';
import { Icon } from '../ui/Icon.tsx';
import { Menu, type MenuItem } from '../ui/Menu.tsx';

export function AccountMenu({
  name,
  full,
  avatar,
  open,
  onToggle,
  onClose,
  onEdit,
  onLeave,
}: {
  /** What the button says: the account, shortened as the Connect button shortens it. */
  name: string;
  /** The whole account, for its title. */
  full: string;
  /** The profile's picture, if it has one. */
  avatar: string | null;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Opens the profile's editor, when there's one to open. */
  onEdit?: () => void;
  onLeave: () => void;
}) {
  const items: MenuItem[] = [
    ...(onEdit
      ? [{ key: 'edit', label: lobbyWords.editProfile, icon: 'profile' as const, onPick: onEdit }]
      : []),
    { key: 'leave', label: lobbyWords.disconnect, icon: 'leave' as const, onPick: onLeave },
  ];
  return (
    <div className="relative">
      <Button variant="done" expanded={open} label={lobbyWords.account} onClick={onToggle}>
        {avatar ? <Avatar src={avatar} size="icon" /> : <Icon name="profile" />}
        <span title={full} className="max-w-tile-width truncate">
          {name}
        </span>
        <span className={`flex ${open ? 'rotate-180' : ''}`}>
          <Icon name="down" small />
        </span>
      </Button>
      {open && <Menu label={lobbyWords.account} items={items} onClose={onClose} />}
    </div>
  );
}
