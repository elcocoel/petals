// Many doors, one tool universe (Elco, 5 Nov): whatever someone already uses, one clear way in,
// and no repo to clone. Every door gives the person's own agent the same tools, rules and flowers,
// and it runs them on their computer. The Claude app's chat and ChatGPT run in the cloud, so they can't:
// their doors stay, because the landing links to them, and say so with the app to use instead.
import { agentPrompt, connectorAddress, getFile, keepCommands } from './agent-prompt.ts';

export interface Door {
  id: string;
  title: string;
  /** what to do, in plain words */
  how: string;
  /** what the person copies, if anything */
  copy?: string;
  copyLabel?: string;
}

export function doors(origin: string): Door[] {
  // The tools run on the person's own computer, from one file this site serves (petal.mjs).
  const file = getFile(origin);
  const keep = keepCommands();
  return [
    {
      id: 'prompt',
      title: 'Claude Code, Codex or Hermes',
      how: 'Paste this into Claude Code, Codex or Hermes on your computer. They run Petals’ tools there, and you watch the work here. In the Claude desktop app, that’s Code, not the chat: the Claude app’s chat runs in the cloud and can’t run them. The first time, your agent asks you once to let Petals’ tools run, because they come from this site. Say yes: they read public data and keep their notes in a folder called .petals.',
      copy: agentPrompt(origin),
      copyLabel: 'Copy this prompt',
    },
    // A cloud app connects to Petals' server as a connector (brain/chapters/connect-cloud.md, generated);
    // the words are WORKSPACE's drafts, 9 Nov, for Elco to approve.
    {
      id: 'claude-app',
      title: 'The Claude app',
      how: 'Add Petals as a connector: Customize > Connectors, Add custom connector, name it Petals, and paste this address. It reads and draws what Petals already holds. For new readings, use Claude Code.',
      copy: connectorAddress(origin),
      copyLabel: 'Copy the address',
    },
    {
      id: 'chatgpt',
      title: 'ChatGPT',
      how: 'On a paid plan, add Petals as an app: in Settings, turn on developer mode (Apps and Connectors, Advanced), then create an app with this address. It reads and draws what Petals already holds. For new readings, use Codex.',
      copy: connectorAddress(origin),
      copyLabel: 'Copy the address',
    },
    {
      id: 'claude-code',
      title: 'Claude Code',
      how: 'To keep Petals in Claude Code for next time, run this once in a terminal. It adds Petals to Claude Code’s tools, so it’s there in every new conversation.',
      copy: `${file} && ${keep.claude}`,
      copyLabel: 'Copy the command',
    },
    {
      id: 'codex',
      title: 'Codex',
      how: 'To keep Petals in Codex for next time, run this once in a terminal. It adds Petals to Codex’s tools, so it’s there in every new conversation.',
      copy: `${file} && ${keep.codex}`,
      copyLabel: 'Copy the command',
    },
    {
      id: 'hermes',
      title: 'Hermes',
      how: 'To keep Petals in Hermes for next time, run this once in a terminal. It adds Petals to Hermes’ tools, so it’s there in every new conversation.',
      copy: `${file} && ${keep.hermes}`,
      copyLabel: 'Copy the command',
    },
    {
      id: 'other',
      title: 'Anything else',
      // a draft (WORKSPACE, 9 Nov), for Elco to approve
      how: 'Any agent that can run commands on your computer can use the prompt above. An app that takes an MCP server’s address, such as Cursor, can add Petals with this one instead: it reads and draws what Petals already holds.',
      copy: connectorAddress(origin),
      copyLabel: 'Copy the address',
    },
  ];
}
