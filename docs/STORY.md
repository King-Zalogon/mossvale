# Light story, tips and ending

Issue [#28](https://github.com/King-Zalogon/mossvale/issues/28). Data: `dist/maps/story.json` (named in `index.json`). Code: `dist/src/domain/story.js`, wired in `controller.js`. The text shipped here is a short placeholder written to match the game's tone; edit the JSON to change it. Detailed lore, branches and character arcs are deliberately out of scope.

- **Premise.** A one-screen opening card shown once, on a brand-new adventure, after you press Start adventure. Escape or the button closes it; nothing is locked behind it.
- **Tips.** Four one-time tips: capture (first wild battle, shown in the battle log), healing (first time your companion is below 35% health), switching (first battle with a healthy teammate), and resting (first visit to the ranger). Each id is remembered in the save (`hints`), so tips never repeat after a reload.
- **Goals.** The quest card and pin from [OBJECTIVES.md](OBJECTIVES.md) carry the "why move onward": meet a creature, wake each shrine, then collect the rest.
- **Ending.** `ending.when` is a condition (same vocabulary as objectives; today: all three seals). When it first holds, after the last guardian's result screen or when loading a save that already qualifies, an ending card appears once and the save is marked `completed`. Nothing changes afterwards: maps, uncollected creatures and the ranger stay available, the title screen shows "✦ Adventure complete", and the objective becomes "Keeper of the isles".
- **Extending to four biomes.** Add the new seal flags to `ending.when` (validation rejects flags no map can award) and to the final objectives; the ending itself needs no code.

Not done: credits, a separate final destination map (the final shrine's result leads straight into the ending), and the four-biome wording; these wait for #27 and the new biomes.
