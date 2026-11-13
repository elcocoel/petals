# Q1 research: the database

**Created**: 2026-11-08
**Status**: Research, for a choice. Nothing is built or decided here.
**Question** (`spec.md`, Q1): SQLite on one server, or Postgres? What does "permanent" need: backups, copies, a second machine? What changes in our code either way?
**Judged against**:
- TGT-010: what a person makes survives restarts, a move to another host, and the loss of a disk.
- TGT-001: one account with many proven links.
- Stories 6 and 7: claims and challenges, with their history.

## The short answer

**Lean: keep SQLite on the server, make it permanent by copying every change off this machine as it happens, and rewrite our code now so it would work on Postgres too.** Then moving to Postgres later, Supabase or any other, is a contained step and not a rewrite. That follows the earlier sketch, SQLite here, written as if it were a Postgres that could live in Supabase, with the missing piece named: the copies.

Either engine can be permanent, and either can hold one account with many links, or claims with their history. What really decides between them is:
- **where the copies live**, since without copies elsewhere neither is permanent;
- **who looks after the database**: us, or a provider;
- **whether Petals will need more than one server writing at once.** It doesn't for now.

## 1. What the database is for, in Petals

The database is the server's memory of everything that's private, or that exists nowhere else. It isn't where the public map lives: that's on NEAR.

| What | Where it lives | If the server lost it |
|---|---|---|
| Accounts, and their proven links (wallets now, social accounts later) | Only in the database | **Lost for good.** People couldn't reach their work |
| Workspaces: conversations, steps, notes, followed addresses, and the search over them | Only in the database | **Lost for good** |
| Readings people's agents posted (snapshot files) | Files beside the database | Lost, unless copied. They never change once written, so they're easy to copy |
| Sessions and sign-in challenges | The database | Harmless: people sign in again |
| Published flowers, and public claims (Q4) | On NEAR | Nothing lost. The chain keeps them, and anyone can check them without Petals (TGT-011) |
| The server's index of flowers and claims | The database | Rebuildable from the chain |

**Permanence is mostly about the first three rows.** Claims and flowers are permanent because they're on chain. The database only keeps an index of them, which can be rebuilt.

**One more thing must survive, and it isn't in the database: the key that seals wallet addresses.**
- **What it does:** today each linked wallet is stored scrambled under a key (`PETAL_WALLET_KEY`), and it's found by a fingerprint made with the same key.
- **If the key is lost:** a perfect copy of the database still can't tell which wallet belongs to which account. Nobody could sign in to their old work.
- **If the key and the copies sit in the same place:** whoever takes the copies can read the wallets.
- **So:** keep the key apart from the copies, for example in the operator's password manager. This holds whichever engine is chosen.

## 2. What "permanent" asks, in plain words

TGT-010 names three events. I add a fourth, because it happens more often than the other three.

1. **A restart.** The program stops and starts again. Anything written to disk survives. Both engines already pass this today.
2. **A move to another host.** Petals' server moves from the current host to a VPS or another machine. The data has to go with it, or already be somewhere the new host can reach.
3. **The loss of a disk.** The disk dies, the machine is stolen, or the building floods. Only a copy somewhere else saves the data. **A copy on a drive plugged into the same machine covers a dead internal disk, but not a lost machine.**
4. **A mistake.** A bug or a bad change deletes or damages records. A copy that's updated every second copies the damage too. The fix is copies that can go back to a moment before the mistake ("point-in-time restore").

**And one rule for all of them: a copy counts only once a restore from it has been tried.** That means a test that restores onto an empty server and compares the two.

## 3. Today

- **The engine:** SQLite, a database that's a single file (`private.db`) inside the server's data folder. The server opens it directly, as a library. No separate program and no network are involved.
- **What it holds:** 23 tables, one of which is a search index. The only features Postgres doesn't share are that search index (SQLite's FTS5) and a few settings the store uses when it opens the file.
- **How the code uses it:** the store is synchronous. When code asks the database something, it waits for the answer right there, before doing anything else. That's normal and fast when the database is a file next to the program. A search finds about 180 places in 8 files where code calls the store, and 17 test files use it.
- **Copies:**
  - **The script:** a backup script copies the data folder to an external drive and keeps the last 14 copies.
  - **How often:** it runs by hand. Its nightly job is off.
  - **What it doesn't cover:** the copies aren't encrypted, and they never leave the host.
  - **Where that leaves us:** today Petals passes event 1, half of event 3 (a dead internal disk, losing up to a day), and none of event 2 without a manual copy.

## 4. The options

### Option A. SQLite on the server, copied off the machine as it changes

**What it is.** The engine stays as it is. A small open-source program, Litestream, runs beside the server and sends every change to storage somewhere else within about a second. It also keeps older points, so the database can be restored as it was at an earlier moment. The server never notices: it's the same file, used the same way.

**What it needs to be permanent:**
- **Copies:** Litestream sends to "object storage", a place that holds files on the internet, or to another machine the operator owns. See choice D2.
  - **The container:** it has to run inside the server's container, because that's where the file's locks live. It can start the server itself, so the two run together.
- **Restore:**
  - **On a new host or after a lost disk:** when the server starts with an empty data folder, it restores the latest copy first, then begins.
  - **After a mistake:** a restore to a chosen time.
- **The posted readings:** the snapshot files don't go through the database, so they need copying too, to the same place. They never change after they're written, so a plain sync tool does it.
- **The key:** kept apart (section 1).
- **A restore test.**

**What changes in our code.** Nothing in how the store works. What changes is around it:
- the program added to the container;
- the restore when the server starts;
- the copy of the snapshot files;
- the restore test;
- the backup script becomes the occasional extra copy, or goes.

The store stays synchronous unless D3 chooses otherwise.

**How it meets the four events:**
- **A restart:** yes.
- **A move to another host:** restore on the new host. The copy is about a second behind.
- **A lost disk:** the last second or so is lost.
- **A mistake:** a restore to a moment before it, within however long the old points are kept.

**What it closes, and what it keeps open:**
- **Closes:** one server writes at a time. Two Petals servers writing the same data at once isn't possible with SQLite. Petals doesn't need that now: one server serves a hackathon and well beyond. It's the clearest sign it's time to move.
- **Keeps open:**
  - a move to Postgres later, whenever it's wanted;
  - a move to another host, by restoring from the copy.

**Risks:**
- **Something to watch:** the copy process is one more thing that has to keep running.
- **A dead copier goes unseen:** if it stops, the server keeps working while the copies quietly fall behind.
- **So:** this needs a check that says when the newest copy is too old.

### Option B. Postgres, run by us beside the server

**What it is.** Postgres is a database that runs as its own program, a "database server". Our server talks to it over a connection, like a website talks to a server. Here it would run in a second container on the same machine.

**What it needs to be permanent.** Exactly what SQLite needs: Postgres on the same disk dies with that disk. So it needs:
- **a continuous copy off the machine**, using Postgres' own tools for this (WAL archiving, with WAL-G or pgBackRest);
- **a restore on a new host, and a restore test**;
- **the snapshot files copied**, and **the key kept apart**.

Postgres alone doesn't make anything more permanent.

**What changes in our code:**
- **The store is rewritten** for a Postgres driver.
- **Every call to it becomes asynchronous** (section 5).
- **The SQL changes in small ways:** placeholders are written `$1` instead of `?`. Search moves from SQLite's FTS5 to Postgres' own full-text search. The table definitions are retyped for Postgres.
- **Tests:** they need a Postgres. PGlite, Postgres compiled to run inside Node, can do that with no server to start.
- **Operations:** a second container to run and upgrade, with a password to keep.

**How it meets the four events:** the same as Option A, through Postgres' own copy tools.

**What it closes, and what it keeps open:**
- **Opens:** several Petals servers at once, and Postgres' tools and extensions.
- **Closes:** some simplicity. There are two programs to keep running instead of one, and a database that can be unreachable while the server is up.

**Against Option A for Petals now:** there's more to run, and permanence doesn't get better.

### Option C. Postgres, run for us by a provider (Supabase)

**What it is.** The same Postgres, but Supabase runs it on their machines and keeps the disks and copies. Our server connects to it over the internet.

**What it needs to be permanent:**
- **The provider's own copies.**
  - **On the free plan, there are none.** Several sources say Supabase's free plan has no automatic backups, and that a free project pauses after about a week without use.
  - **On the paid plan,** there are daily backups, kept for 7 days. Point-in-time restore costs extra.
  - **To check:** these figures come from third-party pages, so they need confirming on Supabase's own pricing page.
- **The snapshot files** move to their file storage, or stay with us and are copied.
- **The key** is kept apart, as always.

**What changes in our code:**
- **The same as Option B,** without running Postgres ourselves.
- **Every query crosses the internet,** from the host or the VPS to Supabase's machines. Our pages make many small queries, so they'd get slower unless the queries are grouped.
- **A new secret:** the database's connection string lives on the server.

**How it meets the four events:**
- **A restart:** yes.
- **A move to another host:** nothing to move. The new server just connects.
- **A lost disk on our side:** no database lost, only the posted readings if they stayed with us.
- **A lost disk at Supabase, or a mistake:** only as good as the plan's backups.

**What it closes, and what it keeps open:**
- **Opens:**
  - a server that holds almost nothing, which suits "move to any host" (TGT-040) and "nothing to steal" (TGT-041);
  - Supabase's extras for later, such as pushing changes to browsers.
- **Closes:**
  - running with no outside service;
  - $0, if the paid plan is needed for real backups;
  - keeping people's private data on machines we run.
- **What to say plainly:** SYS-025 asks us to say plainly that the operator could read private data, and here the operator includes Supabase. The wallets would still be sealed, under a key Supabase doesn't have.

### Others I looked at

- **Hosted SQLite services** (Turso, for example): another outside service, and asynchronous too.
- **SQLite replicated across machines** (LiteFS): built around Fly.io's way of running servers.

Neither gives Petals more than Option A or C.

## 5. The synchronous store, whichever option

**What it means.** Today, when our code asks the store something, it stops and waits for the answer. That's fine with SQLite, which answers in microseconds from a file next to it. Every Postgres driver works differently: code asks, carries on with other work, and picks up the answer when it arrives, because the answer comes over a connection. Code written the first way can't simply be pointed at Postgres.

**What changes to make the store asynchronous:**
- **The store's interface:** every one of its functions answers later instead of at once.
- **The places that call it:** about 180, in 8 files, by a rough search. Mostly they get the word `await`.
- **The session check:** "who is this?" is synchronous inside the request pipeline today, and it becomes asynchronous too.
- **Transactions:** "do these writes together or not at all". On one SQLite file, two requests must not mix inside one transaction, so the store queues them.
- **The 17 test files that use the store.**

**What it buys:**
- **The SQL Petals uses would work on both engines,** once the remaining SQLite-only parts have a Postgres twin: search and the opening settings.
- **The tests can run against both:** SQLite as today, and Postgres in process through PGlite. That proves the claim "written as if it were Postgres" instead of hoping it.

**When:**
- **Option A:** it's optional, and could happen now or at the move.
- **Options B and C:** it's required first.
- **The longer it waits,** the more places call the store synchronously.

## 6. The needs, side by side

| Need | A. SQLite with copies | B. Our own Postgres | C. Supabase |
|---|---|---|---|
| Survives a restart | Yes | Yes | Yes |
| Survives a move to another host | Restore on the new host | Restore on the new host | Nothing to move |
| Survives a lost disk | Yes, the copy is about a second behind | Yes, through Postgres' copy tools | Only as good as the plan's backups: none on the free plan, by third-party sources |
| Undoes a mistake | Yes, to an earlier moment | Yes, with archiving | A paid add-on |
| One account, many links (TGT-001) | Yes. A table of links, each wallet or social account unique to one account | The same | The same |
| Claims and challenges with history | Yes. Rows are only ever added, and a guard refuses edits and deletes | The same, and Postgres can also refuse edits through permissions | The same |
| Several servers at once | No | Yes | Yes |
| New things to run | One small copier | A database server and its copier | Nothing, but an outside service |
| Money | $0, depending on where the copies go | $0, depending on where the copies go | $0 without backups. A paid plan for real ones |
| Our code's store | Unchanged, or asynchronous (D3) | Rewritten, asynchronous | Rewritten, asynchronous |

**The accounts-and-links shape and the claims-with-history shape don't favour either engine.**
- **A link** is a row: its account, its kind (wallet or social), its chain or site, its address or handle, how it was proven and when, and whether it's public. Each wallet or social account can belong to only one account, and both engines enforce that the same way.
- **A claim** is never changed. A retraction or a challenge is a new row pointing at the old one, and both engines can refuse an edit or a delete.

Most claims will live on chain anyway (Q4), so the database keeps an index of them that can be rebuilt.

## 7. The choices

| # | Choice | Options | Lean |
|---|---|---|---|
| D1 | The engine | A. SQLite with copies · B. our own Postgres · C. Supabase | **A for now.** C later, when a second server or a provider's care is wanted |
| D2 | Where the copies go: the database, the posted readings, and their older points | Cloudflare's file storage (R2; it has a free tier, but it's an outside service) · another machine the operator owns · Supabase's file storage · an external drive (covers a dead internal disk only, not a lost host) | **Off this machine. Cloudflare R2**, if one outside service for copies is acceptable. Otherwise another machine the operator owns. Either way encrypted, and the external drive stays as an extra |
| D3 | Make the store asynchronous now, or at the move | Now · at the move | **Now**, with tests against PGlite, so "written as if it were Postgres" is proven |
| D4 | Where the key that seals wallets is kept | Only on the server · also in the operator's password manager | **Also in the password manager**, never beside the copies |
| D5 | How long older points are kept, for undoing mistakes | Days · weeks | **A few weeks.** It costs a little storage |

## 8. Why this lean

1. **It meets TGT-010 fully,** once the copies leave the machine and a restore has been tried. The other options don't do better on permanence: Postgres on our own machine needs the same copies, and Supabase's free plan has none.
2. **It changes the least that's working,** and it adds one small program instead of a database server or an outside database.
3. **It costs $0,** and the copies can go wherever is chosen.
4. **It doesn't close the door.** With the store asynchronous and tested against Postgres, the move to Supabase stays a contained step for whenever it's wanted.
5. **It matches the earlier sketch:** SQLite here, written as if it were Postgres.

**What would change the lean:**
- **Two servers at once,** for example the website's own functions writing to the database directly, or a second region. That needs Postgres, and C is the way to it.
- **No machine of ours to run anything on,** with the server also gone to a provider. Then C.

## What I checked, and what I didn't

- **In our code** (main `e8cb7f3`), I read:
  - the store's tables and how it opens the file;
  - the synchronous session check;
  - how wallets are sealed and found;
  - the backup script.

  The count of about 180 store calls comes from a search, not a careful tally.
- **Litestream:** how it works, its destinations and its point-in-time restore. From its own site and other summaries: [How it works](https://litestream.io/how-it-works/), [Litestream revamped](https://fly.io/blog/litestream-revamped.md).
  - **Still to check:** whether its current version encrypts copies itself. If not, the destination does it.
- **Supabase's free and paid plans:**
  - **What the sources say:** no backups on the free plan, pausing after a week without use, and 7-day daily backups on the paid plan.
  - **Where that comes from:** third-party pages, for example [CostBench](https://costbench.com/software/database-as-service/supabase/free-plan/) and [DEV Community](https://dev.to/mahdi_benrhouma_fe1c6005/supabase-free-tier-limits-in-2026-what-you-actually-get-and-when-you-will-hit-them-4mhe).
  - **Still to check:** Supabase's own pricing page, before choosing C.
- **Not measured:** how much slower pages get when every query goes to Supabase over the internet.
