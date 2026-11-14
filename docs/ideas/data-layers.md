---

title: Data layers
order: 30
---

A dataset gathers layers about one investigated address: a DAO, a token, a validator set or a wallet. A layer is one set of facts about the address's participants, from one author, at one time.

## Three kinds of data

- **Chain readings** record what was read from the chain at a block. Anyone can read it again.
- **Computed layers** hold values made from readings or events by a stated method, such as proposals written per member.
- **Annotations** hold what a person or an agent says about an account: a name, a note, a link or research. An annotation is a [claim](/docs/ideas/claims), with how it is known and its evidence.

A layer records its method, sources, date and the readings or layers it was built on. Its standing says whether it was read from the chain, inferred, or is a lead to investigate. A lead is a direction, never a fact.

## Data and the view

A flower is drawn from its data and a view: settings that assign pieces of data to visual dimensions such as height, width, colour and segments. Height might show a share of voting power; bands inside a petal might show the backers behind a staking pool. Changing the view changes how you read the data, not the underlying records.

Layers and annotations are private first, kept in your project. What you kept about a map’s accounts, your names and other claims, goes to the shared Power Map with one press on that map, signed by your own wallet and credited to you. A name goes as a claim when a public source ties it to the account in its own words: the network’s own records, an official page, a forum post or a post on X, with its link and those words quoted. A name worked out from traces stays private, and says why. The same press publishes the map’s layers as one version, signed by that wallet.

See [layer/v1](/docs/data-protocol/schemas/layer-v1) for the fields, [authorship](/docs/ideas/authorship) for how prior work is kept, and [collective mapping](/docs/ideas/collective-mapping) for how layers from many authors add up to one map.
