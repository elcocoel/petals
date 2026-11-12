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

Layers and annotations are private first, kept in your project. Publishing a dataset version to the shared map is not built yet.

See [layer/v1](/docs/data-protocol/schemas/layer-v1) for the fields and [authorship](/docs/ideas/authorship) for how prior work is kept.
