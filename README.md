# Mossvale

An original browser-playable creature-catching game with a 2D isometric world, pixel art, and eight-direction movement.

[Play the hosted game](https://mossvale-pixel-adventure.gonzaloreydelcastill.chatgpt.site)

## Play locally

No build step or dependencies are required. From the repository root, run:

```sh
python3 -m http.server 8080 --directory dist
```

Open <http://localhost:8080> in a browser. Any static web server can serve the `dist` directory.

## Controls

| Control | Action |
| --- | --- |
| WASD / arrow keys | Move in eight directions |
| Shift | Run |
| E | Interact with a nearby ranger, shrine, chest, sign, or trail |
| M | Island map |
| J | Field journal |
| Q | Companion team |
| 1–6 during battle | Select a battle action |
| Escape | Close a menu or leave an encounter |

On touch screens, use the directional pad, Run button, and interaction prompt.

## Adventure

Explore Mossvale Meadow, Amber Ridge, and Frostveil Grove. Befriend eight species and choose any captured creature as your companion. Battles include elemental strengths, capture chances, potions, guarding, and companion switching. Creatures gain experience and levels.

Awaken each shrine by defeating its guardian to unlock the next region. Visit Ranger Iris to heal your team and refill capture orbs, or buy extra supplies with coins earned from battles and treasure chests.

Progress saves automatically in the current browser using local storage. Original meadow saves are migrated to the expanded game. Saves are specific to the browser and origin; progress on the hosted game does not automatically transfer to localhost or another host.

## Files

- `dist/index.html`: game interface and controls.
- `dist/style.css`: responsive interface, menus, and animation styles.
- `dist/game.js`: world rendering, movement, encounters, progression, and save handling.
- `dist/sprite*.png`: original creature, character, and environment artwork.
- `dist/favicon.svg`: site icon.

The game uses vanilla JavaScript and Canvas 2D. It has no backend, account system, or multiplayer service. Fonts are loaded from Google Fonts with local fallbacks.
