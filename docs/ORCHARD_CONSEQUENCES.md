# Orchard consequences (#265)

The two priorities reconverge on the existing eastern route. They retain their stable events and once-only reward; no global morality score, new save schema or starter requirement is introduced.

| Committed evidence | Visible adult / repair materials | Mara and Rowan |
| --- | --- | --- |
| Family seen, unresolved | Adult beside the low roots; old boards by the feeder | Existing investigation lines |
| `outcome-water-first` | Adult above the channel; boards moved beside the cleared bypass | Water restored first |
| `orchard-family` (objective complete), or `outcome-family-first` | Adult beside the higher dry roots; boards remain by the broken feeder | Family moved first, slower repair pending |

The rescue completion marker is sufficient immediately: leaving for Amber before revisiting the resolution trigger must not lose Rowan's callback or offer a stale unresolved hint. Follow-up dialogue may record the existing final outcome event on re-entry; it does not pay another reward. Backup export retains canonical events; import, reload and re-entry derive the same interpretation. Cancellation/flee before rescue completion leaves its repeatable challenge available. Neither branch closes the east gate or requires a particular companion.

Reuse the map's optional `props[].when` condition to bind decoration to existing committed facts. Conditional decoration is nonblocking; it never edits terrain, collision or encounter pools. NPC lines and hint resolution use the same committed evidence. All work remains pack-scoped through the canonical save's event list.

Visual limits: the adult uses existing Bramblebuck art at ordinary field scale. This does not claim bespoke juvenile sprites, water-flow animation or animated family choreography. The displaced repair materials and adult position are the implemented environmental/creature changes; prose must not be treated as evidence of unsupported animation. Owner narrative/visual enjoyment remains unreviewed.

Local review: `npm start`, continue after Meadow's seal, enter the orchard, speak to Mara, inspect either clue and choose a priority. For family-first, survive two turns and explicitly complete the objective; try leaving/reloading before returning to the upper roots, then talk to Mara and Rowan. Check that ten coins are awarded once. Existing `tests/orchard-clues.browser.mjs` traverses the two routes with actual keyboard/touch controls; `tests/quality-followup.browser.mjs` uses focused imported-state fixtures for both callbacks and renderer checks. `QUALITY_REVIEW=/tmp/orchard-review CHROMIUM=/usr/bin/chromium node tests/quality-followup.browser.mjs` retains inspection screenshots without claiming a timed first-play run.
