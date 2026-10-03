# Light story, tips and ending

Issue [#28](https://github.com/King-Zalogon/mossvale/issues/28). Data: `dist/maps/story.json` (named in `index.json`). Code: `dist/src/domain/story.js`, wired in `controller.js`. The text shipped here is a short placeholder written to match the game's tone; edit the JSON to change it. Detailed lore, branches and character arcs are deliberately out of scope.

- **Premise.** A one-screen opening card shown once, on a brand-new adventure, after you press Start adventure. Escape or the button closes it; nothing is locked behind it.
- **Tips.** Four one-time tips: capture (first wild battle, shown in the battle log), healing (first time your companion is below 35% health), switching (first battle with a healthy teammate), and resting (first visit to the ranger). Each id is remembered in the save (`hints`), so tips never repeat after a reload.
- **Goals.** The quest card and pin from [OBJECTIVES.md](OBJECTIVES.md) carry the "why move onward": meet a creature and wake each of the four shrines. The roster checklist is optional.
- **Ending.** `ending.when` requires the Meadow, Amber Ridge, Frostveil Grove, and Reedfen seals. When it first holds, after the last guardian's result screen or when loading a save that already qualifies, an ending card appears once and the save is marked `completed`. Uncollected creatures and the ranger remain available afterwards.

Not done: credits and a separate final destination map (the last shrine's result leads straight into the ending).
