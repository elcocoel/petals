# Paying for Petals' own agent

SYSTEMS, 9 Nov, for Elco. Elco: "build the payment step". Petals' own agent on the page (B) runs on NEAR AI Cloud through our server, and the visitor pays for it in NEAR from the wallet they signed in with. The agent is switched on only with this working, so no visitor spends Elco's credit.

Each choice has a lean, which SYSTEMS builds on unless Elco says otherwise.

## 1. How a person pays

**Lean: one top-up, then each turn draws it down.** The person picks an amount and their wallet asks them to approve one plain NEAR transfer to `petals.near`. The page sends the transaction's id to our server, which looks it up on NEAR and checks three things: it came from this person's own wallet, it went to `petals.near`, and it succeeded. Then the amount goes onto the person's credit, once only, however many times it's sent. Every answer the agent gives takes what NEAR AI charged for it off that credit.

Our server never holds a key: `petals.near` is in Elco's wallet, and the server only reads the chain.

*Other ways:* a wallet approval on every turn (honest, but a prompt per message); a small contract the person deposits into and can withdraw from (more NEAR on show, but the server would need a key to draw on it, which TGT-041 rules out).

## 2. What it costs

**Lean: what NEAR AI charges, passed through at cost.** NEAR AI prices each model per million tokens, in dollars, and our server already counts every call's cost. A top-up becomes dollars at NEAR's price at that moment, taken from NEAR Intents' own price list (keyless; $3.61 a NEAR when this was written). On today's model a turn costs about one to five cents, so 1 NEAR is roughly a hundred turns.

*Other way:* a fixed price per turn. Simpler to read, but some turns cost far more than others, so it either overcharges or loses money.

## 3. Mainnet or testnet

**Lean: mainnet.** Sign-in is mainnet already, and only real NEAR pays NEAR AI's bill: on testnet a visitor pays nothing real and Elco pays for every turn. We build and test on testnet and with stand-ins. The first real mainnet transfer happens only on Elco's go.

## 4. What the person sees

- Signed in, with no credit: the chat says Petals' agent runs on NEAR AI and is paid from their wallet, and offers the top-up.
- They approve one transfer in their wallet, and the chat carries on.
- Each answer can show what it cost. Their credit left is shown in NEAR, at today's price.
- When it runs out, before a turn or in the middle of one, the chat stops there and offers the top-up again.

The words are Elco's, through the copy doc.

## 5. What it shows NEAR's judges

- Sign-in with a NEAR wallet (NEP-413), live.
- Payment in NEAR from the person's own wallet, checked on chain by a server that holds no key.
- NEAR's price from NEAR Intents.
- NEAR AI Cloud running the agent, with every answer signed inside its secure hardware and the proof kept (live already).
- Later, if Elco wants: paying from any chain through NEAR Intents, whose quotes Petals already asks for.

## 6. Keeping each person's money apart, and giving back what's unused

Elco, 9 Nov: "how do we separate each user's funds, if and how they would withdraw unused funds".

**Lean: a balance per person in our database, and Elco gives back what's left by hand.** This is what's built. Each person has their own balance, which only their own transfers fill, each one checked on chain and counted once. Every turn takes what NEAR AI charged off that balance, and each charge is kept as its own line, so anyone's balance can be added up from their payments and their turns. The NEAR itself sits in `petals.near`. A person who wants their unused balance back asks, and Elco sends it from `petals.near`, at the NEAR price of the day. Nothing else to build or deploy, and the server still holds no key.

*Other way:* a small NEAR contract that holds each person's deposit under their own account, and lets them take back what's unspent themselves, any time, without asking anyone. It shows more of NEAR and Petals holds nobody's money. But the server would need a key that can charge each turn to the contract, which TGT-041 rules out today, and a contract holding real money has to be written, tested and deployed on mainnet before the freeze. Lean: after the hackathon.

## Three things this changes

- **The page's agent reads the chain itself.** To map anything it reads the chain, web pages and search results, as it did before 8 Nov. Elco: yes, from our server, for people who've paid. It hands the bigger mapping jobs to their own agents when they have them.
- **The spec said Petals holds nobody's money.** A top-up means `petals.near` holds what isn't spent yet. Elco: yes; how it's kept apart and given back is section 6.
- **The server's daily cap ($3 a day, across everyone).** Elco: it stays for unpaid spend only; paid turns don't count.
