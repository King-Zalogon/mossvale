# Settlement maps: Brackenwake Commons

Issue [#277](https://github.com/King-Zalogon/mossvale/issues/277). A settlement is an ordinary map (see [MAP_FORMAT.md](MAP_FORMAT.md)) authored so that it reads as an inhabited place instead of a service menu: it has no wild encounters, rest and supplies are in the world, and everything around them is optional. `dist/maps/brackenwake-commons.json` is the first one and the worked example.

## What the town is

- **Place.** A 56×44 island town around a spring-fed pond. A ring of paths circles the pond (a loop with two independent ways round it), a north lane leads in from the Meadow gate, a west and an east street branch off the ring, and a south lane crosses a creek on the old survey bridge to a walled-in habitat garden. The east street ends at a lookout toward the red spires of a far shore.
- **Connection.** An optional south trail from the Meadow (`south-to-brackenwake`, spawn `brackenwake-return` in the Meadow) and the north trail back (`north-to-meadow`). Neither has a `requires`, so it is never a progression gate. No map, region or save identity changed: `meadow`, `amber-ridge`, `frostveil-grove`, `frostveil-pass`, `reedfen-wetlands`, `orchard-ruins`, `stilt-isles` and `stone-basin` keep their IDs and order; the town adds no region, seal or save field.
- **Services.** Warden Hollis (the one `ranger` landmark) gives free rest and the supply shelf at the ranger hall; the survey board carries the rumours; the cider-press green with Wren and its benches is the social space; Tobin and the habitats are in the garden.
- **NPCs react to your discoveries and your companion** with the `{active}` and `{party}` dialogue conditions ([OBJECTIVES.md](OBJECTIVES.md)). The lines are chosen from the save each time you talk, so changing the team changes the answer. Board and lookout lines read only places already visited, so they never reveal a later map.
- **Habitats.** Six creature spots (Brooklet at the spring, Duskwing in a nest box on the press frame, Emberkin on the sun-warmed wall, Fernling among plant pots, Pebblit under the garden stones, Bramblebuck in the straw) are `sign` landmarks with the species' static portrait. Interacting speaks a line (and a different one if that species is in your party); it never starts a battle and gives no reward.
- **Encounters.** `zones` is empty: no tall-grass grind and no trainer gauntlet. The few `t` tiles are decoration.

## Authoring notes

- `scripts/gen-brackenwake.py` builds the map deterministically from a few shapes and hand-placed coordinates (`--check` compares it to the committed file). After running it, run Prettier, then `npm run pack -- refresh-manifest dist/maps`.
- A map has **one working ranger**: the ranger menu always belongs to the first `ranger` landmark. Other characters are `sign` landmarks with a person sprite (`person-gardener`, `person-traveler`) and a `name`, `tag` and `lines`.
- The design report counts a repeated major-landmark sprite as a silhouette warning. The town uses one cottage as a landmark, a cider press, a well, a lantern post, an overlook and creature portraits for the rest, and the second house is scenery.
- Set pieces in the Meadow were regenerated with `scripts/gen-set-pieces.py` because the new exit and spawn changed the keep-clear zones.

## Limits and not evaluated

- **No new art.** Characters reuse two shipped person sprites; the town has one shipped building sprite, so houses repeat. Distinct silhouettes come from the press, well, lantern, overlook, wall and creature portraits.
- **Habitat creatures are still pictures.** The engine has no ambient creature behaviour; the "low-intensity idle behaviour" part of the issue depends on field behaviour work (#262) and is not delivered here.
- **Localization.** All text is English authored data; no localization table exists to update.
- **Playtest.** The local browser test walks the entry, conversation, free rest, a habitat, reload and return on desktop and phone. A person has not judged the layout or enjoyment.

## Evidence

`tests/brackenwake.test.mjs` (compiled map, exits, loop, no zones, companion-aware lines, no spoilers, generator match) and `tests/brackenwake.browser.mjs` (real play, desktop and phone). Annotated full-map view and normal-play screenshots are in `docs/map-design/277/`.
