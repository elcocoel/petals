// Many doors, one tool universe (Elco, 5 Nov): whatever someone already uses, one clear way in,
// and no repo to clone. Every door reaches the same tools, rules and flowers on this site.
import { agentPrompt, getFile, keepCommands } from './agent-prompt.ts';

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
  const mcp = `${origin}/mcp`;
  // The tools run on the person's own computer, from one file this site serves (petal.mjs).
  const file = getFile(origin);
  const keep = keepCommands();
  return [
    {
      id: 'prompt',
      title: 'Any AI chat or agent',
      how: 'Paste this in. Agents that can make web requests can do everything straight away. Stricter apps can still look things up, and will say what they can’t do.',
      copy: agentPrompt(origin),
      copyLabel: 'Copy this prompt',
    },
    {
      id: 'claude-app',
      title: 'The Claude app',
      how: 'Open Customize, then Connectors, press +, choose Add custom connector, and paste this address. Then ask: “Using Petals, who holds the shares of Moloch DAO?”',
      copy: mcp,
      copyLabel: 'Copy the address',
    },
    {
      id: 'chatgpt',
      title: 'ChatGPT',
      how: 'In Settings, under Apps & Connectors, turn on Developer mode under Advanced and add this address. It depends on your plan. If you don’t see it, use the prompt above.',
      copy: mcp,
      copyLabel: 'Copy the address',
    },
    {
      id: 'claude-code',
      title: 'Claude Code',
      how: 'Run this once in a terminal.',
      copy: `${file} && ${keep.claude}`,
      copyLabel: 'Copy the command',
    },
    {
      id: 'codex',
      title: 'Codex',
      how: 'Run this once in a terminal.',
      copy: `${file} && ${keep.codex}`,
      copyLabel: 'Copy the command',
    },
    {
      id: 'hermes',
      title: 'Hermes',
      how: 'Run this once in a terminal.',
      copy: `${file} && ${keep.hermes}`,
      copyLabel: 'Copy the command',
    },
    {
      id: 'other',
      title: 'Anything else that supports MCP',
      how: 'Give it this address.',
      copy: mcp,
      copyLabel: 'Copy the address',
    },
  ];
}
