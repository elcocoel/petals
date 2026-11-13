'use client';
// The one Connect, in the nav and in the hero. For a visitor it is the primary button to their place. Once they're
// connected it shows the connected account, shortened as the site shortens accounts, in the green button look,
// and opens a short menu: into the lobby, switch wallet, disconnect, so none of them needs a trip into the app.
// While the session is still being read it stays Connect, so a static page draws it at once.
import { doorWords } from '../../lib/door-words.ts';
import { shortId } from '../../lib/flower-view.ts';
import { lobbyWords } from '../../lib/lobby-view.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { useConnectMenu } from '../../viewmodels/useConnectMenu.ts';
import { Button } from './Button.tsx';
import { Icon } from './Icon.tsx';
import { Menu, type MenuItem } from './Menu.tsx';

/** What the connected button's menu does, and whether it's open. */
export interface ConnectMenu {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEnter: () => void;
  onSwitch: () => void;
  onLeave: () => void;
}

/**
 * The button for one state: a visitor's Connect, or the connected account with its menu. Props only, so the lab
 * can show each. `align` lines the menu up with the button's start (the hero) or end (the nav).
 */
export function ConnectButtonView({
  label,
  account,
  menu,
  align = 'end',
  bar = false,
}: {
  label: string;
  account: string | null;
  menu?: ConnectMenu;
  align?: 'start' | 'end';
  /** In the nav's bar, which a phone leaves little room in: a long account name gives way with an ellipsis. */
  bar?: boolean;
}) {
  if (!account || !menu)
    return (
      <Button href={siteLinks.lobby} variant={account ? 'done' : 'primary'} arrow>
        {account ? shortId(account) : label}
      </Button>
    );
  const items: MenuItem[] = [
    { key: 'enter', label: lobbyWords.page, icon: 'home', onPick: menu.onEnter },
    { key: 'switch', label: doorWords.switchWallet, icon: 'balance', onPick: menu.onSwitch },
    { key: 'leave', label: doorWords.disconnect, icon: 'leave', onPick: menu.onLeave },
  ];
  return (
    <div className="relative">
      <Button
        variant="done"
        expanded={menu.open}
        label={lobbyWords.account}
        onClick={menu.onToggle}
      >
        <span
          title={account}
          className={`min-w-0 truncate ${bar ? 'max-w-drawing-72 md:max-w-tile-width' : 'max-w-tile-width'}`}
        >
          {shortId(account)}
        </span>
        <span className={`flex ${menu.open ? 'rotate-180' : ''}`}>
          <Icon name="down" small />
        </span>
      </Button>
      {menu.open && (
        <Menu label={lobbyWords.account} items={items} onClose={menu.onClose} align={align} />
      )}
    </div>
  );
}

export function ConnectButton({
  label,
  align,
  bar,
}: {
  label: string;
  align?: 'start' | 'end';
  bar?: boolean;
}) {
  const m = useConnectMenu();
  return (
    <ConnectButtonView
      label={label}
      account={m.account}
      align={align ?? 'end'}
      bar={bar ?? false}
      menu={{
        open: m.open,
        onToggle: m.toggle,
        onClose: m.close,
        onEnter: m.enter,
        onSwitch: m.switchWallet,
        onLeave: m.leave,
      }}
    />
  );
}
