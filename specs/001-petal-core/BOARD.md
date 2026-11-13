# 🌸 Petal board

One page to keep the overview. Detail lives in [tasks.md](./tasks.md) (173 tasks) and [plan.md](./plan.md). Tick a milestone here when its "done when" line is true.

Milestones, not days. If one takes a night, so be it. Only two dates are fixed: **freeze 12 Nov**, **submit 13 Nov**.

## The path

```
🌰 M0 ──▶ 🌱 M1 ──▶ 🌷 M2 ══ skeleton proven and reviewed ══
                                   │
                            🌿 M3 core path
                                   │
                     ┌─────────────┴─────────────┐
               💬 M4 talk to change      📜 M5 publish in full
                     └─────────────┬─────────────┘
                            💐 M6 hero set + beauty pass
                                   │
             ┌─────────────────────┼─────────────────────┐
       🔗 M7 fusions         🕰️ M8 two dates        📤 M9 share
             └─────────────────────┼─────────────────────┘
                            🚀 M-Ship  ❄️ freeze 12 Nov · 📮 submit 13 Nov
```

## Milestones

| | Milestone | Tasks | Done when |
|---|---|---|---|
| [ ] 🌰 | **M0 Seed** · foundation (lead) | T001–T023 | `scripts/check.sh` passes; validators fixture imported; contracts frozen at `packages/v1` |
| [ ] 🌱 | **M1 Sprout** · parts in parallel | T024–T070 | each part passes its own tests on fakes; `pnpm petal render near-validators` draws; `/make` answers and draws |
| [ ] 🌷 | **M2 Bud** · skeleton proven | T071–T075 | quickstart passes live once; `pnpm test:e2e` green; **the skeleton is reviewed** |
| [ ] 🗣️ | **M-Talk** · the agent finds things out (next) | T164–T169 | a person names a network in plain words, the agent finds it or asks; follow-ups keep the thread; different agents connect |
| [ ] 🌿 | **M3 Stem** · core path (US1) | T076–T090 | a DAO nobody prepared renders live, with a cited interpretation |
| [ ] 💬 | **M4** · talk to change (US2) | T091–T097 | one plain request redraws a labelled variation; the default is unchanged |
| [ ] 📜 | **M5** · publish in full (US7) | T098–T107 | a direct write and an agent-key write both show the maker as author |
| [ ] 💐 | **M6 Bloom** · hero set (US3) | T108–T118 | ~5 hero flowers from 4 kinds of system, same scale; the UI notes applied |
| [ ] 🔗 | **M7** · fusions (US4) | T119–T123 | a known cluster fuses, with its evidence; look-alikes don't |
| [ ] 🕰️ | **M8** · two dates (US5) | T124–T131 | two dates side by side, with what changed and a pivotal moment |
| [ ] 📤 | **M9** · share (US6) | T132–T134 | a shared link opens the identical flower in a fresh browser |
| [ ] 🧩 | **M-Modules** · Ethereum and Solana data | T156–T161 | one schema-valid data set per module, keyless, drawn by the CLI |
| [ ] 🚀 | **M-Ship** · README, demo, submit | T135–T155 | frozen 12 Nov; judge path passes from a clean clone; submitted 13 Nov |

**If behind at the freeze, cut from the end:** stretch → T131, T130 → M9 extras → M8 → M7. **Never cut** M3, M5's publish path, M6, the README.

## The skeleton, in one line

Gallery → chat with Petal's agent (NEAR AI Cloud, signed answers) → tools count and validate → the same SVG every time → maker signs once (NEP-413) → flower lands on the shared map (FastData, testnet) → same spec from Claude Code with the skill → a dry NEAR Intents quote.

## M1 workstreams (one agent each, own worktree, own folder)

| Round | Workstream | Folder | Tasks | Starts on |
|---|---|---|---|---|
| 1 | 🧮 W1 Core | `packages/core` | T024–T032 | frozen contracts, fixture |
| 1 | 📥 W2 Inputs | `packages/inputs` | T033–T037 | fixture, `fakeMap()` |
| 1 | 🔐 W3 NEAR | `packages/near` | T038–T042, T044 | fakes; testnet (T043) for live |
| 2 | 🧰 W4 Tools | `packages/tools` | T045–T053 | stubs |
| 2 | 🤖 W5 Agent | `packages/agent` | T054–T061 | `recordedClient`; key (T059) for live |
| 2 | 🖼️ W6 Web | `apps/web` | T062–T067 | API mock |
| 2 | 🚪 W7 Doors | `skill/`, `apps/cli` | T068–T070 | `prompt.md`, registry |
| 3 | 🧵 W8 Lead | `tests/e2e` | T071–T075 | everything above |

Round 2 may start as soon as the contracts freeze (T023). Merge W1 → W8 in order, `scripts/check.sh` after each.

**Critical path:** foundation → schemas and hashes → fixture → freeze → petals → spec → renderer → registry → HTTP → agent → `petalApp` → e2e → live run → review.

## Five doors, one toolbox

| Door | Who it's for | Built in |
|---|---|---|
| HTTP API | our web app, anything with a URL | M1 (T052) |
| Agent Skill | people who bring their own agent; NEAR's own format | M1 (T068) |
| MCP server | Claude Desktop, ChatGPT, Cursor | M1 (T051) |
| CLI | judges ("do X, see Y"), re-runnable evidence | M1 (T070) |
| IronClaw package | NEAR's own agent; a cheap bonus, never critical | M-Ship (T135) |

Why: see plan.md, "Doors".

## 🙋 Gates

| When | What | Task |
|---|---|---|
| **now** | review the task list and the publication boundary; confirm relayed publish (C4) and the skeleton-first exception (C1) | T001 |
| before M1 ends | NEAR AI Cloud key in `/path/to/keys/near-ai.env` | T059 |
| before M2 | testnet `petals.testnet` + `petals-writer.testnet`, a limited writer key, testnet signing allowed | T043 |
| end of M2 | sign the first publish in a wallet; review the skeleton | T073, T075 |
| M5 | approve a maker write and an agent key in a wallet | T107 |
| M6 | confirm the hero set; the beauty review | T108, T117 |
| any time | Envio token (a fallback, not a blocker) | T161 |
| M-Ship | host; demo video; `petals.near`; submission facts | T136, T145, T147, T148 |

**Always confirmed at the time** (🔒): push · make public · deploy · post on X · any mainnet spend · send the submission.

## House rules

- Nothing public, signed or spent without confirmation.
- No UI polish before M6. UI comments wait until then.
- Agents never read raw data dumps; tools summarise.
- Every session ends green: `scripts/check.sh` and `pnpm test:e2e`.
- Contracts change only through the lead, with a version bump.
