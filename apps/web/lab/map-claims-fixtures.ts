// Real claims from Petals' own mapping, for the lab only (GET /api/v1/maps/:id/claims bodies, 11 Nov, made from
// the mapping runs' files): two sourced notes and an inferred one about Marinade accounts, and a note about House
// of Stake as a record (JSON). Trimmed to a few, each as it came.
import type { Claim } from '@petal/core/types';

export const LAB_MAP_CLAIMS: Claim[] = [
  {
    petal: 'claim/v3',
    subject: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:CzxuuDLC5oAPtvcncpmL8WGHu76E838QLcCRTqVePXcT',
    verb: 'noted',
    object: {
      value:
        'Marinade VSR Monthly vesting deposit 3 in voter account 8J6o2qcFNgCLFDfr1iR7F9r2F6KnnSsrg1KBmgzfrX75: 180.171632247 MNDE remains deposited; initially locked 122877.053192130 MNDE; schedule start 659493, end 1792955493 Unix seconds; clawback flag false. These fields do not by themselves establish current claimability or withdrawal permission.',
    },
    issued_at: '2026-11-11T16:04:39.074Z',
    kind: 'sourced',
    as_of: {
      chain: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      block: 468182901,
    },
    evidence: [
      {
        type: 'page',
        url: 'https://explorer.solana.com/address/8J6o2qcFNgCLFDfr1iR7F9r2F6KnnSsrg1KBmgzfrX75',
        found_by: 'tool:codex-solana-wave@1',
        found_at: '2026-11-11T16:04:39.074Z',
        note: 'Finalized raw account plus VSR source layout archived in this research directory.',
      },
    ],
    by: 'tool:codex-solana-wave@1',
    id: '03525a16cdcbdb355c3fbf8d86217319b9bb35848e824f1630257860000c62ee',
  },
  {
    petal: 'claim/v3',
    subject: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:DuXfmjSn266UvCXsNXXWtKeFvDpU8yuxU88vyqBy7BX',
    verb: 'noted',
    object: {
      value:
        'Marinade VSR Monthly vesting deposit 22 in voter account E9yTqQRkbitoKKT5G7EuwPejywNGzZtvmCsjcB6vuQUz: 175.217879789 MNDE remains deposited; initially locked 119498.594015639 MNDE; schedule start 659988, end 1792955988 Unix seconds; clawback flag false. These fields do not by themselves establish current claimability or withdrawal permission.',
    },
    issued_at: '2026-11-11T16:04:39.074Z',
    kind: 'sourced',
    as_of: {
      chain: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      block: 468182901,
    },
    evidence: [
      {
        type: 'page',
        url: 'https://explorer.solana.com/address/E9yTqQRkbitoKKT5G7EuwPejywNGzZtvmCsjcB6vuQUz',
        found_by: 'tool:codex-solana-wave@1',
        found_at: '2026-11-11T16:04:39.074Z',
        note: 'Finalized raw account plus VSR source layout archived in this research directory.',
      },
    ],
    by: 'tool:codex-solana-wave@1',
    id: '0598ff81f0a0243aa7be0c993684cec1fc1a137c0ff25f1b514f9fc64de84988',
  },
  {
    petal: 'claim/v3',
    subject: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:8HVYKgq2PA4SCDuPZSfHBH1aupTBJYPVru6kq3UfuSX9',
    verb: 'noted',
    object: {
      value:
        'Retained council yes/no ballots: 8HVYKgq2PA4SCDuPZSfHBH1aupTBJYPVru6kq3UfuSX9 and BoYakS9dGZ2iA5SDYrXMpELpdPFkrur1XHgFytv8mErP agree on 43/43 shared proposals during [2023-04-14T10:58:56Z, 2025-01-20T13:44:26.500000Z) and 30/30 during [2025-01-20T13:44:26.500000Z, 2026-10-29T16:29:57Z). Threshold per period: at least 3 shared and 0.8 agreement; unweighted by tokens. Relinquished, abstention, veto, nonbinary and duplicate ballots excluded. Retained accounts only, not history census. This is co-voting, not coordination, common control, identity or proof of a distinct bloc. All shared comparable decisions in this sample were unanimous, so agreement does not distinguish this pair.',
    },
    issued_at: '2026-11-11T16:13:38.668429Z',
    kind: 'inferred',
    as_of: {
      chain: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      block: 468182652,
    },
    qualifiers: {
      grounds: 'research',
    },
    method: 'retained-ballot-pair-agreement@1',
    evidence: [
      {
        type: 'proposal',
        proposal:
          'proposal:solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:899YG3yk4F66ZgbNWLHriZHTXSKk9e1kvsKEquW7L6Mo:6gdEswRAgSDiiyZaXcBvKsy8GckZdK6MmehxNa6menwV',
        found_by: 'tool:codex-solana-wave@1',
        found_at: '2026-11-11T16:13:38.668429Z',
        note: 'Period 1; retained choices for/for; see raw/covoting-analysis.json.',
      },
      {
        type: 'proposal',
        proposal:
          'proposal:solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:899YG3yk4F66ZgbNWLHriZHTXSKk9e1kvsKEquW7L6Mo:9sfxMP6aaM6nWbeZRBRcCbLr1ssUSmzM3pNot2vEH2qn',
        found_by: 'tool:codex-solana-wave@1',
        found_at: '2026-11-11T16:13:38.668429Z',
        note: 'Period 1; retained choices for/for; see raw/covoting-analysis.json.',
      },
    ],
    by: 'tool:codex-solana-wave@1',
    id: '12f7e3d719d634da560df39b1d9693accf61711b8466a41f5eb069d1a67b7661',
  },
  {
    petal: 'claim/v3',
    subject: 'near:mainnet:hos-root.sputnik-dao.near',
    verb: 'noted',
    object: {
      value:
        '{"type":"valuation-scope","asset":"NEAR","meaning":"Known-amount price estimate only. Overlapping measures are not additive. Unknown liabilities, other assets, restrictions and liquidity prevent a treasury NAV or spendable-budget claim.","pricing_time":"2026-11-11T16:00:31.435Z","balance_time":"2026-11-11T16:01:38.934Z","multi_asset_values":"Additional known FT valuations are evidence-only under valuations; schema defines onevaluepermap."}',
    },
    issued_at: '2026-11-11T16:25:18.790Z',
    kind: 'sourced',
    evidence: [
      {
        type: 'snapshot',
        url: 'https://rpc.mainnet.fastnear.com',
        note: 'Snapshot and original query receipts in this dataset; source block and coverage retained.',
        found_by: 'tool:dao-set-near-direct@2026-11-11',
        found_at: '2026-11-11T16:25:18.790Z',
        retrieved_at: '2026-11-11T16:25:18.790Z',
        snapshot_sha256: 'c5886eada7620289990d2cc08ce5c25fabccd002af9000fce2cc9f804301279d',
      },
    ],
    by: 'tool:dao-set-near-direct@2026-11-11',
    id: '10b99c2b0064dfa1ca47d0a7bb7839a66702d1561f061bfbf5a5818ff9b0b79b',
  },
] as Claim[];

/** Those accounts' petals as a reading names them: their short addresses (none of them is named). */
export const LAB_CLAIM_NAMES = new Map<string, string>([
  [
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:CzxuuDLC5oAPtvcncpmL8WGHu76E838QLcCRTqVePXcT',
    'CzxuuD…XcT',
  ],
  [
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:DuXfmjSn266UvCXsNXXWtKeFvDpU8yuxU88vyqBy7BX',
    'DuXfmj…y7BX',
  ],
  [
    'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:8HVYKgq2PA4SCDuPZSfHBH1aupTBJYPVru6kq3UfuSX9',
    '8HVYKg…uSX9',
  ],
  ['near:mainnet:hos-root.sputnik-dao.near', 'hos-ro…near'],
]);
