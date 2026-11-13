// The account menu, at the lobby's top right, where well-made apps keep it: the person's picture and name on a
// button, which opens a short list under it: the way to the profile's editor, and Disconnect, the one way out
// of the account. It holds no state: whether it's open is its ViewModel's, and the list (ui/Menu) says when
// to close. Props only: viewmodels/useLobby.ts holds it. Words from lib/lobby-view.ts.
import { lobbyWords } from '../../lib/lobby-view.ts';
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
  /** What the button says: the profile's name, or the account, shortened. */
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
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={lobbyWords.account}
        title={full}
        onClick={onToggle}
        className="flex h-control-height items-center gap-space-8 border border-hairline bg-transparent px-space-8 text-primary hover:border-primary"
      >
        {avatar ? (
          // biome-ignore lint/performance/noImgElement: a picture the account chose, from its own storage
          <img
            className="block size-icon-size border border-hairline object-cover"
            src={avatar}
            alt=""
          />
        ) : (
          <Icon name="profile" />
        )}
        <span className="max-w-tile-width truncate type-ui">{name}</span>
        <span className={`flex ${open ? 'rotate-180' : ''}`}>
          <Icon name="down" small />
        </span>
      </button>
      {open && <Menu label={lobbyWords.account} items={items} onClose={onClose} />}
    </div>
  );
}
