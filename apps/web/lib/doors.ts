// One way to connect your agents (Elco's fix 1, 10 Nov): the first door is the one prompt the menu's "Copy
// for your agents" copies (agentWords.prompt in lib/agents.ts), with a fresh agent key, so an agent
// connected from /connect joins the account, shows under "Your agents" and takes jobs. The page mints the
// key for a signed-in person, and asks them to Connect first otherwise (WORKSPACE's page). The other doors'
// words come from the connect chapters' "On Petals' connect page" sections (brain/chapters/connect-*.md,
// generated), the one source of how each app connects; their commands and the address too. Words are drafts.
import { chapterDoors, connectorAddress, getFile, keepCommands } from './agent-prompt.ts';

/** The page's own words: the person's agents connect to their account, on their computer or in the cloud. */
export const connectPage = {
  title: 'Use Petals from your own AI',
  lead: 'One prompt connects any of your agents to your Petals: it shows under Your agents, and takes the jobs Petals’ agent hands out. Claude Code, Codex and Hermes run Petals’ tools on your computer. The Claude app and ChatGPT reach Petals through its connector, below.',
} as const;

export interface Door {
  id: string;
  title: string;
  /** what to do, in plain words */
  how: string;
  /** what the person copies, if anything */
  copy?: string;
  copyLabel?: string;
  /** The one prompt, with a fresh agent key the page mints (agentWords.prompt): no fixed copy. */
  agentKey?: true;
}

/** The door's anchor, from its title: "The Claude app" is claude-app. */
const idOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/^the /, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The order the page shows them in, after the prompt: connecting first, keeping for next time after. */
const ORDER = ['claude-app', 'chatgpt', 'claude-code', 'codex', 'hermes', 'anything-else'];

export function doors(origin: string): Door[] {
  const file = getFile(origin);
  const keep: Record<string, string> = keepCommands();
  const address = connectorAddress(origin);
  const fromChapters = chapterDoors(origin).map((d): Door => {
    const id = idOf(d.title);
    return d.app === 'cloud'
      ? { id, title: d.title, how: d.how, copy: address, copyLabel: 'Copy the address' }
      : {
          id,
          title: d.title,
          how: d.how,
          copy: `${file} && ${keep[d.app === 'claude-code' ? 'claude' : d.app]}`,
          copyLabel: 'Copy the command',
        };
  });
  const rank = (d: Door) => (ORDER.includes(d.id) ? ORDER.indexOf(d.id) : ORDER.length);
  return [
    {
      id: 'prompt',
      title: 'Any of your agents',
      how: 'Paste this into Claude Code, Codex, Hermes, the Claude app or ChatGPT. It connects that agent to your Petals, so it shows under Your agents and takes your jobs. Each copy carries a key of its own: copy it again for each agent. The first time, an agent on your computer asks you once to let Petals’ tools run, because they come from this site. Say yes: they read public data and keep their notes in a folder called .petals.',
      agentKey: true,
    },
    ...fromChapters.sort((a, b) => rank(a) - rank(b)),
  ];
}
