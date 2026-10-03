# Audio

Issue [#38](https://github.com/King-Zalogon/mossvale/issues/38). All sound is synthesized with Web Audio: no audio files, no downloads. Everything is optional and every cue has a visual or text equivalent (toasts, battle log, result cards).

## Palette

`src/data/sounds.js` holds the data; `src/services/audio.js` plays it.

- **Effects** (`SFX`): `tap`, `confirm`, `welcome`, `ready`, `rest`, `buy`, `encounter`, `guardian`, `strike`, `element`, `throw`, `broke`, `guard`, `heal`, `join`, `hurt`, `win`, `caught`, `seal`, `chest`. A cue is a few notes (frequency, length, offset, optional glide). Game code asks for a name (`audio.play('seal')`), never a frequency, so changing how the game sounds is a data edit.
- **Ambience** (`AMBIENCE`): one quiet loop per region id: two held drone notes plus band-passed noise (wind, water) with a slow swell. Adding a region needs one entry; a region without one is simply silent.

## Settings

Stored with the other preferences (`mossvale-settings`), separate from the save:

| Setting | Values | Effect |
| --- | --- | --- |
| Sound (all audio) | On / Off (default Off) | Off silences everything, effects and ambience |
| Volume | Low / Medium / High | Master gain |
| Ambient music | On / Off (default On) | Ambience only; effects keep playing |

Sound starts off, so a first launch is silent until you turn it on.

## Behaviour

- The audio context is created on the first click, key press or touch (browsers keep audio locked until then) and every gesture resumes it, so it also recovers after an interruption such as a phone call.
- At most one ambience loop exists. Asking for the same region again does nothing, a region change fades the old loop out as the new one fades in, and turning ambience or sound off stops it.
- Pausing the game or hiding the tab stops the ambience and suspends the context so the device can sleep; coming back resumes it. Effects do not play while held.
- A browser without Web Audio, or any audio error, is ignored: gameplay never depends on sound.

## Tests

`tests/audio.test.mjs` runs the service against a fake audio context: nothing is created while sound is off, every cue plays, volume scales the master gain, ambience never stacks and follows region and settings, hold suspends and resumes, interruptions are resumed by the next gesture, and a missing Web Audio is harmless. The browser test checks the new settings persist.

## Still needs you

Whether the cues are pleasant, the right loudness and distinct enough, and whether the ambience adds anything, can only be judged by listening. Turn sound on in Settings and tell me which cues to change; they are one-line edits in `sounds.js`.
