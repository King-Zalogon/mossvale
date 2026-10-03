# Objectives, milestones and short lines

Issue [#18](https://github.com/King-Zalogon/mossvale/issues/18). Data: `dist/maps/objectives.json` (named in `index.json`) and `lines` on map landmarks. Code: `dist/src/domain/objectives.js`. This is deliberately not a quest engine: one chain of objectives, one condition each, and optional short lines.

## Objectives

An ordered list. The current objective is the first one whose `done` condition is not yet true; the last one has no `done` and stays. Progress is derived from the save, so it resumes after a reload by construction, and the HUD, pin and quest card all read the same entry.

```jsonc
{ "id": "meadow-seal", "step": "02", "title": "Awaken the meadow",
  "copy": "Visit the blue crystal shrine north of camp.",
  "map": "meadow",                       // optional: where this happens
  "pin": "Follow the blue shrine marker north",
  "pinElsewhere": "Take the western trail back to the Meadow", // optional: shown on other maps
  "done": { "flag": "meadow.seal" },
  "lines": [ { "text": "Earn the verdant seal", "done": { "flag": "meadow.seal" } } ] }
```

`lines[].text` may contain `{caught}` and `{total}`. The final goal keeps the all-species count optional; the story ends when all four regional seals are earned. The current goal id is stored in the save (`goal`); when it changes during play a "New goal: …" toast appears (not on first run or reload).

## Conditions

One key each: `{flag: "<map>.seal" | "<map>.chest"}`, `{met: true}`, `{caught: N | "all"}`, `{seen: N | "all"}`, `{visited: "<map>"}`, `{all: [...]}`, `{not: cond}`. No condition means always. Anything else fails validation.

## Milestones and once-only rewards

A milestone is a flag (`<map>.seal`, `<map>.chest`) that is stored once and never re-awarded:

- **Chest**: `reward { coins, potions, orbs }` on the chest landmark; opening twice pays once.
- **Shrine / regional challenge**: `reward { coins, potions, xp }` on the shrine landmark is paid when the seal is first earned; beating the guardian again pays only the small repeat reward.
- **Exit unlock**: an exit's `requires` names the flag that opens it.
- **Discovery**: use `{caught}` / `{seen}` / `{visited}` in objectives.

## Short lines and roles

`lines: [{ "when": cond, "text": "…" }, { "text": "fallback" }]` on a `ranger` or `sign` landmark picks the first line whose condition holds. The on-screen name tag (`tag`) and the name (`name`) are map data, so the same ranger asset can carry a different name, tag and text in another adventure; `kind` stays the functional role (rest and shop). There are no branching dialogue trees or scripts by design; later story roles can add more `kind`s or `lines`.

## No softlocks

`npm run validate` simulates the unlock chain: starting from the first map it collects every flag earned by reachable landmarks and opens every exit whose requirement is held. Every map must open up, and every flag an objective asks for must be earnable. In play, orbs and potions can always be topped up at the ranger (rest refills orbs for free) and defeat only returns you to camp healed, so required progress cannot become impossible.
