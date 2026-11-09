---
id: over-time
for: how a group changed over a span, at an interval agreed with the person
recognise: over time, history, change, since, trend, month, year, before
tools: get_snapshot, compute_figures, describe_snapshot
continues: going-deeper
status: partial
---

# Over time

1. **Agree the interval and the span with the person:** a month over a year, say. At most 24 points to start.
2. **Read the same reading at each point:** `get_snapshot` with the same network and parameters, and `at` set to each date. A final reading Petals already holds is reused, never read twice.
3. **Count each** with `compute_figures`, and say what changed: the top holder's share, the Nakamoto coefficient, who joined and who left.

Drawing the change on one flower waits for the visual protocol. Until then, draw the first and the last point, side by side, and say so.
