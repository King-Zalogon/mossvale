/* Player preferences, stored separately from the save so a new game or a restore never resets them. */
export const SETTINGS_KEY = 'mossvale-settings';
export const ZOOM_MIN = 0.85;
export const ZOOM_MAX = 2.5;
export const MOTION = ['auto', 'reduced']; // 'reduced' forces calm motion even if the system does not ask for it
export const TEXT_SIZES = ['normal', 'large', 'larger'];
export const DEFAULTS = {sound: false, motion: 'auto', zoom: null, run: false, text: 'normal'};

/** Validates unknown input into a complete settings object (unknown or invalid fields fall back to defaults). */
export function normalizeSettings(raw) {
  const r = raw !== null && typeof raw === 'object' ? raw : {};
  return {
    sound: r.sound === true,
    motion: MOTION.includes(r.motion) ? r.motion : DEFAULTS.motion,
    zoom: typeof r.zoom === 'number' && Number.isFinite(r.zoom) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, r.zoom)) : null,
    run: r.run === true,
    text: TEXT_SIZES.includes(r.text) ? r.text : DEFAULTS.text,
  };
}

export function loadSettings(storage) {
  try {
    return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));
  } catch {
    return {...DEFAULTS};
  }
}

/** Returns whether the write succeeded; preferences are never worth interrupting play. */
export function saveSettings(storage, settings) {
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}
