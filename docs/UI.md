# Interface, readability and accessibility

Issues [#33](https://github.com/King-Zalogon/mossvale/issues/33) and [#34](https://github.com/King-Zalogon/mossvale/issues/34). This is a personal-use target: practical, keyboard- and touch-friendly, no formal certification and no spatial screen-reader redesign of the world.

## What the interface does

- **Always-visible essentials.** The side panel shows the companion (level, HP, XP or MAX LEVEL), supplies, the current goal with its checklist, and the pin telling you where to go next ([OBJECTIVES.md](OBJECTIVES.md)). A prompt appears next to the landmark you can use (`E`). Journal entries show habitats; team cards show level, move and HP ([BATTLE.md](BATTLE.md), [ENCOUNTERS.md](ENCOUNTERS.md)).
- **Battle information is text.** The log is a polite live region; buttons say what they do and what they cost ("costs 1 Focus", "Take 65% less next hit"); the matchup line says strong/weak; Focus is shown as pips with a text label; a guardian's next move is written under the log. Nothing relies on colour or sound alone (HP has numbers, effectiveness has words).
- **Dialogs are real dialogs.** While a menu or battle is open, the page behind it is inert: Tab cannot leave the dialog and clicks cannot reach the world. Escape or the × closes it (a title screen asks for a choice, and a fight in progress only leaves by the leave button).
- **Stable re-rendering.** Battle rounds and menu views redraw their HTML; the dialog keeps its scroll position and keyboard focus on the same control (or the first usable button if that control is disabled for a moment).
- **Keyboard everywhere.** WASD/arrows, Shift run, `E` interact, `M/J/Q` menus, `1–6` battle actions, `Esc` menu/back, visible 2 px focus outlines. Touch has the eight-direction pad, Run and an interaction prompt, with controls at least 44 px on touch screens.
- **Motion.** The system "reduce motion" preference is honoured, and Settings → Motion → Calm forces it: CSS animations stop, the camera snaps instead of gliding and the arrival fade is skipped.
- **Text size.** Settings → Text size (Normal / Large / Larger) scales menus and side panels by 1.15× / 1.3×; the world is scaled with Zoom. The browser tests check that menus do not overflow a 390 px phone or a laptop at the largest size.
- **Contrast.** The colour tokens used for text pass 4.5:1 on the backgrounds they are used on (`tests/contrast.test.mjs`).

## Known limits

- The isometric world is Canvas-only; objectives and tips are mirrored as text, but there is no description of the map itself.
- Text size uses the CSS `zoom` property (Chrome, Edge, Safari, and Firefox 126+).
- Contrast is verified for the shared tokens, not for every one-off colour in the stylesheet.
- Nothing here has been tried on your actual devices yet; that is #35.
