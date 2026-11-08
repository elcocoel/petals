# Research: the website and its server

**Created**: 2026-11-08
**Status**: For Elco to read and choose. Nothing here is built. Each choice has a lean, and nothing is decided until Elco says go.
**Feeds**: `spec.md`, Story 7 and SYS-080 to SYS-087; `contracts/site-server.md`; `open-questions.md`, rows 40 to 49.

Elco, 8 Nov: these are requests to define, educate, weigh trade-offs, then build. Elco's architecture, as given:

- **The website** on Vercel.
- **The server** in a container. It runs on this Mac for now, but it's built as if it were a VPS, as Fire was.
- **SQLite** on the server, written as if it were a Postgres that could live in Supabase.
- **NEAR storage** for whatever can be held there.
- **Sign-in** by connecting a wallet. Multichain later, with NEAR Intents.

This file is about the seam between the first two: what crosses it, and how.

## 1. Today, in one picture

Today the website and the server are **one program**: one Next.js app (`apps/web`) in one container on this Mac.

```
 browser ──┐                               ┌── SQLite (private.db), snapshot files
           ├──> one Next.js app on :3090 ──┤
 an agent ─┘   pages + /api/v1 + /mcp      └── the live hub (in memory)
               + /skill.md + /petal.mjs
               + /d and /s short links
```

What that means in the code, counted on main `b589610`:

- **The API runs inside the page server.** `/api/[[...route]]` hands every API call to the Hono app from `@petal/agent`, in the same process.
- **Three pages read data while they're built on the server**: `/f/[id]`, `/gallery` and `/publish/[draft]`. They all go through one function, `apps/web/lib/api.ts`, which calls the API in process. The publish page also hands over the visitor's cookie.
- **Everything else reads from the browser**: 14 files call `/api/v1/...` on the same address.
- **Sign-in** puts a session in a cookie named `__Host-petal_session`. It's HttpOnly, Secure and SameSite=Lax. `__Host-` means it belongs to exactly one address and can't be shared with any other. A sign-in POST from any other origin is refused. The cookie's name and the origin it trusts both come from one setting, `PETAL_API`.
- **Live updates** are a server-sent event stream, `/api/v1/explorations/:ref/live`. It sends "something changed" and the page reads again. It sends no heartbeat. When the stream drops, the browser reconnects, the first event says "changed", and the page catches up. The hub that knows about changes lives in the server's memory, so whoever writes and whoever listens must reach the same process.
- **A standalone API server already exists**: `packages/agent/src/serve.ts`, the Hono app on Node. But it reads only a few settings: not `PETAL_PUBLIC`, the map, the state folder or the address rules the web app uses.
- **The store** is Node's built-in SQLite. It's synchronous, with 23 tables, one of them an FTS5 search index. The previous SYSTEMS counted about 89 synchronous store calls across 9 files on 8 Nov. I didn't re-measure that.

## 2. The picture this proposes (the leans together)

```
                 petals.elementarycomplexity.dev  (Vercel)
 browser ──────> pages: built and served by Vercel
 an agent ─────> /api/*, /mcp, /skill.md, /petal.mjs, /d/*, /s/*
                     │  forwarded by Vercel ("rewrite"), with the site's key
                     ▼
                 server name, through the Cloudflare tunnel
                     ▼
                 the container on this Mac: the server
                 SQLite, snapshot files, the live hub, the wallet-sealing key
```

**One address for people and agents. Vercel shows the pages and forwards everything else to the server.** Only Vercel knows the server's own name, and the server refuses anything that doesn't carry the site's key.

## 3. The choices

Each choice says what it means, what each option does, my lean and why, and what it changes in size.

### C1. One address or two?

What it means: does a person, or their agent, ever see a second address for the server?

- **One address** (`petals.elementarycomplexity.dev`). Vercel forwards the server's paths to the server.
  - **Cookies:** the browser only ever talks to one address, so the session cookie stays exactly as built: `__Host-`, tied to that one address, sent only to it.
  - **Sign-in:** the same-origin check stays as it is, with no cross-site cookie rules.
  - **Agents:** they get one address. The skill, the copied prompt and `/petal.mjs` already carry one.
  - **Links:** a flower link, a short link and a continue link all keep their shape.
  - **Cost:** every API call makes one more hop (browser → Vercel → Cloudflare → this Mac), probably tens of milliseconds. Vercel sees all the traffic, but it does anyway for the pages. If Vercel is down, agents can't reach the server either.
- **Two addresses** (`petals.…` for pages, `api.petals.…` for the server). The browser and agents call the server directly.
  - **Cookies:** the two addresses share a parent domain, so browsers treat them as the same site and send cookies, with no third-party blocking. But the cookie has a decision of its own:
    - Kept as `__Host-` on the API address, the website's own server never sees it. Pages that need the person, like the publish page, must then load in the browser.
    - Shared across both addresses (a `Domain=` cookie, so `__Secure-` instead of `__Host-`), it reaches Vercel's page functions on every request too.
  - **Code:** the server must allow the website's origin to send cookies (CORS with credentials), which today's session routes deliberately refuse. Every browser call must ask to send cookies.
  - **Agents and links:** agents get the server's address, so the skill and the prompt carry two addresses. Link-building must know which links are pages and which are the server.
  - **Gain:** no Vercel hop and no Vercel limit on the API or the streams.
- **Lean: one address.** It keeps sign-in, links and the skill exactly as built, and gives a person and their agent one thing to remember. It holds as long as the spike in section 5 shows Vercel forwards a stream and a 2 MiB upload. Two addresses cost about 3 to 4 hours more, because of CORS, the cookie's scope and links.

### C2. How does Vercel forward to the server?

- **A rewrite in the site's config** (`next.config` rewrites, before the site's own routes). Vercel's routing layer forwards the request and no function runs. As far as I know that's the cheapest and fastest, and Set-Cookie passes back through.
- **A small function that forwards.** One runs for every call, and it stays open for as long as a stream does. That costs function time, and it hits function time limits on a long stream.
- **Lean: the rewrite.** One unknown: Vercel's docs don't say how long it holds a stream open through a rewrite to an outside server, and I couldn't find out. The spike measures it.

### C3. What does the container run?

- **Today's whole app, unchanged** (pages and API, `next start`). Vercel shows the pages, and the container's copy of the pages just isn't pointed at. Page paths on the server's own name send people to the website. This is the smallest first step: the container changes only by the key and the heartbeat (section 4).
- **The API alone** (`serve.ts`, made complete). That means moving `/mcp`, `/skill.md`, `/petal.mjs`, `/d` and `/s` from the web app into the Hono app, and giving `serve.ts` the full settings reader. The image gets smaller and holds no page code: cleaner, and closer to "built as if it were a VPS". About 4 to 6 hours more.
- **Lean: the whole app first, the API alone as its own later step.** One step at a time, and each step can be tested by itself. Both run in the same container, on the same data, with the same settings from the environment.

### C4. How does the server know who a visitor is, for limits?

Each visitor has limits per address: 60 tool calls a minute, and the daily caps. Behind Vercel, every request reaches the server from Vercel's own addresses, so all visitors would look like a few addresses and share one limit. Vercel passes the visitor's real address in a header, but anyone who reaches the server's name directly could fake that header.

- **A site key.** A small piece of Vercel's routing ("middleware") adds two headers to each forwarded request: the visitor's address and a secret shared by the site and the server. The server believes the address only when the key is right.
  - It can also **refuse every request without the key**, health aside. Then the server's name is useless to anyone but Vercel, which shrinks what's open to the internet.
  - Cost: the middleware runs on each forwarded call. It's cheap, but it counts against Vercel's plan. I haven't measured those limits.
- **Limits by session instead of address.** No key is needed, but a visitor with no session (an agent's first call) has nothing to limit by.
- **Lock the server's name to Vercel's addresses.** Vercel's outgoing addresses aren't fixed on the free plan, so this can't be done.
- **Lean: the site key, and the server refuses calls without it.** About 2 hours. The key lives in Vercel's settings and the server's secrets folder, and it's rotated if it leaks.

### C5. Live updates across them

The live hub stays on the server: the website holds no state, so it can't hold the hub.

- **The stream through the rewrite**, with a heartbeat every 25 seconds so an idle forwarder doesn't cut it. The page already catches up after a drop. Code: one small change, about 30 minutes, because `/live` sends no heartbeat today.
- **Long-polling.** The page asks "anything new?", and the server answers when something changes or after 25 seconds. That works through any forwarder, with one more request every 25 seconds per open page. About 2 hours.
- **The stream straight to the server's name.** The page would need a cookie there, which is C1's two-address problem, and it would skip the site key.
- **Lean: the stream through the rewrite, with a heartbeat. If the spike shows Vercel cuts streams, long-polling.**
- **Later, not now:** with more than one server, the hub would need a shared bus. Postgres has one (LISTEN/NOTIFY), which fits "as if it were Postgres".

### C6. Pages built on Vercel's side

The three pages that read data while being built (`/f/[id]`, `/gallery`, `/publish/[draft]`) can't call the API in process any more.

- **Fetch the server over HTTP**, with the site key and the visitor's address. The publish page passes the visitor's cookie on, as it does today in process. With one address (C1), the cookie reaches Vercel's page function, because it's the same address. One function changes, `lib/api.ts`. About an hour.
- **Build those pages in the browser instead.** Then no page code on Vercel touches the server, but a flower link loses its server-built page, and so its preview when shared.
- **Lean: fetch over HTTP.** It's one function, and the pages stay as they are.

### C7. Where do `skill.md` and `petal.mjs` come from?

- **The server, forwarded at the one address.** The file and the skill then always match the API version they talk to, and they carry the site's address, as today.
- **Vercel, built at deploy time.** That's faster to download, but the site and the server can be deployed apart and drift.
- **Lean: the server.**

### C8. SQLite written as if it were Postgres

This doesn't change the seam, since only the server touches the database. It's here because Elco named it.

- **What's already portable:** the store sits behind interfaces that don't name an engine (SYS-002). The SQL mostly uses what Postgres also runs: `ON CONFLICT … DO UPDATE` and ISO dates as text.
- **What isn't portable:**
  - The store is **synchronous**, while every Postgres client is asynchronous. Making it async touches about 89 calls in 9 files, and their tests.
  - **Search uses SQLite's FTS5**, where Postgres would use its own full-text search.
- **Options:** make the store async now, still on SQLite, about a day. Or write new SQL in the portable subset and convert when a second home is real.
- **Lean: after the split, as its own step.** New SQL stays portable from now on.

### C9. The server's own name, and the tunnel

Vercel can't reach `127.0.0.1`, so the server needs a name on the internet through the Cloudflare tunnel, for example `server.petals.elementarycomplexity.dev`. In this architecture, `petals.elementarycomplexity.dev` itself points at Vercel: a DNS record on Cloudflare's zone, not proxied.

- **`coordinator/open_public.sh` was written for the old shape.** It routes `petals.elementarycomplexity.dev` to the container. **In this architecture it must not be run as is.** It would need to take the server's name instead.
- **The server's address setting stays right.** `Petals/public-url`, which is `PETAL_API`, says `https://petals.elementarycomplexity.dev`, and that is still the address people sign in on, links point to and the cookie is named for.
- **The firewall gate stays.** The server's name opens this Mac to the internet, so the firewall and `check_isolation.sh` still apply. C4's key narrows what that name answers, but it doesn't replace the firewall.
- **Lean: a separate server name through the tunnel, opened only after the firewall, behind the key.**

### C10. Vercel's plan

- **The free plan** (Hobby) is for non-commercial use, which fits a hackathon entry. Its limits on forwarded traffic and middleware calls weren't measured. At our size they're probably far away.
- **The existing project:** `petal-flowers` already exists under Elco's account. That's the old keyless public copy. It can take the new domain.
- **Lean: the free plan and the existing project.** $0.

## 4. What changes in today's code, for the leans

| Piece | Change | Size |
|---|---|---|
| **The website** | `next.config` rewrites for `/api/*`, `/mcp`, `/skill.md`, `/petal.mjs`, `/d/*` and `/s/*` when `PETAL_SERVER` is set. `lib/api.ts` calls `PETAL_SERVER` over HTTP. A middleware adds the visitor's address and the site key. Without `PETAL_SERVER`, everything works as today, so local work and the container don't change | about 3 h |
| **The server** | Trust a forwarded visitor address only with the key, and refuse calls without it, health aside (`PETAL_SITE_KEY`). Add a heartbeat to `/live`. Page paths on its own name send people to the website | about 2 h |
| **Tests** | The journey server and the e2e path run as two processes, the site in front of the server. Unit tests for the key and the forwarded address | about 3 h |
| **Operations** | A tunnel name for the server. `open_public.sh` takes that name. The domain on Vercel, plus `PETAL_SERVER` and `PETAL_SITE_KEY` in Vercel's settings. `deploy.sh` for the new shape | about 2 h, plus Elco's gates |
| **The spike (first)** | Section 5 | about 1 h, plus Elco's gates |

**Total: about a day and a half of work, with nothing waiting on anyone.** Elco's gates come on top: a Vercel deploy, a domain, a tunnel name, the firewall.

What the other options add:

| Option | Extra |
|---|---|
| Two addresses (C1) | about 3 to 4 h |
| The API alone in the container (C3) | about 4 to 6 h |
| Long-polling (C5) | about 2 h |
| An async store (C8) | about a day, as its own step |

These are estimates from reading the code, not measurements.

**What doesn't change:**
- sign-in's code and its cookie
- the HTTP API's contract
- the tools
- public mode
- the shipped map rows
- `PETAL_API` (`Petals/public-url`)
- the container's data folder and secrets

## 5. What we don't know yet: the spike, before building

This takes one hour, and it needs a Vercel preview deploy and a tunnel name, both Elco's gates. It changes nothing for visitors. Through a Vercel rewrite to a test server, it measures:

1. Whether a server-sent stream stays open, and for how long, with and without a heartbeat.
2. Whether a 2 MiB upload (a posted reading) passes, and the largest that does.
3. Whether Set-Cookie and the Origin header pass through unchanged.
4. Whether the middleware can add the two headers to a forwarded request.
5. How much each hop adds to a small API call.

If 1 fails, C5 falls back to long-polling. If 2 fails, a posted reading goes in parts, or to the server's name with the key. If 3 or 4 fail, the lean on C1 or C4 needs another look.

## 6. Where the rest of Elco's architecture attaches, unchanged here

- **Sign-in with a wallet, multichain later:** it stays on the server, with its challenge, verification and session. The website shows the wallet picker and passes the signature on. Other chains (Sign-In with Ethereum, Solana, Bitcoin) are added to the server's verify route (SYS-020). NEAR Intents is about paying and moving value, so it attaches where payment does (`open-questions.md`, rows 2 and 3), not here.
- **NEAR storage:** published flowers, and later claims, live on NEAR. On a public site today, the server writes nothing to NEAR, and it reads the map from copies it ships. When a person publishes from their own wallet, the transaction goes from their browser to NEAR. How the server then learns of it is an open question (row 49). It isn't part of this seam.
