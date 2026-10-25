# Orchard consequence proof (#265)

Run both real-control routes and capture reviewed browser views with:

```sh
CHROMIUM=/usr/bin/chromium ORCHARD_REVIEW=1 node tests/orchard-clues.browser.mjs
```

The keyboard route chooses water-first; the touch route completes the non-capture family rescue. Both routes reload before re-entry, check that the once-only reward is not duplicated, revisit Mara, and travel to Rowan on Amber Ridge. The browser regression checks Mara's reaction, each branch's dialogue, and the conditional local prompt after the outcome is committed. `routes.json` records planned and observed movement lengths and elapsed time from the latest run.

`desktop-rowan-water-first.png` and `phone-rowan-family-first.png` show the two callbacks in the target desktop and landscape touch layouts. The Mara captures show the corresponding return response. The water/family geography and overworld family sprites remain static; the updated prompts and dialogue communicate the persisted differences. These captures verify implementation behavior and layout, not owner enjoyment or final art approval.

The focused state regression is included in `tests/scenes.test.mjs`: it serializes each branch to a backup, imports it into an independent save, then checks mutual exclusion, Mara's remembered response, both map-object prompts and Rowan's next-scene callback against the continuity handoff.
