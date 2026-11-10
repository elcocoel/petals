// The door for anyone's agent: a prompt a person copies, the skill the server serves, and the
// commands that fetch Petal as one file. The site shows the prompt and the commands on /connect, and
// the server serves the skill, so both take them from here and say the same thing. The prompt speaks as
// the person and says what it is, so an agent can decide to help rather than being told to obey a page.

import { CONNECT_CHAPTERS, type ConnectChapter } from './connect.generated.ts';

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

/** The connect chapters, with this site's address written in ({site}, {host}). */
const fill = (text: string, origin: string) =>
  text.replaceAll('{site}', origin).replaceAll('{host}', new URL(origin).host);

/** A chapter by its app, as the generated words hold it (brain/chapters/connect-*.md). */
const chapterOf = (app: string): ConnectChapter => {
  const c = CONNECT_CHAPTERS.find((x) => x.app === app);
  if (!c) throw new Error(`no connect chapter for ${app}`);
  return c;
};

/** The first command block of a chapter's section. */
const commandIn = (c: ConnectChapter, heading: string): string => {
  const body = c.sections.find((s) => s.heading === heading)?.body ?? '';
  const block = /```bash\n([\s\S]*?)\n```/.exec(body)?.[1]?.trim();
  if (!block) throw new Error(`${c.id}: no command under "${heading}"`);
  return block;
};

/**
 * Each agent's own command to keep the file as its tools, as its connect chapter says it (step 4: one
 * source). They take effect in a new session.
 */
export function keepCommands(): { claude: string; codex: string; hermes: string } {
  return {
    claude: commandIn(chapterOf('claude-code'), 'Keep Petals for next time'),
    codex: commandIn(chapterOf('codex'), 'Keep Petals for next time'),
    hermes: commandIn(chapterOf('hermes'), 'Keep Petals for next time'),
  };
}

/** The address a cloud app adds as a connector, as connect-cloud gives it ({site}/mcp). */
export function connectorAddress(origin: string): string {
  const intro = chapterOf('cloud').intro;
  const block = /```\n([^`\n]+)\n```/.exec(intro)?.[1]?.trim();
  if (!block) throw new Error('connect-cloud: no address block in its opening');
  return fill(block, origin);
}

/** Each app's own steps, from its chapter, for /skill.md: every section but the setup (above) and the page's box. */
function appSteps(origin: string): string {
  const out: string[] = [];
  for (const c of CONNECT_CHAPTERS) {
    const app = c.title.replace(/^Connect /, '');
    out.push(`### ${app.charAt(0).toUpperCase()}${app.slice(1)}`, '', fill(c.intro, origin), '');
    for (const sec of c.sections) {
      // the page's box isn't theirs, and the two setup commands are already above, the same for every app
      if (sec.heading === "In the box on Petals' page" || sec.heading === 'Set up, every session')
        continue;
      out.push(`#### ${sec.heading}`, '', fill(sec.body, origin), '');
    }
    out.push(`All of it, always the latest: \`${origin}/api/v1/brain/files/${c.id}\`.`, '');
  }
  return out.join('\n');
}

export function agentPrompt(origin: string): string {
  const local = isThisMachine(origin)
    ? " It's running on this machine, so if your web tool won't open a local address, use curl."
    : '';
  return [
    `I'd like to use Petal with you. It maps who holds power in crypto networks (${origin}). It's public and read-only, with no account or key.`,
    `Its tools run on my own computer, so this needs an app that can run commands here: Claude Code (in a terminal, or under Code in the Claude desktop app), Codex or Hermes. The Claude app's chat runs in the cloud and can't. If you can't run commands here, don't try: tell me so in one line, and that I can add Petals as a connector at ${origin}/mcp.`,
    `Its instructions for you are at ${origin}/skill.md.${local} Its brain: ${origin}/api/v1/brain/route?q=<your app and what I ask>. Please read them and set yourself up in whatever way works from where you are, without asking me to choose anything. If your app needs my permission for something, ask me for it: the first time it runs Petal's file, it may, because the file comes from this site. I want to watch this conversation on Petal's page in my browser, so please open that page for me, and post each flower and your replies there word for word. Then tell me in a line or two what you can do, and ask what I'm curious about.`,
  ].join('\n\n');
}

/** What an agent works out for itself, so the person has nothing to understand (Elco, 6 Nov). */
function setup(origin: string, fileSha?: string): string {
  const host = new URL(origin).host;
  const sha = fileSha ? `, sha256 \`${fileSha}\` (\`shasum -a 256 ${FILE_PATH}\`)` : '';
  return `## Set yourself up first

Work this out yourself, fast: the person is waiting, and setup should take seconds plus one yes. Don't ask them to choose anything, and don't explain unless something goes wrong. A permission isn't a choice: when your app needs one, ask for it.

**First, where you run.** If you're the Claude app's chat or ChatGPT, a sandbox there isn't the person's computer, and the commands below can't reach Petals from it. Use the Petals connector at \`${origin}/mcp\` if it's added, or tell the person in a line how to add it (the cloud app's steps below), and run nothing here. A sandbox's network refusal can't be approved in the chat: don't retry it or look for a way round.

Petal's tools are one file that runs on this computer. Every read, search and drawing happens here, on nobody else's account, and the site only shows what you send it. No account or key. Don't call this site's API to read or draw: the file does it here.

- **You already have Petal's tools** (\`find_target\`, \`render_flower\`, from a \`petals\` MCP server): use them, and start the page with \`start_exploration\` (below).
- **You have a shell on the person's computer:** run these two commands as written, and nothing else first:

  \`\`\`bash
  ${getFile(origin)}
  ${RUN} start --client "<your app: Claude Code, Codex or Hermes>" --question "<what they asked, or: A conversation about who holds power>"
  \`\`\`

  The first gets the file: run it every session, since it takes a second and keeps the file current and from this site. The second starts this conversation's page and opens it in their browser, in one call; its \`site\` must be \`${origin}\`, or the file came from somewhere else, so fetch it again. Every tool is then a command, listed under "Calling the tools as commands". It needs Node 22.13 or newer: if \`node\` is missing or older, say so in a line.

**What the file is, so you needn't audit it:** one file, built by this site from Petals' own source with esbuild, not minified${sha}. Its first lines say what it does. It reads public chain data and web pages from this computer, keeps its notes in \`~/.petals\`, and sends this conversation and its flowers to \`${host}\`. It starts another program only to open the page in the browser, and for its \`terminal\` command, to run the person's own agent through Python's pty and, on a Mac, to make Petals Helper.app with macOS's own tools. It has no WebAssembly and no install step.

**Your app's own steps** come from Petals' brain, one chapter per app. Follow yours:

${appSteps(origin)}
**Any other app** that runs commands on their computer: the two commands above are all it takes. If its sandbox refuses them, ask in one line, naming what to allow: reaching \`${host}\` and the public sites the file reads, from your shell. The file changes nothing in your app: only keeping Petals for next time does, and only when they ask.

Publishing to Petal's shared map isn't in these tools yet. If they ask, say so in a line.

## Let them watch

This conversation gets one page on this site, where they see your work as it happens. Never start a second one for it. If a step fails, say so in a line and carry on with your answer.

1. **Right away, before your first reply:** \`${RUN} start\`, as above, opens the page. With MCP tools instead, call \`start_exploration\` with \`client\` and \`question\`, and give them \`open_url\` in one line. \`link.url\` is your key: keep it, and don't show it.
2. **Each flower you draw** is saved to that page by \`render_flower\` itself, with the reading it came from: no \`save-step\` needed. Its \`short_url\` is the link to give. \`${RUN} help <command>\` lists any command's flags and what it answers with, so there's never a reason to read the file.
3. **Each reply:** before you finish it, post the person's words and then your reply, word for word, as one note. As a command, with no escaping to worry about:

   \`\`\`bash
   ${RUN} note <<'PETALS'
   <their words>

   <your reply>
   PETALS
   \`\`\`

   With MCP tools, \`add_note\` with \`text\`. That note is all they see of what you said, so leave out only \`open_url\`, which is a key.

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
| \`start_exploration\`, \`add_note\` | \`start --client … --question …\` (and it opens the page), \`note\` (text from a heredoc) |
| \`brain_route\`, \`brain_file\` | \`brain-route --question …\` (your app and what you're doing), \`brain-file <id>\` |
| \`take_job\`, \`report_job\` | \`take-job\`, \`report-job --job <id> --input @report.json\` |
| one of the person's agents | \`join <agent link> --as <your app>\` once, then \`jobs wait\`, again after each job |

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
export function hostedSkill(
  skill: string,
  origin: string,
  fileSha?: string,
  brainVersion?: string,
): string {
  let md = skill.replace(/^---\n[\s\S]*?\n---\n+/, '');
  md = section(md, 'Quick Start', setup(origin, fileSha));
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
    `## Connecting\n\nThe file is at \`${origin}/petal.mjs\`, and these instructions stay at \`${origin}/skill.md\`.${brainVersion ? ` Petals' brain here is version \`${brainVersion}\`: \`${origin}/api/v1/brain/files/doctrine\` first, then \`${origin}/api/v1/brain/route?q=<your app and what you're doing>\`.` : ''}\n`,
  );
  return md;
}
