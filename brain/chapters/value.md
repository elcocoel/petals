---
id: value
for: estimating the value of identified holdings and separating price, backing and spending power
recognise: value, worth, price, dollars, USD, holdings, treasury, market cap, supply, backing, liquidity, wrapped
tools: list_networks, get_network, get_snapshot, describe_snapshot, read_chain, read_page, add_layer
continues: who-gets-a-vote, who-can-move-money-or-change-rules, vesting, over-time
status: partial
---

# Value

Name what is being valued: a petal's holdings, staked assets, a treasury or token supply. For a community, define the accounts and assets included in its dollar total.

1. **Identify the asset and amount.** Record chain and contract address, or the chain's native asset identifier. A symbol is not identity. Preserve the amount's block, coverage and units. [ERC-20](https://eips.ethereum.org/EIPS/eip-20) defines balances and total supply; decimals are optional, so establish them rather than assuming 18. Check whether a reading already contains human-readable units before converting.
2. **Identify a price separately.** The [1Click token list](https://docs.near-intents.org/api-reference/oneclick/get-supported-tokens) supplies USD price metadata for supported assets, including `priceUpdatedAt`. Match the asset exactly and retain the provider, retrieval time and price timestamp. A missing price leaves the position unpriced, not worth zero; flag stale or unsuitable prices. A current price applied to an old balance is a mixed-date estimate, not a historical valuation.
3. **Calculate only compatible units.** For raw token units, the estimate is `amount / 10^decimals × USD price`. Keep the inputs and arithmetic reproducible. Never multiply veNEAR or membership shares by an underlying token's price. ERC-20 delegated votes count tokens one for one, so a dollar figure on them (a map's `delegated_votes_usd`) is what the delegated tokens are worth, not what the delegate owns: say so. A share may carry redemption rights; establish the assets, proportions and conditions before estimating its backing.
4. **Explain what the total means.** Sum only the named accounts and assets, deduplicated. Treasury value requires identifying treasury assets; gross assets are not net assets without liabilities. [Market capitalization](https://www.coingecko.com/en/methodology) uses circulating supply; chain `totalSupply` does not establish circulation or maximum supply. Label total-supply-times-price explicitly; any diluted estimate must state which future supply it assumes. None establishes available spending money.
5. **Check access and overlap.** Distinguish transferable, locked and redeemable assets. Thin liquidity, fees and price impact mean a price-based estimate is not cash proceeds. For wrapped, staked or membership claims, distinguish market price from backing; do not count both a claim and its underlying treasury or assets in one economic total. Record unresolved redemption conditions and exclusions.

There is no valuation tool yet. Each map on the site carries its stored value (value/v1, on its card): its token's price with its source (1Click, then DefiLlama) and time, its supply from its chain and time, and its newest reading's totals at that price; each petal's own value is a piece of data on its reading, `<measure>_usd`. A token with no price says so. Check that value's asset, dates and units before quoting it. `erc20-holders` and `solana-spl-holders` have bounded coverage; inspect it with `describe_snapshot`. `read_page` can fetch public JSON where reachable. `read_chain` can inspect EVM supply and balances, but cannot select historical blocks for calls or read NEAR/Solana. Keep independently gathered data with `add_layer` and provenance. Chain facts require a block or slot to be called verified; valuation is a sourced calculation, not a chain fact. Label assumptions inferred and missing inputs unknown.
