---

title: Choose a contribution
order: 10
---

Start from something a person could not understand or a result they could not reproduce. A small correction with evidence is useful.

| You want to improve         | Start here                                          | Show that it works                                                                   |
| --------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| How an agent reads a system | [Brain chapters and recipes](/docs/brain)           | A bounded example, its sources and the missing step                                  |
| Data from a new system      | [Input readers](../../packages/inputs/src/modules/) | A reader and a small recorded fixture with coverage stated                           |
| Data formats                | [Schemas](/docs/data-protocol)                      | A valid example and its validation; discuss compatibility before changing a contract |
| The flower and its glasses  | [Rendering protocol](/docs/rendering-protocol)      | The same data under the intended view, with a correct legend                         |
| Agent connections           | [Connect your agent](/docs/connect-your-agent)      | The exact client and steps, with the observed result                                 |
| These guides                | [Docs maintenance](../README.md)                    | A source edit that renders correctly and helps a reader finish a task                |

## Keep one source

Change the brain chapter in `brain/`, the schema in `packages/core/schema/`, or the contract in `specs/`. The docs render those files. Write explanations in `docs/` and link to the reference rather than copying it.

## Make the change reviewable

Describe the problem, the resulting behaviour and how you checked it. Use the [README](/docs/getting-started/readme#run-from-a-clean-checkout) to run locally, then run `bash scripts/check.sh`. Keep private credentials, production state and unpublished research out of the change.

The [brain's contribution chapter](/docs/build-it-with-us/contributing) is the corresponding instruction given to agents.
