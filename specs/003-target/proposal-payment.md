# Paying for Petals' own agent

9 Nov. Petals' own agent on the page (B) runs on NEAR AI Cloud through our server, and the visitor pays for it in NEAR from the wallet they signed in with. The agent is switched on only with this working, so no visitor spends the operator's credit.

Each choice has a lean, which the build follows.

## 1. How a person pays

**Lean: one top-up, then each turn draws it down.** The person picks an amount and their wallet asks them to approve one plain NEAR transfer to `petals.near`. The page sends the transaction's id to our server, which looks it up on NEAR and checks three things: it came from this person's own wallet, it went to `petals.near`, and it succeeded. Then the amount goes onto the person's credit, once only, however many times it's sent. Every answer the agent gives takes what NEAR AI charged for it off that credit.

Our server never holds a key: `petals.near` is in the operator's wallet, and the server only reads the chain.

*Other ways:* a wallet approval on every turn (honest, but a prompt per message); a small contract the person deposits into and can withdraw from (more NEAR on show, but the server would need a key to draw on it, which TGT-041 rules out).

## 2. What it costs

**Lean: what NEAR AI charges, passed through at cost.** NEAR AI prices each model per million tokens, in dollars, and our server already counts every call's cost. A top-up becomes dollars at NEAR's price at that moment, taken from NEAR Intents' own price list (keyless; $3.61 a NEAR when this was written). On today's model a turn costs about one to five cents, so 1 NEAR is roughly a hundred turns.

*Other way:* a fixed price per turn. Simpler to read, but some turns cost far more than others, so it either overcharges or loses money.

## 3. Mainnet or testnet

**Lean: mainnet.** Sign-in is mainnet already, and only real NEAR pays NEAR AI's bill: on testnet a visitor pays nothing real and the operator pays for every turn. We build and test on testnet and with stand-ins. The first real mainnet transfer is made deliberately, as its own step.

## 4. What the person sees

- Signed in, with no credit: the chat says Petals' agent runs on NEAR AI and is paid from their wallet, and offers the top-up.
- They approve one transfer in their wallet, and the chat carries on.
- Each answer can show what it cost. Their credit left is shown in NEAR, at today's price.
- When it runs out, before a turn or in the middle of one, the chat stops there and offers the top-up again.

## 5. What it shows NEAR's judges

- Sign-in with a NEAR wallet (NEP-413), live.
- Payment in NEAR from the person's own wallet, checked on chain by a server that holds no key.
- NEAR's price from NEAR Intents.
- NEAR AI Cloud running the agent, with every answer signed inside its secure hardware and the proof kept (live already).
- Later: paying from any chain through NEAR Intents, whose quotes Petals already asks for.

## 6. Keeping each person's money apart, and giving back what's unused

The question: how each person's funds are kept apart, and how they withdraw what's unused. The choice (9 Nov): a NEAR contract. A small contract holds each person's deposit and they withdraw it themselves, so Petals holds nobody's money.

**How it works, in plain words.** The contract is `packages/near/contract`, at `petals-credit.near` on mainnet once deployed (`credit.petals-paytest.testnet` and `petals-rcredit2.testnet` on testnet now).

- **Deposit.** The person's wallet calls `deposit` with the NEAR they choose. It goes onto their own balance in the contract, under their own account. The first deposit pays a little for storing that balance (0.00125 NEAR).
- **Withdraw.** The person calls `withdraw`, for some or all of what's left, whenever they like, and asks nobody. It needs one yoctoNEAR attached, which only their own wallet can do, and that comes back with the rest.
- **Charge.** After each turn of Petals' agent, our server calls `charge` for what NEAR AI billed, in NEAR at that turn's price. It moves that much from the person's balance to what Petals has earned, never more than they hold. Nothing else can call it.
- **Claim.** Petals' own account takes what has been earned.

**Setting it up asks the owner's wallet for one plain transfer, nothing else** (9 Nov: Meteor refused a site's request for a full-access key, as wallets should). `packages/near/scripts/credit-setup.ts` makes a new account on the operator's computer, the operator's wallet sends it 1.7 NEAR, and the script does the rest from there: it makes `petals-credit.near` and `petals-charger.near` through NEAR's own name registrar, deploys the contract and sets it up, and deletes the contract's last key, so nobody can change it, its operator included, and people can always withdraw. The charger keeps two keys: the operator's own wallet key, and the server's. Then the script deletes the account it was paid into, and what's left goes back to petals.near. A run that stops halfway picks up where it stopped. Rehearsed on testnet end to end, 9 Nov.

**The server's key.** It's a function-call key on a separate account, the charger, that can call `charge` on the contract and nothing else: NEAR's own key rules refuse it any other method, any transfer and any attached NEAR. So whoever stole it could only move people's balances into what Petals has earned, where the operator sees it and can give it back. They could never send anything to themselves. That key, its gas allowance, is all the server holds.

**What the person's credit is.** Their balance in the contract, read from the chain before each turn and shown in NEAR. The page reads it after a deposit or a withdrawal. Invites still sponsor others, as before; with the contract on, credit given by hand (`fund-person`) gives way to what people hold in it.

Tested on testnet, 9 Nov: a deposit of 0.2 NEAR, a charge of 0.01 by the server's key, a withdrawal of 0.05 by the person, and the server's key refused `withdraw`, `claim` and a transfer.

## Three things this changes

- **The page's agent reads the chain itself.** To map anything it reads the chain, web pages and search results, as it did before 8 Nov, from our server, for people who've paid. It hands the bigger mapping jobs to their own agents when they have them.
- **The spec said Petals holds nobody's money.** A top-up means `petals.near` holds what isn't spent yet. How it's kept apart and given back is section 6.
- **The server's daily cap ($3 a day, across everyone).** It stays for unpaid spend only; paid turns don't count.
