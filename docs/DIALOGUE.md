# Speech bubbles

Issue [#84](https://github.com/King-Zalogon/mossvale/issues/84). Spoken lines appear in comic-style text globes above whoever is talking, with a tail pointing at them, instead of toasts or full-screen cards. Code: `src/domain/speech.js` (pure rules and placement), `src/ui/bubbles.js` (DOM), `renderer.anchor()` (where a character stands on screen), `controller.js: speak()`.

## What speaks, and as whom

| Source | Speaker |
| --- | --- |
| A `sign` landmark's `text` or `lines` | the sign |
| A `ranger` landmark's `lines` | the ranger; afterwards the rest/shop choices open as real controls |
| A trigger's scene `events` (`dialogue` actions) | the action's `speaker`, otherwise the narrator |
| A line's own `speaker` | whoever it names |

`speaker` is a stable reference, never engine code for a particular character:

- `player` (the explorer), `companion` (the creature walking with you), `narrator` (no tail, no name, pinned near the top), or
- the `id` of a landmark on the same map (`"villager"`, `"ranger"`, `"building"`). The name shown is that landmark's `name`, if it has one.

Validation (`npm run validate`) rejects unknown speakers with the field path, for example `map hearth-yard: triggers[0].events[0].actions[1].speaker: unknown speaker "ghost"`. A speaker that is valid but not on screen still talks: the bubble is held at the nearest edge with its tail pointing that way.

```jsonc
{ "id": "gossip", "at": [4.3, 5.7], "radius": 1, "on": "interact", "once": false,
  "events": [{ "id": "gossip", "repeatable": true, "actions": [
    { "type": "dialogue", "speaker": "villager", "text": "Did you hear? Wren put the kettle on." },
    { "type": "dialogue", "speaker": "building", "text": "Come in, come in." },
    { "type": "dialogue", "speaker": "player",   "text": "Thank you, I will!" },
    { "type": "dialogue", "speaker": "narrator", "text": "The kettle whistles happily." } ] }] }
```

A trigger may consist of scene events alone (no `do` list). A scene's `challenge` starts after the last line. See [MAP_FORMAT.md](MAP_FORMAT.md) and `tests/fixtures/packs/hearth` for the two reusable characters in a multi-speaker scene.

## Behaviour

- **Pages.** Long text is split at sentence ends into pages of at most 150 characters, so a bubble stays small on a phone. Each page keeps its speaker.
- **Placement.** Above the speaker's head and name tag; below their feet if there is no room above; always inside the game viewport, with the tail held on the bubble and pointing toward the speaker. It follows the camera every frame, so it works at any zoom and screen size.
- **Keys.** `E`, `Enter` or `Space` go to the next line (holding the key does not skip lines), `Esc` closes the whole conversation. Tapping the bubble or its *Next* / *Done* button also advances. Movement and other conversations are paused while someone talks, and the press that closes a conversation cannot open the next one.
- **Choices.** The ranger's rest/shop choices are ordinary buttons in the menu that opens after the last line. `Esc` closes the conversation without opening the menu.
- **After the last line** gameplay focus returns to the world. A menu, a map change or an adventure switch drops any open conversation.
- **Accessibility.** The bubble is a live region (`aria-live="polite"`) holding plain, selectable text with the speaker's name; the controls are real buttons with names. It follows the text-size setting (Large and Larger scale the bubble text) and drops its pop-in animation under reduced motion. Story cards (the opening, tips, the ending) remain narrator cards.

## Tests

`tests/speech.test.mjs` covers pagination, speakers, placement at every edge, validation and that no engine file branches on a character's name. `tests/speech.browser.mjs` checks, in a browser, the anchor and tail for a ranger, a sign and a four-speaker scene, frozen movement, Escape and the choices, keyboard and tap, no accidental reopen, 390 px phones with larger text, zoom extremes, reduced motion, and cleanup on a map change.
