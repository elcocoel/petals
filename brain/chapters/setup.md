---
id: setup
for: a person setting up Petals from any chatbot, step by step: a wallet, signing in, credit, a first conversation
recognise: set up, setup, get started, new to petals, wallet, sign in, log in, connect, top up, credit, first time, how do I start
tools:
continues: start-from-an-address
status: ready
---

# Setting up Petals

<!-- {site} is the Petals site's origin; whoever serves this chapter writes it in. It's served at {site}/setup as plain text, for any chatbot that can open a link. The paste that points here carries the same steps, for one that can't. -->

## What Petals is

Petals ({site}) maps who holds power in on-chain networks, such as a DAO, a staking pool or a token's community, and draws each as a flower. A flower is a polygon with one side per participant, and on each side a petal standing out from it. Each petal is an account. Its dimensions (height, width, colour, outline, segments) each show a piece of data, such as a share of voting power or the backers behind a pool. So a glance tells a shared network from one held by a few accounts.

Petals reads systems on NEAR, Ethereum, Base, Arbitrum, Gnosis and Solana. Its readings come from the chain, with their sources and the block or date they describe. What Petals' agent infers is labelled apart from what it read.

Browsing the Power Map ({site}/map) is free and needs nothing. Talking with Petals' agent, which reads networks and draws flowers with you, needs two things: a NEAR wallet to sign in with, and a little credit, paid as you go.

## The steps

There are four steps, and a fifth for later. Take them one at a time, and skip any that's done.

### 1. A NEAR wallet

- Meteor Wallet (meteorwallet.app) works in the browser on any computer, and as a browser extension. Any NEAR wallet that Petals' Connect list shows works too: someone who has one already skips this step.
- Creating a wallet shows a recovery phrase of 12 words. It goes on paper, kept offline. It's never typed into a chat, an email or any site other than the wallet itself. Petals never asks for it, and neither should anyone helping.
- A brand-new wallet needs no NEAR to sign in to Petals.

### 2. Sign in on Petals

- Open {site} and press **Connect**. Pick the wallet and approve the sign-in it shows.
- Signing in is a signature, not a payment. It moves no funds and costs nothing.
- Petals then opens the person's own space, where their conversations and maps are kept, private to them.

### 3. Credit for Petals' agent

- Petals' agent runs on NEAR AI, and each answer is paid as it goes, in dollars with NEAR beside. A flower costs a few cents.
- When the conversation needs credit, the chat shows a row to add it:
  - **Add 1 NEAR:** the wallet asks to approve one plain transfer of 1 NEAR. This needs NEAR in the wallet.
  - **Pay with another token**, with no NEAR needed. Pick the token and its chain, the dollars to add, and an address on that chain, where anything not swapped goes back. Then press **Get the address to send to**. Send exactly the amount shown, in one transfer from any wallet, to that address, with the memo if one is shown, before the time shown. The chat says when the credit is added. This goes through NEAR Intents.
- To have NEAR in the wallet: buy it on an exchange that lists NEAR and withdraw it to the wallet's address.

### 4. A first conversation

- Open {site}/make. Type a community, a wallet or a contract to look into, such as "Who holds power in RaidGuild?" or a NEAR account's name.
- Petals' agent finds it, reads the chain and draws its flower beside the chat.
- Good next questions: "Show me the source." "Who's behind this petal?" "How did this change over the last year?"

### 5. Later, if wanted: your own agents

- Someone who uses Claude Code, Codex or Hermes on their computer, or the Claude app or ChatGPT, can bring them in to take mapping jobs from Petals' agent. **Connect an agent**, at the top of Petals' side panel, copies the prompt for it.
- None of this is needed to start.

## If something goes wrong

- **Connect shows no familiar wallet:** make one with Meteor (step 1), then press Connect again.
- **The sign-in window doesn't open:** the browser may have blocked a pop-up. Allow it for the site, and press Connect again.
- **Paid with another token, and less arrived than asked:** it goes back to the address given in step 3.
- **Anyone, or any site other than the wallet, asks for the recovery phrase or a private key:** stop. Petals never does. Signing in and paying are always approved in the wallet itself.
