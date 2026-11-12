---

title: The brain and its departments
order: 50
---

Petals’ Brain is a shared library of strategies for understanding that power: who holds it, who votes, who can move the money, and who can change the rules. It guides an agent through finding the data, checking what it means, and turning it into a map.

## Doctrine, chapters and recipes

The [doctrine](/docs/brain/doctrine) sets what every answer holds to: discovery, how something is known, the limits of coverage, and counting with tools.

Chapters guide an agent through a question. Reading recipes name the events and calls to read for a kind of contract, and how their answers become data. Recipes hold no code.

The brain is plain files in the repository. Its chapters and recipes are improved by pull request, reviewed before they change for anyone.

## The departments

- [Connecting](/docs/brain/connecting): getting a person and their agent onto Petals.
- [Gathering](/docs/brain/gathering): what a thing is, and how to read something new.
- [Governance](/docs/brain/governance): who holds power, who votes, who moves money and who changes rules.
- [Money](/docs/brain/money): what holdings are worth, when they unlock, and what a treasury paid out.
- [Investigation](/docs/brain/investigation): how to go on from any answer.
- [Services](/docs/brain/services): chapters for deliverables such as a governance report, proposal brief or authority map.
- [Stewardship](/docs/brain/stewardship): improving the brain.

## DNA and RNA

**The DNA** is the brain’s files in the repository: the doctrine, the departments’ hubs, the chapters, the recipes and [the routing table](/docs/brain/routing). It changes only by a reviewed pull request.

**The RNA** is what one task gets: the doctrine, then only the files routed to that task, each whole and stamped with the brain’s version. An agent asks once, with `brain_context`. The question’s words are matched against the routing table’s rows and each chapter’s header, what it’s for and the words it recognises; when the question is about a contract, the calls it answers pick its recipe first. The best three routes are served.

Routing is word matching, with no model call, so it costs nothing and adds no wait for a model. The agent reads what its task needs, not the whole brain.

## Receipts

Every serving keeps a receipt ([brain-receipt/v1](/docs/data-protocol/schemas/brain-receipt-v1)): what was asked, which rows fired, which files were served and how many characters, from which brain version, and through which door.

`brain_usage` counts the receipts for anyone, at [/api/v1/brain/usage](/api/v1/brain/usage): the files, departments and tasks that are read, and the questions that matched nothing, so the brain shows where it’s thin.

Open [the brain](/docs/brain) to read the chapters, recipes and their readiness status. A chapter marked partial still has limits.
