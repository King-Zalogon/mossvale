/* Enemy tactics: a repeating pattern of simple actions, shown to the player one move ahead for guardians.
   Actions: strike (plain hit), element (typed hit, so the matchup matters), charge (no attack; gathers strength),
   heavy (a big plain hit, softened by Guard), brace (no attack; the player's next attack is halved).
   Wild creatures use DEFAULT_PATTERN. A guardian picks a tactic by id in the map data. */
export const DEFAULT_PATTERN = ['strike', 'element'];

export const HEAVY_FACTOR = 1.8; // heavy hit multiplier
export const BRACE_FACTOR = 0.5; // the player's attack multiplier right after a brace

export const TACTICS = {
  'spore-guard': {
    name: 'Spore guard',
    pattern: ['strike', 'brace'],
    intro:
      'It curls behind a cloud of spores. Right after it braces, your attack is halved, so use that turn to Guard or heal and save your elemental move for when it opens up.',
  },
  'rolling-charge': {
    name: 'Rolling charge',
    pattern: ['strike', 'charge', 'heavy'],
    intro: 'It gathers strength, then lands a heavy blow. Watch the line under the log and Guard when the heavy blow is next.',
  },
  'frost-chorus': {
    name: 'Frost chorus',
    pattern: ['element', 'element', 'strike'],
    intro: 'It keeps using its elemental move. A teammate that resists it, or healing between volleys, makes the difference.',
  },
  'tidal-current': {
    name: 'Tidal current',
    pattern: ['element', 'charge', 'heavy'],
    intro: 'A wave builds before the crash. Use the quiet turn to heal or prepare, then Guard when the line calls out the heavy blow.',
  },
};

/** What the player sees under the battle log for a guardian's next move. */
export const INTENT_TEXT = {
  strike: 'a quick strike',
  element: 'its elemental move',
  heavy: 'a heavy blow (Guard softens it)',
  charge: 'gathering strength',
  brace: 'bracing (your next attack will be halved)',
};

export const planOf = tacticId => TACTICS[tacticId]?.pattern ?? DEFAULT_PATTERN;
