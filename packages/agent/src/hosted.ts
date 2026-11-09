// The door for anyone's agent: a prompt a person copies, the skill the server serves, and the
// commands that fetch Petal as one file. The site shows the prompt and the commands on /connect, and
// the server serves the skill, so both take them from here and say the same thing. The prompt speaks as
// the person and says what it is, so an agent can decide to help rather than being told to obey a page.

/** This site as the visitor reached it, also behind a proxy or tunnel. */
export function originFrom(headers: Headers, fallback = 'http://localhost:3080'): string {
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (!host) return fallback;
  const proto =
    headers.get('x-forwarded-proto') ??
    (/^(localhost|127\.0\.0\.1)\b/.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** On this machine, some agents' web tools refuse the address on principle (Hermes's, Claude's). */
const isThisMachine = (origin: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(origin);

/** Where a person's agent keeps Petals' file, and how it runs it. */
export const FILE_PATH = '~/.petals/petal.mjs';
const RUN = 'node ~/.petals/petal.mjs';

/** The one line a terminal runs to fetch the file. */
export const getFile = (origin: string) =>
  `curl -fsSL ${origin}/petal.mjs --create-dirs -o ${FILE_PATH}`;

/**
 * What a person runs, once, to see their own agent in a box on the Petals page: the file, then its
 * terminal helper on 127.0.0.1, which prints the pairing code to type into the page.
 */
export const terminalCommand = (origin: string, agent: 'claude' | 'codex' | 'hermes' = 'claude') =>
  `${getFile(origin)} && ${RUN} terminal${agent === 'claude' ? '' : ` ${agent}`}`;

/** Each agent's own command to keep the file as its tools. They take effect in a new session. */
export function keepCommands(): { claude: string; codex: string; hermes: string } {
  const node = '"$(command -v node)" "$HOME/.petals/petal.mjs" mcp';
  return {
    claude: `claude mcp add petals -- ${node}`,
    codex: `codex mcp add petals -- ${node}`,
    hermes: `printf 'Y\\n' | hermes mcp add petals --command "$(command -v node)" --args "$HOME/.petals/petal.mjs" mcp`,
  };
}

export function agentPrompt(origin: string): string {
  const local = isThisMachine(origin)
    ? " It's running on this machine, so if your web tool won't open a local address, use curl."
    : '';
  return [
    `I'd like to use Petal with you. It maps who holds power in crypto networks (${origin}). It's public and read-only, with no account or key.`,
    `Its tools run on my own computer, so this needs an app that can run commands here: Claude Code (in a terminal, or under Code in the Claude desktop app), Codex or Hermes. The Claude app's chat runs in the cloud and can't. If you can't run commands on my computer, don't try: tell me so in one line, and which of those apps to open instead.`,
    `Its instructions for you are at ${origin}/skill.md.${local} Please read them and set yourself up in whatever way works from where you are, without asking me to choose anything. If your app needs my permission for something, ask me for it: the first time it runs Petal's file, it may, because the file comes from this site. I want to watch this conversation on Petal's page in my browser, so please open that page for me, and post each flower and your replies there word for word. Then tell me in a line or two what you can do, and ask what I'm curious about.`,
  ].join('\n\n');
}

/** What an agent works out for itself, so the person has nothing to understand (Elco, 6 Nov). */
function setup(origin: string): string {
  const keep = keepCommands();
  return `## Set yourself up first

Work this out yourself. The person doesn't need to understand any of it, so don't ask them to choose, and don't explain it unless something goes wrong. A permission isn't a choice: when your app needs one, ask for it.

Petal's tools are one file that runs on this computer. Every read, search and drawing happens here, from this machine, on nobody else's account, and the site only shows what you send it. No account or key. Don't call this site's API to read or draw: it doesn't do that for anyone, and the file does it here.

- **You already have Petal's tools** (\`find_target\`, \`render_flower\`, from a \`petals\` MCP server): use them.
- **You have a shell:** get the file, unless \`${FILE_PATH}\` is already there, then run it:

  \`\`\`bash
  ${getFile(origin)}
  ${RUN} help
  \`\`\`

  Each tool is a command with JSON out, under "Calling the tools as commands". It needs Node 22.13 or newer: if \`node\` is missing or older, say so in a line, and install a current one if you can.

Try that once. If it works, go on. If it doesn't, don't test other ways in: one of these says what to do, and getting set up should take under a minute.

- **Your app holds the file back the first time** because it was downloaded: that's expected. Ask the person once, in one line, saying what it is: Petal's tools, from \`${new URL(origin).host}\`, which read public chain data and keep their notes in \`~/.petals\`. In Claude Code, suggest the rule \`Bash(${RUN}:*)\`, so later commands don't ask again. The file installs nothing and changes nothing in your app: only keeping Petal for next time does, below, and only when they ask.

- **Your app's sandbox refused it** (a network connection blocked, or a folder outside your workspace): ask for the permission now, the way your app asks the person. A sandbox's refusal isn't the person's no: they haven't been asked. The file reads public chain sites from this computer, which a sandbox's list doesn't hold, so it needs the network for every command, not just the download.
  - Claude Code: run the same command again outside the sandbox (the Bash tool's \`dangerouslyDisableSandbox\`), so the person is asked to approve it, and run each \`${RUN}\` command the same way.
  - Codex: run it again with escalated permissions, so the person gets Codex's approval.
  - Any other app: ask in one line, naming what to allow: reaching \`${new URL(origin).host}\` and the public sites the file reads, from your shell.

  If only the folder was refused, no permission is needed: keep the file in your working folder and set \`PETALS_HOME\` to a folder beside it, the same on every command.
- **You run in a cloud or remote sandbox,** not on the person's own computer (Claude Code on the web, a hosted workspace): you can't widen its network yourself. Say so in one line, with the two ways on: turn on full internet access in that environment's settings and ask again, or paste the same prompt into Claude Code, Codex or Hermes on their own computer.
- **You can't run commands on the person's computer at all,** as in the Claude app's chat: say so in one line, at once, and name the apps that can: Claude Code (in a terminal, or under Code in the Claude desktop app), Codex or Hermes.

If they ask to keep Petal for next time, add the file as an MCP server for them. It takes effect in a new session:

- Claude Code: \`${keep.claude}\`
- Codex: \`${keep.codex}\`
- Hermes: \`${keep.hermes}\`. In Hermes, \`/reload-mcp\` loads it into an open session.

Publishing to Petal's shared map isn't in these tools yet. If they ask, say so in a line.

## Let them watch

When they've asked to watch, this conversation gets one page on this site, where they see your work as it happens. Never start a second one for it. If a step fails, say so in a line and carry on with your answer.

1. **Right away, before your first reply:** call \`start_exploration\` with \`client\` set to the app you run in (\`Claude Code\`, \`Codex\`, \`Hermes\`) and \`question\` set to what they asked, or to \`A conversation about who holds power\` if they haven't asked yet. As a command: \`${RUN} start-exploration --client "Claude Code" --question "…"\`.
2. **Give them \`open_url\`** in that reply, in one line, and open it for them if you can. \`link.url\` is your key: keep it, and don't show it.
3. **Each flower you draw** is saved to that page by \`render_flower\` itself, with the reading it came from. Its \`short_url\` is the link to give.
4. **Each reply:** before you finish it, post the person's words and then your reply word for word, as one note: \`add_note\` with \`text\`, and \`exploration\` set to \`link.url\`. As a command, put \`{ "exploration": "…", "text": "…" }\` in a file and run \`${RUN} add-note --input @note.json\`. That note is all they see of what you said, so leave out only \`open_url\`, which is a key.

`;
}

/** The tools as commands of the file, in place of the HTTP routes the site no longer runs. */
function commands(): string {
  return `## Calling the tools as commands

\`${RUN} <command>\` runs one tool here: JSON on stdout, progress on stderr (\`--quiet\` drops it). \`${RUN} help <command>\` lists its flags, which are the tool's input in kebab-case. \`--input @file.json\` sends the whole input from a file, which is the way for a spec or an interpretation. A network id in place of a sha256 or a spec takes the snapshot first.

| Tool | Command |
| --- | --- |
| \`look_up\` | \`look-up <query>\` |
| \`find_target\` | \`find <query>\` |
| \`read_chain\` | \`read-chain <address>\` |
| \`read_page\`, \`search\` | \`read-page <url>\`, \`search <query>\` |
| \`list_networks\` | \`networks [query]\` |
| \`get_snapshot\` | \`snapshot <network> [--params <json>] [--fresh]\` |
| \`describe_snapshot\` | \`describe <sha256> --top 10\` |
| \`compute_figures\` | \`figures <sha256> --measure <id>\` |
| \`propose_spec\` | \`propose <network> --sha256 <sha256> [--segments …]\` |
| \`validate_spec\` | \`validate @spec.json --interpretation @interpretation.json\` |
| \`render_flower\` | \`render @spec.json\` |
| \`list_flowers\`, \`get_flower\` | \`flowers [network]\`, \`flower <id>\` |
| \`start_exploration\`, \`add_note\` | \`start-exploration\`, \`add-note\` |

- Save the spec exactly as \`propose_spec\` returned it, as \`spec.json\` in your working folder, and the interpretation as \`interpretation.json\`.
- Run each command as written, on its own: a \`>\`, a \`cd\` or a \`$?\` can make an agent's permission check stop it. Writing a file with your own file tool is fine.

## Example: who stands behind NEAR's validators?

\`\`\`bash
${RUN} networks near --quiet
${RUN} snapshot near-validators --quiet
${RUN} describe <sha256> --top 10 --quiet
${RUN} figures <sha256> --measure validator_stake_current_epoch --quiet
${RUN} propose near-validators --sha256 <sha256> --segments backers --quiet
\`\`\`

Save the proposal's \`spec\` as \`spec.json\` and your interpretation as \`interpretation.json\`, then:

\`\`\`bash
${RUN} validate @spec.json --interpretation @interpretation.json --quiet
${RUN} render @spec.json --quiet
\`\`\`

"Who stands behind" asks for the backers of each pool, so the one choice is \`segments: "backers"\`; everything else is the default. The measure id comes from \`describe_snapshot\` (\`measures\`).
`;
}

const section = (md: string, title: string, body: string) => {
  const at = md.indexOf(`## ${title}\n`);
  if (at === -1) throw new Error(`the skill has no section "${title}"`);
  const next = md.indexOf('\n## ', at + 1);
  return `${md.slice(0, at)}${body}${next === -1 ? '\n' : md.slice(next)}`;
};

/** Drops a section, heading and all. */
const cut = (md: string, title: string) => section(md, title, '');

/**
 * skill/petal/SKILL.md for an agent with no clone: this site's address, the tools as one file on
 * the person's own computer (petal.mjs), and no routes that read for them.
 */
export function hostedSkill(skill: string, origin: string): string {
  let md = skill.replace(/^---\n[\s\S]*?\n---\n+/, '');
  md = section(md, 'Quick Start', setup(origin));
  md = section(
    md,
    'When no Petal site is running',
    `## Links\n\nHand the person \`short_url\` when \`render_flower\` gives one, because it fits on a line, and open it for them if you can. A flower is drawn here and shown on this site (\`${origin}\`) once it's saved to the conversation's page.\n`,
  );
  // the curl example goes first, so the commands' own example takes its place
  md = cut(md, "Example: who stands behind NEAR's validators?");
  md = section(md, 'Calling the tools over HTTP', commands());
  md = cut(md, 'Publishing');
  md = section(
    md,
    'Resources',
    `## Connecting\n\nThe file is at \`${origin}/petal.mjs\`, and these instructions stay at \`${origin}/skill.md\`.\n`,
  );
  return md;
}
