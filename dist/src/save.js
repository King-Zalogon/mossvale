/* Mossvale save codec: validation, v1-v3 -> v4 migration, quarantine and checkpoints.
   Pure functions over a Storage-like object so it can be tested without a browser.
   In memory the game keeps species/region *indexes*; on disk it stores stable string IDs. */
import {CAPS} from './data/economy.js';
import {TACTICS} from './data/tactics.js';
import {FOCUS_MAX, FOCUS_START, MAX_XP, PARTY_SIZE, XP_PER_LEVEL} from './config.js';

const VERSION = 4;
const LEGACY_PACK = 'mossvale';
const KEYS = {
  v3: 'mossvale-v3',
  v2: 'mossvale-v2',
  v1: 'mossvale-v1',
  backup: 'mossvale-backup',
  transaction: 'mossvale-save-transaction',
  quarantine: 'mossvale-quarantine',
  archive: 'mossvale-archive',
};
const SAVE_TRANSACTION_VERSION = 1;
const SAVE_TRANSACTION_KEYS = [KEYS.archive, KEYS.v3, KEYS.backup];
const MAX_COUNT = 9999,
  MAX_TIME = 1e9,
  MAX_QUARANTINE = 3;
const MAP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, min, max, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);

/** The adventure a raw save belongs to: saves written before packs existed are the first adventure. */
const packOf = raw => (isObj(raw) && typeof raw.pack === 'string' ? raw.pack : LEGACY_PACK);

function readSaveTransaction(storage) {
  const raw = storage.getItem(KEYS.transaction);
  if (raw == null) return null;
  const transaction = JSON.parse(raw);
  if (!isObj(transaction) || transaction.version !== SAVE_TRANSACTION_VERSION || !isObj(transaction.changes)) throw new Error('Invalid save transaction');
  const changes = {};
  for (const key of SAVE_TRANSACTION_KEYS) {
    if (!Object.hasOwn(transaction.changes, key)) continue;
    if (typeof transaction.changes[key] !== 'string') throw new Error('Invalid save transaction value');
    changes[key] = transaction.changes[key];
  }
  if (!Object.keys(changes).length || !Object.hasOwn(changes, KEYS.v3) || !Object.hasOwn(changes, KEYS.backup)) throw new Error('Incomplete save transaction');
  return {version: SAVE_TRANSACTION_VERSION, changes};
}

/** Reads a save-related value from the durable transaction intent while its mirror writes are pending. */
export function readSaveItem(storage, key) {
  const transaction = readSaveTransaction(storage);
  return transaction && Object.hasOwn(transaction.changes, key) ? transaction.changes[key] : storage.getItem(key);
}

/** Finishes a previously committed save operation, or leaves its journal authoritative if storage still fails. */
export function recoverSaveTransaction(storage) {
  const transaction = readSaveTransaction(storage);
  if (!transaction) return {pending: false, recovered: false};
  try {
    for (const key of SAVE_TRANSACTION_KEYS) {
      if (Object.hasOwn(transaction.changes, key)) storage.setItem(key, transaction.changes[key]);
    }
    storage.removeItem(KEYS.transaction);
    return {pending: false, recovered: true};
  } catch {
    return {pending: true, recovered: false};
  }
}

/**
 * Persists the commit intent first. Once the journal write succeeds, its changes are authoritative;
 * failed mirror writes are repaired on load and must not make the live game disagree with storage.
 */
export function commitSaveTransaction(storage, changes) {
  try {
    const pending = recoverSaveTransaction(storage);
    if (pending.pending) return {ok: false, recoveryPending: true, reason: 'recovery-pending'};
    const committed = {};
    for (const key of SAVE_TRANSACTION_KEYS) {
      if (!Object.hasOwn(changes, key)) continue;
      if (typeof changes[key] !== 'string') return {ok: false, recoveryPending: false, reason: 'invalid'};
      committed[key] = changes[key];
    }
    if (!Object.hasOwn(committed, KEYS.v3) || !Object.hasOwn(committed, KEYS.backup)) return {ok: false, recoveryPending: false, reason: 'invalid'};
    storage.setItem(KEYS.transaction, JSON.stringify({version: SAVE_TRANSACTION_VERSION, changes: committed}));
  } catch {
    return {ok: false, recoveryPending: false, reason: 'storage'};
  }
  try {
    const recovered = recoverSaveTransaction(storage);
    return {ok: true, recoveryPending: recovered.pending};
  } catch {
    // The journal was written, so it remains the durable authority even if a later storage read fails.
    return {ok: true, recoveryPending: true};
  }
}

function create({species, regions, size, bounds = {}, spawn = {x: 12, y: 13}, pack = LEGACY_PACK}) {
  const speciesIndex = id => species.findIndex(s => s.id === id);
  const regionIndex = id => regions.findIndex(r => r.id === id);
  const baseHP = idx => species[idx].stats?.hp ?? species[idx].hp;
  const maxHP = (idx, xp) => baseHP(idx) + Math.floor(xp / XP_PER_LEVEL) * 4;

  function fresh(rng = () => 0) {
    const starter = Math.min(species.length - 1, Math.max(0, Math.floor(rng() * species.length)));
    return {
      version: VERSION,
      region: 0,
      mapId: regions[0].id,
      x: spawn.x,
      y: spawn.y,
      active: starter,
      orbs: 12,
      potions: 3,
      coins: 0,
      seen: [starter],
      caught: [starter],
      team: {[starter]: {xp: 0, hp: baseHP(starter)}},
      badges: [],
      chests: [],
      visited: [0],
      visitedMaps: [regions[0].id],
      met: false,
      wins: 0,
      playTime: 0,
      recap: '',
      goal: '',
      hints: [],
      events: [],
      completed: false,
      battle: null,
      party: [starter],
    };
  }

  // Convert a raw payload (v3/v4 IDs, or legacy indexes when `legacy`) into a fully valid in-memory save, or null.
  function normalize(raw, legacy) {
    if (!isObj(raw)) return null;
    const ref = (v, list, find) => (legacy ? (Number.isInteger(v) && v >= 0 && v < list.length ? v : -1) : typeof v === 'string' ? find(v) : -1);
    const refs = (a, list, find) => [...new Set((Array.isArray(a) ? a : []).map(v => ref(v, list, find)).filter(i => i >= 0))];
    const s = fresh();
    s.caught = refs(raw.caught, species, speciesIndex);
    if (!s.caught.length) s.caught = [0];
    s.seen = [...new Set([...refs(raw.seen, species, speciesIndex), ...s.caught])];
    s.badges = refs(raw.badges, regions, regionIndex);
    s.chests = refs(raw.chests, regions, regionIndex);
    s.visited = [...new Set([0, ...refs(raw.visited, regions, regionIndex)])];
    s.team = {};
    const rawTeam = isObj(raw.team) ? raw.team : {};
    for (const idx of s.caught) {
      const key = legacy ? String(idx) : species[idx].id;
      const rec = isObj(rawTeam[key]) ? rawTeam[key] : {};
      const xp = num(rec.xp, 0, MAX_XP, 0);
      s.team[idx] = {xp, hp: Math.round(num(rec.hp, 0, maxHP(idx, xp), maxHP(idx, xp)))};
    }
    const active = ref(raw.active, species, speciesIndex);
    s.active = s.caught.includes(active) ? active : s.caught[0];
    // Team: stored by species ID. Saves without one (older builds) get the active companion plus the first captures.
    let party = Array.isArray(raw.party) && !legacy ? refs(raw.party, species, speciesIndex) : [s.active, ...s.caught];
    party = [...new Set(party.filter(i => s.caught.includes(i)))].slice(0, PARTY_SIZE);
    if (!party.includes(s.active)) party.length >= PARTY_SIZE ? party.splice(-1, 1, s.active) : party.push(s.active);
    s.party = party;
    for (const [key, def] of [
      ['orbs', 12],
      ['potions', 3],
      ['coins', 0],
    ])
      s[key] = Math.floor(num(raw[key], 0, CAPS[key], def));
    s.wins = Math.floor(num(raw.wins, 0, MAX_COUNT, 0));
    s.playTime = num(raw.playTime, 0, MAX_TIME, 0);
    s.met = raw.met === true;
    s.recap = typeof raw.recap === 'string' ? raw.recap.slice(0, 200) : '';
    s.goal = typeof raw.goal === 'string' && /^[a-z0-9-]{1,40}$/.test(raw.goal) ? raw.goal : ''; // last objective shown; unknown ids are harmless
    s.hints = Array.isArray(raw.hints) ? [...new Set(raw.hints.filter(h => typeof h === 'string' && /^[a-z0-9-]{1,30}$/.test(h)))].slice(0, 30) : [];
    s.events = Array.isArray(raw.events)
      ? [...new Set(raw.events.filter(id => typeof id === 'string' && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)))].slice(0, 256)
      : [];
    s.completed = raw.completed === true;
    s.battle = normalizeBattle(raw.battle, legacy);
    const region = ref(raw.region, regions, regionIndex);
    s.region = region >= 0 && (region === 0 || s.badges.includes(region - 1)) ? region : 0;
    const requestedMapId = typeof raw.mapId === 'string' && MAP_ID.test(raw.mapId) ? raw.mapId : '';
    const requestedMap = requestedMapId ? bounds[requestedMapId] : null;
    s.mapId = requestedMap && (requestedMap.region === undefined || requestedMap.region === s.region) ? requestedMapId : regions[s.region].id;
    const knownMapIds = new Set([...regions.map(r => r.id), ...Object.keys(bounds)]);
    const visitedMapIds = Array.isArray(raw.visitedMaps) ? raw.visitedMaps.filter(id => typeof id === 'string' && MAP_ID.test(id) && knownMapIds.has(id)) : [];
    s.visitedMaps = [...new Set([...s.visited.map(i => regions[i].id), ...visitedMapIds, s.mapId])];
    const map = bounds[s.mapId] ?? bounds[regions[s.region].id] ?? {w: size, h: size, spawn};
    s.x = num(raw.x, 0, map.w - 1, map.spawn?.x ?? spawn.x);
    s.y = num(raw.y, 0, map.h - 1, map.spawn?.y ?? spawn.y);
    return s;
  }

  // An interrupted encounter is kept so a reload resumes it instead of discarding spent items.
  function normalizeBattle(b, legacy) {
    if (legacy || !isObj(b)) return null;
    const id = typeof b.id === 'string' ? speciesIndex(b.id) : -1;
    const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
    if (id < 0 || !intIn(b.level, 1, 99) || !intIn(b.max, 1, 9999) || !intIn(b.hp, 1, b.max) || !intIn(b.turn, 0, 9999)) return null;
    return {
      id,
      hp: b.hp,
      max: b.max,
      level: b.level,
      boss: b.boss === true,
      guard: b.guard === true,
      turn: b.turn,
      focus: intIn(b.focus, 0, FOCUS_MAX) ? b.focus : FOCUS_START,
      tactic: b.boss === true && Object.hasOwn(TACTICS, b.tactic) ? b.tactic : undefined,
      power: b.boss === true && typeof b.power === 'number' && b.power >= 0.5 && b.power <= 3 ? b.power : 1,
    };
  }

  // v1 stored only a few top-level fields; express them as a v2-shaped payload.
  function fromV1(old) {
    if (!isObj(old)) return null;
    const wins = Math.floor(num(old.wins, 0, MAX_COUNT, 0));
    return {seen: old.seen, caught: old.caught, orbs: old.orbs, wins, met: old.met, active: 0, team: {0: {xp: wins * 14, hp: old.hp}}};
  }

  function serialize(save) {
    const sid = i => species[i].id,
      rid = i => regions[i].id;
    const team = {};
    for (const idx of save.caught) team[sid(idx)] = {xp: save.team[idx].xp, hp: save.team[idx].hp};
    return JSON.stringify({
      version: VERSION,
      region: rid(save.region),
      mapId: save.mapId,
      x: save.x,
      y: save.y,
      active: sid(save.active),
      orbs: save.orbs,
      potions: save.potions,
      coins: save.coins,
      seen: save.seen.map(sid),
      caught: save.caught.map(sid),
      team,
      badges: save.badges.map(rid),
      chests: save.chests.map(rid),
      visited: save.visited.map(rid),
      visitedMaps: save.visitedMaps,
      met: save.met,
      wins: save.wins,
      playTime: save.playTime,
      ...(pack === LEGACY_PACK ? {} : {pack}), // the first adventure stays byte-identical to pre-pack saves
      recap: save.recap || '',
      goal: save.goal || '',
      hints: save.hints || [],
      ...(save.events?.length ? {events: save.events} : {}),
      completed: save.completed === true,
      party: save.party.map(sid),
      battle: save.battle ? {...save.battle, id: sid(save.battle.id)} : null,
    });
  }

  function quarantine(storage, key, raw, reason) {
    try {
      let list = [];
      try {
        const prev = JSON.parse(storage.getItem(KEYS.quarantine));
        if (Array.isArray(prev)) list = prev;
      } catch {
        /* no previous quarantine list */
      }
      list.push({key, reason, at: new Date().toISOString(), raw: String(raw).slice(0, 200000)});
      storage.setItem(KEYS.quarantine, JSON.stringify(list.slice(-MAX_QUARANTINE)));
    } catch {
      /* quarantine is best effort */
    }
  }

  /* Returns {save, status, message, writable, source}.
     status: 'new' | 'ok' | 'migrated' | 'restored' | 'recovered' | 'future' | 'foreign' | 'unavailable' | 'transaction-recovered' | 'transaction-pending'
     - restored: primary save was invalid and the last checkpoint was loaded instead.
     - recovered: nothing usable; a fresh save is used and the bad payload is kept under KEYS.quarantine.
     - future: written by a newer game version; it is never overwritten (writable=false).
     - foreign: written for a different adventure pack; never overwritten (writable=false), like a future save.
     - unavailable: storage cannot be read; play continues in memory only (writable=false). */
  function load(storage) {
    const out = {save: fresh(), status: 'new', message: '', writable: true, source: null};
    let transactionRecovery;
    try {
      transactionRecovery = recoverSaveTransaction(storage);
    } catch {
      return {
        ...out,
        status: 'unavailable',
        writable: false,
        message: 'A saved operation could not be read. Keep this tab open and export the current adventure before clearing browser data.',
      };
    }
    const finish = result => {
      if (transactionRecovery.pending)
        return {
          ...result,
          status: 'transaction-pending',
          writable: false,
          message:
            'Your adventure is safely kept in a recovery record, but this browser could not finish synchronizing its save copies. Keep this tab open, export this adventure from Backup & restore, and reload after storage is available.',
        };
      if (transactionRecovery.recovered)
        return {
          ...result,
          status: 'transaction-recovered',
          message: 'Mossvale finished recovering an interrupted save operation. Your adventure and its recovery copies are now synchronized.',
        };
      return result;
    };
    const candidates = [
      [KEYS.v3, null],
      [KEYS.backup, null],
      [KEYS.v2, 2],
      [KEYS.v1, 1],
    ];
    let failed = null;
    for (const [key, version] of candidates) {
      let raw;
      try {
        raw = readSaveItem(storage, key);
      } catch {
        return {
          ...out,
          status: 'unavailable',
          writable: false,
          message: 'Browser storage is unavailable, so progress cannot be saved. Keep this tab open to retain progress.',
        };
      }
      if (raw == null) continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        quarantine(storage, key, raw, 'invalid JSON');
        failed = failed || key;
        continue;
      }
      if (isObj(parsed) && Number.isInteger(parsed.version) && parsed.version > VERSION)
        return finish({
          ...out,
          status: 'future',
          writable: false,
          source: key,
          message: `This save was made by a newer version of Mossvale (schema ${parsed.version}). It was left untouched; progress in this session will not be saved.`,
        });
      if (isObj(parsed) && packOf(parsed) !== pack)
        return finish({
          ...out,
          status: 'foreign',
          writable: false,
          source: key,
          message: `This save belongs to another adventure ("${packOf(parsed)}"), not "${pack}". It was left untouched; progress in this session will not be saved.`,
        });
      const schema = Number.isInteger(parsed?.version) ? parsed.version : version;
      const save =
        schema === 1
          ? normalize(fromV1(parsed), true)
          : schema === 2
            ? isObj(parsed) && parsed.version === 2
              ? normalize(parsed, true)
              : null
            : (schema === 3 || schema === VERSION) && isObj(parsed) && parsed.version === schema
              ? normalize(parsed, false)
              : null;
      if (!save) {
        quarantine(storage, key, raw, 'invalid or unsupported structure');
        failed = failed || key;
        continue;
      }
      out.save = save;
      out.source = key;
      if (key === KEYS.backup) {
        out.status = 'restored';
        out.message = 'Your latest save could not be read, so the previous checkpoint was restored. The damaged data was kept for recovery.';
      } else if (failed) {
        out.status = 'restored';
        out.message = 'Your latest save could not be read, so an older save was restored. The damaged data was kept for recovery.';
      } else if (key === KEYS.v3 && schema === VERSION) {
        out.status = 'ok';
        if (!transactionRecovery.pending && !transactionRecovery.recovered) {
          try {
            storage.setItem(KEYS.backup, raw);
          } catch {
            /* checkpoint is best effort */
          }
        }
      } else out.status = 'migrated';
      return finish(out);
    }
    if (failed) {
      out.status = 'recovered';
      out.message = 'Your saved progress could not be read, so a new adventure was started. The damaged data was kept for recovery and not erased.';
    }
    return finish(out);
  }

  return {fresh, normalize, serialize, load, pack};
}

export {VERSION, KEYS, create, packOf};
