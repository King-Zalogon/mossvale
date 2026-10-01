# Encounter pacing and discovery

Issue [#26](https://github.com/King-Zalogon/mossvale/issues/26). Zones live in each map file (`zones`, see [MAP_FORMAT.md](MAP_FORMAT.md)); shared numbers in `dist/src/config.js`.

- **Zones.** `{ terrain, rect?, pool, level, distance? }`. `pool` entries are a species id or `{ species, weight }` (weight 1–100, default 1). `level` is a `[min, max]` range. `distance` is how many tiles of walking in the zone pass between encounters (default `[4, 7]`; the next distance is rolled after each battle).
- **Choosing a creature.** If the zone has creatures you have not met, 60% of encounters pick among those (`UNSEEN_PREFERENCE`); otherwise a weighted pick over the pool. This makes discovery quick without removing repeats.
- **Grace.** After a battle or fleeing there are 4 s with no encounter (`GRACE_AFTER_BATTLE`); after changing maps or returning to camp, 3 s (`GRACE_ON_ARRIVAL`); after loading a save, 2 s. Walking off the grass slowly drains the step counter, and paths, camps and shrines are outside every zone, so backtracking along the trail is safe. A long walk back and forth in tall grass produces roughly 10–25 encounters per 100 tiles (tested).
- **Discovery hints.** Seen creatures list the regions where they live. A creature you have not met says "Try the tall grass of …" once you have visited a region that has it, and "Explore to discover" otherwise.
- **Sources are guaranteed.** `npm run validate` fails if any species appears in no encounter zone, and zones are already checked to cover reachable ground.
- **Scripted encounters.** A trigger may contain `{ "type": "battle", "species": "brooklet", "level": 6 }`, for example an `interact` trigger on a rustling bush. It starts an ordinary wild battle (capturable, flee allowed) and fires once per visit. No scripted encounters ship yet; add them where exploring needs a nudge.

Not done: trainers, encounter-protection items, and per-biome tuning of the 12-creature roster (#24, #52–#54).
