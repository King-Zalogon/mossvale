# Regional atlas

Issue [#276](https://github.com/King-Zalogon/mossvale/issues/276). The **Atlas** tab of the map screen (`M`) draws how the places of the adventure connect as a route graph, without spoilers. The Island cards and the area map are unchanged; the atlas is a third view.

## What it shows

| State | When | Look |
| --- | --- | --- |
| You are here | the map the player stands on | white ring, gold centre |
| Visited | the save lists the map in `visitedMaps` | filled circle |
| Known | a visited map's trail sign leading there has been noticed (the same `seen` record the area map uses) | dashed circle |
| Locked | known, and every shown trail into it still needs a seal (`requires`), or its region is not open | dashed grey circle with a padlock and the seal that opens it |
| Not on the atlas | everything else | not drawn |

A concealed route (an exit with `route`) and a place that only it reaches are not drawn until the route is discovered (`<map>/route-<id>` event). Hidden places are never named or counted; the atlas only says, as a yes/no, whether some trails are still unmarked.

Trails are lines between places: solid when open, dashed when a seal is still needed, arrowed when only one direction is shown, blue when a concealed route has been found.

## Geography and data

Nothing extra is authored. `domain/atlas.js` derives the graph from the validated exits: a place is put next to the one whose trail leads to it, on the side of its map the exit stands on, so the picture agrees with the real geography. The same save always gives the same picture. Pure module: no DOM, randomness or clock.

## Travel is separate from knowledge

Selecting a place only shows facts: its state, its trails, and the way back to camp (`routeBetween` over open, shown trails). A **Travel to …** button appears only for places already visited and whose region is open, and it calls the existing `travel` action. A place that is merely known cannot be travelled to from the atlas, and nothing here changes progression or saves. Island card travel works as before.

## Accessibility and layout

Each place is a labelled button (`role="button"`, state in its label); arrow keys move to the nearest place in that direction, Enter or Space selects, and selection also follows focus. A **Route list** repeats the graph as sentences for screen readers and small screens. On narrow windows (under 640 px) the graph runs vertically. The graph has no animation, so reduced motion needs no alternative.

## Tests

`tests/atlas.test.mjs` (disclosure per save state, parity with the exits of the shipped pack, concealed routes, layout determinism, routes) and `tests/atlas.browser.mjs` (fresh start, noticing a sign through real play, reload, visiting and travel, keyboard, concealed route, phone layout, Island cards still offering travel).
