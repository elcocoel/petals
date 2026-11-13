// Does meaning beat words? The model is kept only where it beats words. Questions with known answers, over
// the brain's headers and the map (its cards and their proposals), ranked five ways:
//   today     what Petals does now: the brain's BM25 routing; the map's every-word match on its cards (searchMap)
//   words     BM25 over every document, proposals included
//   meaning   Qwen3-Embedding alone
//   both      words and meaning fused
//   reranked  both, then Qwen3-Reranker over the best 30
// Usage: node scripts/search-eval.ts <folder with maps.json and proposals/*.json, from GET /api/v1/maps and
//   /api/v1/maps/:id/proposals> --url <the oMLX server, e.g. http://127.0.0.1:8095> [--only maps|brain]
//   [--show] [--embedding Qwen3-Embedding-4B] [--reranker Qwen3-Reranker-4B]
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type Findable,
  find,
  memoryVectors,
  readBrain,
  routeBrain,
  SEARCH_RERANKER,
  type SearchSet,
  searchModel,
  searchSet,
  type VectorKeep,
} from '@petal/tools';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    url: { type: 'string' },
    only: { type: 'string' },
    show: { type: 'boolean' },
    embedding: { type: 'string' },
    reranker: { type: 'string' },
    vectors: { type: 'string' },
    heads: { type: 'string' },
  },
});
const folder = positionals[0];
if (!folder || !values.url)
  throw new Error('usage: search-eval.ts <folder> --url <oMLX> [--only maps|brain]');
const model = searchModel(values.url, {
  ...(values.embedding ? { embedding: values.embedding } : {}),
  ...(values.reranker ? { reranker: values.reranker } : {}),
});
console.log(`models: ${model.embedding}, ${values.reranker ?? SEARCH_RERANKER}`);
const keep = values.vectors ? fileVectors(values.vectors) : memoryVectors();

/** Vectors kept in a folder between runs, one file per model, so a big model embeds the map once. */
function fileVectors(dir: string): VectorKeep {
  mkdirSync(dir, { recursive: true });
  const loaded = new Map<string, Map<string, Float32Array>>();
  const of = (model: string) => {
    let m = loaded.get(model);
    if (!m) {
      m = new Map();
      const f = join(dir, `${model}.jsonl`);
      if (existsSync(f)) {
        for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
          const { sha, v } = JSON.parse(line) as { sha: string; v: string };
          const b = Buffer.from(v, 'base64');
          m.set(sha, new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));
        }
      }
      loaded.set(model, m);
    }
    return m;
  };
  return {
    async get(model, shas) {
      const m = of(model);
      return new Map(shas.filter((s) => m.has(s)).map((s) => [s, m.get(s) as Float32Array]));
    },
    async put(model, rows) {
      const m = of(model);
      appendFileSync(
        join(dir, `${model}.jsonl`),
        rows
          .map((r) => {
            m.set(r.sha256, r.vector);
            const v = Buffer.from(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength);
            return `${JSON.stringify({ sha: r.sha256, v: v.toString('base64') })}\n`;
          })
          .join(''),
      );
    },
  };
}

// -- the brain: its own test's questions (brain-service.test.ts), and the same chapters asked in other words

const BRAIN_TESTED: [string, string][] = [
  ['who holds the power in RaidGuild?', 'where-power-lives'],
  ['who controls this treasury', 'where-power-lives'],
  ['map the members of this DAO and how they vote', 'where-power-lives'],
  ['who can upgrade this contract or pause it', 'who-can-move-money-or-change-rules'],
  ['who are the signers of this multisig', 'where-power-lives'],
  ['who delegates to whom in this governance', 'where-power-lives'],
  ['who sponsored the most proposals', 'where-power-lives'],
  ['what is 0x1234abcd, is it a wallet or a contract?', 'start-from-an-address'],
  ['I have an address, tell me what it is', 'start-from-an-address'],
  ['how did the holders change over the last year', 'over-time'],
  ['show me the history since january', 'over-time'],
  ['what changed between last month and now', 'over-time'],
  ['Petals cannot read this framework, can you figure it out', 'a-new-system'],
  ['this contract is not supported', 'a-new-system'],
  ['find who is behind this wallet on twitter or the forum', 'open-source-leads'],
  ['what does the ENS name say', 'open-source-leads'],
  ['tell me more about the top holder', 'going-deeper'],
  ['go deeper', 'going-deeper'],
  ['how do I improve this recipe on github', 'contributing'],
  ['I want to contribute a fix, open a pull request', 'contributing'],
  ["I'm Claude Code, how do I connect to Petals", 'connect-claude-code'],
  ['set up petals in codex', 'connect-codex'],
  ["I'm Hermes, how do I install Petals", 'connect-hermes'],
  ['add petals to chatgpt', 'connect-cloud'],
  ['connect the claude app as a custom connector', 'connect-cloud'],
  ['keep petals in claude code for next time', 'connect-claude-code'],
  ['cursor remote mcp url for petals', 'connect-cloud'],
  ['can anyone mint more of this token', 'who-can-move-money-or-change-rules'],
  ['who holds the delegated voting power of ENS', 'who-gets-a-vote'],
  ['how do I leave this DAO, can I ragequit', 'who-gets-a-vote'],
  ['who voted on proposals in this Governor contract', 'from-proposal-to-action'],
  ['the quorum and voting rules of this DAO', 'from-proposal-to-action'],
  ['did this proposal pass and get executed in Moloch DAO', 'from-proposal-to-action'],
  ['who are the signers of this Safe multisig treasury', 'who-can-move-money-or-change-rules'],
  ['who can upgrade or pause this contract', 'who-can-move-money-or-change-rules'],
  ["who can spend the DAO's funds", 'who-can-move-money-or-change-rules'],
  ['who can mint this token', 'who-can-move-money-or-change-rules'],
  ["who are NEAR's validators and who backs them", 'stake-behind-the-network'],
  ['who controls this DAO', 'where-power-lives'],
  ['what is this token worth in dollars', 'value'],
  ["what's the treasury worth", 'value'],
  ['when do these tokens unlock', 'vesting'],
  ['is this a multisig or a DAO', 'what-kind-of-thing-it-is'],
  ['is this an exchange wallet', 'what-kind-of-thing-it-is'],
];

/** The same chapters, asked in words their headers weren't tuned to. */
const BRAIN_NEW: [string, string][] = [
  ["who's really in charge here", 'where-power-lives'],
  ['can the team freeze everything or change the code', 'who-can-move-money-or-change-rules'],
  ['what did this look like a year ago', 'over-time'],
  ['who is this person on social media', 'open-source-leads'],
  ['let me hook up my claude desktop app', 'connect-cloud'],
  ["is this a centralised exchange's hot wallet", 'what-kind-of-thing-it-is'],
  ['how much money does this DAO have in USD', 'value'],
  ['the cliff and release schedule of team tokens', 'vesting'],
  ['how does a vote turn into a transaction on chain', 'from-proposal-to-action'],
  ['who has a say in decisions', 'who-gets-a-vote'],
  ['the staking pools that secure NEAR', 'stake-behind-the-network'],
  ['this is some contract type you have never seen', 'a-new-system'],
  ['quién controla esta DAO', 'where-power-lives'],
  ['cuánto vale este token en dólares', 'value'],
];

// -- the map: questions without the thing's name, proposals in other words, and exact lookups words must keep

/** A map question: any of these map ids (an id's end is enough) answers it, as the map or one of its proposals. */
const MAP_Q: [string, string[]][] = [
  ['the DAO that funds NEAR marketing', ['marketing.sputnik-dao.near']],
  ['who pays for NEAR promotion, ads and events', ['marketing.sputnik-dao.near']],
  ['women building on NEAR', ['she-is-near.sputnik-dao.near']],
  ['the NEAR community in Africa', ['near-africa-community-dao.sputnik-dao.near']],
  ['the NFT working group on NEAR', ['nearnftwg.sputnik-dao.near']],
  [
    'a DAO for artists and creators on NEAR',
    ['creatives.sputnik-dao.near', 'creativesdao.sputnik-dao.near'],
  ],
  ['freelancers on NEAR', ['freelancerdao.sputnik-dao.near']],
  ['game developers on NEAR', ['gaming-dao.sputnik-dao.near']],
  ['who runs and secures the NEAR network', ['near:mainnet:validators']],
  [
    'NEAR governance where people vote with locked NEAR',
    [
      'near:mainnet:house-of-stake',
      'houseofstake.sputnik-dao.near',
      'houseofstake-ops.sputnik-dao.near',
      'hos-root.sputnik-dao.near',
    ],
  ],
  ["Ethereum's domain name system DAO", ['0xc18360217d8f7ab5e7c516566761ea12ce7f9d72']],
  [
    'the largest decentralised exchange on Ethereum',
    ['0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', '0xc3de830ea07524a0761646a6a4e4be0e114a3c83'],
  ],
  [
    'liquid staking for Ethereum',
    [
      '0x5a98fcbea516cf06857215779fd812ca3bef1b32',
      '0xd33526068d116ce69f19a9ee46f0bd304f21a51f',
      '0xfe0c30065b384f05761f15d0cc899d4f9f9cc0eb',
    ],
  ],
  [
    'liquid staking on Solana',
    [
      'MNDEFzGvMt87ueuHvVU9VcTqsAP5b3fTGPsHuuPA5ey',
      'nonzero current VSR voter deposits',
      'current nonzero council deposits',
      'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
      'CscwCYoM9JoHaJrszmcEx4oGbnSahTF9DHqKWpw3GdLN',
      'CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu',
      '4qnVjPG8DxoYYJifS83iExe3GWnM4JK4b6mBZRaR4gs9',
    ],
  ],
  [
    'the dog memecoin on Solana',
    [
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      'G3EzHHXPd434o31FKxd32eYQ673eDjyYiWWNZpMk9ppt',
    ],
  ],
  [
    'the guild of web3 developers and designers on Gnosis',
    [
      '0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986',
      '0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6',
      '0xe74c2701c878b34fc4f5d0cfac20eff022f328a7',
    ],
  ],
  [
    "the smart account wallet's governance token",
    ['0x5afe3855358e112b5647b952709e6165e1c1eeee', '0x4d18815d14fe5c3304e87b3fa18318baa5c23820'],
  ],
  [
    'the DAO behind the batch auction DEX',
    [
      'cow.eth-2026-selected-ballots',
      'cow.eth-cip-91-voters',
      'cow-documented-gnosis-safes',
      '0x177127622c4a00f3d409b75571e12cb3c8973d3c',
      '0xdef1ca1fb7fbcdc777520aa7f396b4e015f497ab',
    ],
  ],
  [
    'funding public goods and open source',
    [
      '0xde30da39c46104798bb5aa3fe8b9e0e1f348163f',
      'giveth-basic-ballot-participation',
      '0xc0dbdca66a0636236fabe1b3c16b1bd4c84bb1e1',
      '0x4f4f9b8d5b4d0dc10506e5551b0513b61fd59e75',
    ],
  ],
  [
    'decentralised science research funding',
    [
      'documented-treasury-account',
      '0xfbb75a59193a3525a8825bebe7d4b56899e2f7e1',
      'historical-snapshot-ballot-addresses',
      '0xd101dcc414f310268c37eeb4cd376ccfa507f571',
    ],
  ],
  [
    'a lending protocol',
    [
      '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9',
      '0xc00e94cb662c3520282e6f5717214004a7f26888',
      '0x9e1028f5f1d5ede59748ffcee5532509976840e0',
      '0x3082cc23568ea640225c2467653db90e9250aaa0',
      '0xa88594d404727625a9437c3f886c7643872296ae',
      '0xe66e3a37c3274ac24fe8590f7d84a2427194dc17',
      '0xbaa5cc21fd487b8fcc2f632f3f4e8d37262a0842',
      '0x58d97b57bb95320f9a05dc918aef65434969c2b2',
      'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS',
      '0x3a97704a1b25f08aa230ae53b352e2e72ef52843',
    ],
  ],
  [
    'perpetual futures exchange',
    [
      '0x2a29d3a792000750807cc401806d6fd539928481',
      '0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a',
      '0x18c11fd286c5ec11c3b683caa813b77f5163a122',
      '0x92d6c1e31e14520e676a687f0a93788b716beff5',
      'DriFtupJYLTosbwoN8koMbEYSx54aFAVLddWsbksjwg7',
      '0xb528edbef013aff855ac3c50b381f253af13b997',
    ],
  ],
  [
    'stablecoin swap pools with vote-locked tokens',
    [
      '0x5f3b5dfeb7b28cdbd7faba78963ee202a494e2a2',
      '0xd533a949740bb3306d119cc777fa900ba034cd52',
      '0x72a19342e8f1838460ebfccef09f6585e32db86e',
      '0x4e3fbd56cd56c3e72c1403e103b45db9da5b9d2b',
    ],
  ],
  [
    'a DAO against the Iranian regime',
    ['0x81db04dfd741a765eae4696643c3bb558e7ac3b4', '0xe7a74474af2e28d921a15d1724ca66f55ae09119'],
  ],
  ['a venture fund run as a DAO', ['0x4570b4faf71e23942b8b9f934b47ccedf7540162']],
  [
    'the first grant DAO for Ethereum infrastructure',
    ['0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1'],
  ],
  [
    'NFT auction DAO for skateboarding and action sports',
    ['0x880fb3cf5c6cc2d7dfc13a993e839a9411200c17'],
  ],
  [
    'GPU compute network for AI',
    [
      'BZLbGTNCSFfoth2GYDtwr7e4imWzpR5jqcUuGEwr646K',
      'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',
      'nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7',
    ],
  ],
  [
    'the AI agents launchpad on Base',
    ['0x60a203ddcde45fbfb325bdeea93824b5726b4df8', '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b'],
  ],
  [
    'cross-chain messaging and bridges',
    [
      '0x6985884c4392d348587b19cb9eaaf157f13271cd',
      '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ',
      'DBRiDgJAMsM95moTzJs7M9LnkGErpbv9v6CUR1DXnUu5',
      '0xc5102fe9359fd9a28f877a67e36b0f050d81a3cc',
    ],
  ],
  [
    'money streaming protocol',
    [
      '0xa69f80524381275a7ffdb3ae01c54150644c8792',
      '0x3df8a6558073e973f4c3979138cca836c993e285',
      '0xac808840f02c47c05507f48165d2222ff28ef4e1',
    ],
  ],
  ["the US president's memecoin", ['6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN']],
  [
    'a community that decides with conviction voting',
    ['0x0b21081c6f8b1990f53fc76279cc41ba22d7afe2', '0x71850b7e9ee3f13ab46d67167341e4bdc905eef9'],
  ],
  [
    'a cooperative with a post-capitalist stablecoin',
    ['bread-treasury-signers', '0xa555d5344f6fb6c65da19e403cb4c1ec4a1a5ee3'],
  ],
  [
    'the DAO that governs the xDai chain',
    [
      'gnosis.eth-2026-selected-ballots',
      'gnosis.eth-gip-154-voters',
      'gnosisdao-documented-gnosis-safes',
      '0x9c58bacc331c9aa871afd802db6379a98e80cedb',
    ],
  ],
  ['la DAO que financia el marketing de NEAR', ['marketing.sputnik-dao.near']],
  ['comunidad de NEAR en África', ['near-africa-community-dao.sputnik-dao.near']],
  ['mulheres construindo no NEAR', ['she-is-near.sputnik-dao.near']],
];

/** A proposal asked for in other words: its map, and its title. */
const PROPOSAL_Q: [string, string, RegExp][] = [
  ['sponsoring a hackathon at Columbia university', 'marketing.sputnik-dao.near', /Columbia/],
  ['paying youtubers to promote NEAR', 'marketing.sputnik-dao.near', /youtubers/i],
  ['an invoice for a security audit', 'templar.sputnik-dao.near', /Audit part 1/],
  [
    'using protocol fees to buy back the exchange token',
    'ref-finance.sputnik-dao.near',
    /protocol fee.*purchasing ref back/i,
  ],
  ['should the guild hire lawyers', '0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6', /law firm/i],
  ['a branded desktop chat app', '0x0372f3696fa7dc99801f435fd6737e57818239f2', /Telegram desktop/i],
  ['a public audio chat about health', 'marketing.sputnik-dao.near', /Health Twitter space/i],
  ["a printed booklet for the women's community", 'she-is-near.sputnik-dao.near', /booklet/i],
  [
    'monthly money for an artists collective from Belarus',
    'creatives.sputnik-dao.near',
    /Belarus/i,
  ],
  [
    'a promo film for the Denver conference',
    'nearnftwg.sputnik-dao.near',
    /ETH Denver Marketing video/i,
  ],
  [
    'hiring someone to run the community',
    '0xb152b115c94275b54a3f0b08c1aa1d21f32a659a',
    /community manager/i,
  ],
  ['converting wrapped ether', 'ref-finance.sputnik-dao.near', /weth to refchef.*convertion/i],
];

/** Names, symbols and addresses as typed: words find these today, and must still put them first. */
const EXACT_Q: [string, string[]][] = [
  [
    'RaidGuild',
    ['0xf02fd4286917270cb94fbc13a0f4e1ed76f7e986', '0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6'],
  ],
  [
    'UNI',
    ['0x1f9840a85d5af5bf1d1762f925bdaddc4201f984', '0xc3de830ea07524a0761646a6a4e4be0e114a3c83'],
  ],
  ['0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6', ['0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6']],
  ['marketing.sputnik-dao.near', ['marketing.sputnik-dao.near']],
  [
    'Kokonut',
    ['0x8977c56e979f0d8b76afb5ad85549acd2e96422d', '0xc6b075ac3234a7ac729114b27370b552fa284690'],
  ],
  ['JTO', ['jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL']],
  [
    'House of Stake',
    [
      'near:mainnet:house-of-stake',
      'houseofstake.sputnik-dao.near',
      'houseofstake-ops.sputnik-dao.near',
      'hos-deposits.sputnik-dao.near',
    ],
  ],
  ['MetaCartel Ventures', ['0x4570b4faf71e23942b8b9f934b47ccedf7540162']],
];

// -- the documents

interface Said {
  value?: string;
}
interface Card {
  id: string;
  name: string | null;
  title: string;
  about: string;
  chain: string;
  address: string | null;
  mark: { name: Said | null; symbol: Said | null; type_words?: string[] } | null;
}
interface Proposal {
  id: string;
  title: string | null;
  kind: string | null;
  outcome: string | null;
  ref: string;
}

const cards = (JSON.parse(readFileSync(join(folder, 'maps.json'), 'utf8')) as { maps: Card[] })
  .maps;
const nameOf = new Map(cards.map((c) => [c.id, c.name ?? c.mark?.name?.value ?? c.title]));
const mapDocs: Findable[] = cards.map((c) => {
  const words = [
    c.name,
    c.title,
    c.mark?.name?.value,
    c.mark?.symbol?.value,
    ...(c.mark?.type_words ?? []),
    c.about,
    c.address,
    c.id,
  ].filter((w, i, all): w is string => !!w && all.indexOf(w) === i);
  const keys = [c.name, c.mark?.name?.value, c.mark?.symbol?.value, c.address, c.id].filter(
    (k): k is string => !!k,
  );
  return {
    kind: 'map',
    id: c.id,
    title: c.name ?? c.title,
    text: words.join('\n'),
    group: c.id,
    keys,
  };
});
const clean = (s: string) =>
  s
    .replaceAll(/\${2,}/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
const proposalDocs: Findable[] = [];
for (const f of readdirSync(join(folder, 'proposals'))) {
  const p = (
    JSON.parse(readFileSync(join(folder, 'proposals', f), 'utf8')) as {
      proposals: { about: string; proposals: Proposal[] };
    }
  ).proposals;
  for (const x of p.proposals) {
    const title = clean(x.title ?? '');
    if (!title) continue;
    proposalDocs.push({
      kind: 'proposal',
      id: x.ref,
      title,
      text: `${title}\n${[x.kind, x.outcome].filter(Boolean).join(', ')}\nproposal ${x.id} in ${nameOf.get(p.about) ?? p.about}`,
      about: p.about,
      group: p.about,
    });
  }
}
const brain = readBrain(join(import.meta.dirname, '..', 'brain'), null).index;
const brainDocs: Findable[] = brain.entries
  .filter((e) => e.kind !== 'doctrine')
  .map((e) => ({
    kind: e.kind,
    id: e.id,
    title: e.id.replaceAll('-', ' '),
    text: `${e.id.replaceAll('-', ' ')}: ${e.for}\n${e.recognise.join(', ')}`,
  }));

// -- scoring

type Way = 'today' | 'words' | 'meaning' | 'both' | 'reranked' | 'grouped' | 'grouped+rr';
const WAYS: Way[] = ['today', 'words', 'meaning', 'both', 'reranked', 'grouped', 'grouped+rr'];
type Tally = Record<Way, { at1: number; at3: number; at5: number; ms: number }>;
const tally = (): Tally =>
  Object.fromEntries(WAYS.map((w) => [w, { at1: 0, at3: 0, at5: 0, ms: 0 }])) as Tally;
const count = (t: Tally, way: Way, rank: number, ms: number) => {
  const x = t[way];
  if (rank === 1) x.at1++;
  if (rank && rank <= 3) x.at3++;
  if (rank && rank <= 5) x.at5++;
  x.ms += ms;
};

/** Today's map search (map.ts searchMap): every word of the question inside a card's words. */
function todaysMap(q: string): Findable[] {
  const words = q
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((w) => w.length > 1);
  return mapDocs.filter((d) => words.every((w) => d.text.toLowerCase().includes(w)));
}

async function ranked(set: SearchSet, q: string, way: Way): Promise<Findable[]> {
  if (way === 'today') throw new Error('today has its own');
  const grouped = way === 'grouped' || way === 'grouped+rr';
  const found = await find(set, q, model, {
    n: 10,
    ways: way === 'words' || way === 'meaning' ? way : 'both',
    rerank: way === 'reranked' || way === 'grouped+rr' ? 30 : 0,
    group: grouped,
    heads: Number(values.heads ?? 10),
  });
  // a group stands for its own document and what matched under it
  return found.map((f) => ({ ...f, under: [f, ...(f.matched ?? [])] }));
}

async function timed<T>(f: () => Promise<T>): Promise<[T, number]> {
  const t = performance.now();
  const r = await f();
  return [r, performance.now() - t];
}

const misses: string[] = [];
function rankOf(list: Findable[], ok: (d: Findable) => boolean) {
  const i = list.findIndex((d) => ((d as { under?: Findable[] }).under ?? [d]).some(ok));
  return i < 0 ? 0 : i + 1;
}

async function runBrain(name: string, qs: [string, string][], set: SearchSet) {
  const t = tally();
  for (const [q, want] of qs) {
    for (const way of WAYS) {
      const [list, ms] = await timed(async () =>
        way === 'today'
          ? routeBrain(brain, { words: q }, 10).map((r) => ({
              kind: r.kind,
              id: r.id,
              title: r.id,
              text: '',
            }))
          : ranked(set, q, way),
      );
      const r = rankOf(list, (d) => d.id === want);
      count(t, way, r, ms);
      if (values.show && r !== 1)
        misses.push(`${name} ${way}: "${q}" → ${want} at ${r || '-'}; first ${list[0]?.id}`);
    }
  }
  report(name, qs.length, t);
}

const endsWith = (id: string, wants: string[]) => wants.some((w) => id.endsWith(w));

async function runMaps(set: SearchSet) {
  const sets: [string, number, (way: Way) => Promise<Tally>][] = [];
  const mapT = tally();
  for (const [q, wants] of MAP_Q) {
    for (const way of WAYS) {
      const [list, ms] = await timed(async () =>
        way === 'today' ? todaysMap(q) : ranked(set, q, way),
      );
      const r = rankOf(list, (d) =>
        endsWith(d.kind === 'proposal' ? (d.about ?? '') : d.id, wants),
      );
      count(mapT, way, r, ms);
      if (values.show && r !== 1)
        misses.push(`map ${way}: "${q}" at ${r || '-'}; first ${list[0]?.title}`);
    }
  }
  report('map, without its name', MAP_Q.length, mapT);
  const propT = tally();
  for (const [q, map, title] of PROPOSAL_Q) {
    for (const way of WAYS) {
      const [list, ms] = await timed(async () =>
        way === 'today' ? todaysMap(q) : ranked(set, q, way),
      );
      const r = rankOf(
        list,
        (d) => d.kind === 'proposal' && (d.about ?? '').endsWith(map) && title.test(d.title),
      );
      count(propT, way, r, ms);
      if (values.show && r !== 1)
        misses.push(`proposal ${way}: "${q}" at ${r || '-'}; first ${list[0]?.title}`);
    }
  }
  report('a proposal, in other words', PROPOSAL_Q.length, propT);
  const exactT = tally();
  for (const [q, wants] of EXACT_Q) {
    for (const way of WAYS) {
      const [list, ms] = await timed(async () =>
        way === 'today' ? todaysMap(q) : ranked(set, q, way),
      );
      const r = rankOf(list, (d) => d.kind === 'map' && endsWith(d.id, wants));
      count(exactT, way, r, ms);
      if (values.show && r !== 1)
        misses.push(`exact ${way}: "${q}" at ${r || '-'}; first ${list[0]?.title}`);
    }
  }
  report('a name, symbol or address as typed', EXACT_Q.length, exactT);
  void sets;
}

function report(name: string, n: number, t: Tally) {
  console.log(`\n${name} (${n} questions): first / top 3 / top 5, and ms a question`);
  for (const w of WAYS) {
    const x = t[w];
    console.log(
      `  ${w.padEnd(11)} ${String(x.at1).padStart(3)} / ${String(x.at3).padStart(3)} / ${String(x.at5).padStart(3)}   ${Math.round(x.ms / n)} ms`,
    );
  }
}

if (values.only !== 'maps') {
  const [set, ms] = await timed(() => searchSet(brainDocs, model, keep));
  console.log(`brain: ${brainDocs.length} headers embedded in ${Math.round(ms)} ms`);
  await runBrain("the brain's own questions", BRAIN_TESTED, set);
  await runBrain('the brain, in new words', BRAIN_NEW, set);
}
if (values.only !== 'brain') {
  const docs = [...mapDocs, ...proposalDocs];
  const [set, ms] = await timed(() => searchSet(docs, model, keep));
  console.log(
    `\nmap: ${mapDocs.length} maps and ${proposalDocs.length} proposals embedded in ${Math.round(ms / 1000)} s`,
  );
  const [, again] = await timed(() => searchSet(docs, model, keep));
  console.log(`again, every vector kept: ${Math.round(again)} ms`);
  await runMaps(set);
}
if (values.show) console.log(`\n${misses.join('\n')}`);
