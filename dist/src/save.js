/* Mossvale save codec: validation, v1-v4 -> v5 migration, quarantine and checkpoints.
   Pure functions over a Storage-like object so it can be tested without a browser.
   In memory the game keeps species/region *indexes*; on disk it stores stable string IDs. */
import {CAPS} from './data/economy.js';
import {TACTICS} from './data/tactics.js';
import {decodeEntry, encodeEntry} from './domain/discovery.js';
import {inventoryToSupplies, suppliesToInventory, validateInventoryRules} from './domain/inventory.js';
import {FOCUS_MAX, FOCUS_START, MAX_XP, PARTY_SIZE, XP_PER_LEVEL} from './config.js';

const VERSION = 5;
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

/**
 * The storage keys of one adventure's progress (docs/PACKS.md, "Independent adventure saves"). The first adventure
 * keeps the original key names, so its saves never move and older builds still find them; every other pack gets
 * its own set. A save, its checkpoint, its archive, its quarantine and its recovery journal always share a pack.
 */
function keysFor(pack = LEGACY_PACK) {
  if (pack === LEGACY_PACK) return KEYS;
  const base = `mossvale-pack-${pack}`;
  return {
    v3: `${base}-v3`,
    v2: null,
    v1: null,
    backup: `${base}-backup`,
    transaction: `${base}-save-transaction`,
    quarantine: `${base}-quarantine`,
    archive: `${base}-archive`,
  };
}
const transactionKeys = keys => [keys.archive, keys.v3, keys.backup];
const MAX_COUNT = 9999,
  MAX_TIME = 1e9,
  MAX_QUARANTINE = 3;
const MAP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v, min, max, def) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def);

/** The adventure a raw save belongs to: saves written before packs existed are the first adventure. */
const packOf = raw => (isObj(raw) && typeof raw.pack === 'string' ? raw.pack : LEGACY_PACK);

function readSaveTransaction(storage, keys = KEYS) {
  const raw = storage.getItem(keys.transaction);
  if (raw == null) return null;
  const transaction = JSON.parse(raw);
  if (!isObj(transaction) || transaction.version !== SAVE_TRANSACTION_VERSION || !isObj(transaction.changes)) throw new Error('Invalid save transaction');
  const changes = {};
  for (const key of transactionKeys(keys)) {
    if (!Object.hasOwn(transaction.changes, key)) continue;
    if (typeof transaction.changes[key] !== 'string') throw new Error('Invalid save transaction value');
    changes[key] = transaction.changes[key];
  }
  if (!Object.keys(changes).length || !Object.hasOwn(changes, keys.v3) || !Object.hasOwn(changes, keys.backup)) throw new Error('Incomplete save transaction');
  return {version: SAVE_TRANSACTION_VERSION, changes};
}

/** Reads a save-related value from the durable transaction intent while its mirror writes are pending. */
export function readSaveItem(storage, key, keys = KEYS) {
  const transaction = readSaveTransaction(storage, keys);
  return transaction && Object.hasOwn(transaction.changes, key) ? transaction.changes[key] : storage.getItem(key);
}

/** Finishes a previously committed save operation, or leaves its journal authoritative if storage still fails. */
export function recoverSaveTransaction(storage, keys = KEYS) {
  const transaction = readSaveTransaction(storage, keys);
  if (!transaction) return {pending: false, recovered: false};
  try {
    for (const key of transactionKeys(keys)) {
      if (Object.hasOwn(transaction.changes, key)) storage.setItem(key, transaction.changes[key]);
    }
    storage.removeItem(keys.transaction);
    return {pending: false, recovered: true};
  } catch {
    return {pending: true, recovered: false};
  }
}

/**
 * Persists the commit intent first. Once the journal write succeeds, its changes are authoritative;
 * failed mirror writes are repaired on load and must not make the live game disagree with storage.
 */
export function commitSaveTransaction(storage, changes, keys = KEYS) {
  try {
    const pending = recoverSaveTransaction(storage, keys);
    if (pending.pending) return {ok: false, recoveryPending: true, reason: 'recovery-pending'};
    const committed = {};
    for (const key of transactionKeys(keys)) {
      if (!Object.hasOwn(changes, key)) continue;
      if (typeof changes[key] !== 'string') return {ok: false, recoveryPending: false, reason: 'invalid'};
      committed[key] = changes[key];
    }
    if (!Object.hasOwn(committed, keys.v3) || !Object.hasOwn(committed, keys.backup)) return {ok: false, recoveryPending: false, reason: 'invalid'};
    storage.setItem(keys.transaction, JSON.stringify({version: SAVE_TRANSACTION_VERSION, changes: committed}));
  } catch {
    return {ok: false, recoveryPending: false, reason: 'storage'};
  }
  try {
    const recovered = recoverSaveTransaction(storage, keys);
    return {ok: true, recoveryPending: recovered.pending};
  } catch {
    // The journal was written, so it remains the durable authority even if a later storage read fails.
    return {ok: true, recoveryPending: true};
  }
}

function create({species, regions, size, bounds = {}, spawn = {x: 12, y: 13}, pack = LEGACY_PACK, contentVersion = 1, inventoryRules}) {
  if (inventoryRules && validateInventoryRules(inventoryRules).length)
    throw new Error(`Invalid inventory rules: ${validateInventoryRules(inventoryRules).join(' · ')}`);
  const keys = keysFor(pack);
  const speciesIndex = id => species.findIndex(s => s.id === id);
  const regionIndex = id => regions.findIndex(r => r.id === id);
  const baseHP = idx => species[idx].stats?.hp ?? species[idx].hp;
  const maxHP = (idx, xp) => baseHP(idx) + Math.floor(xp / XP_PER_LEVEL) * 4;

  function fresh(rng = () => 0) {
    const starter = Math.min(species.length - 1, Math.max(0, Math.floor(rng() * species.length)));
    const save = {
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
      mapFlags: [],
      visited: [0],
      visitedMaps: [regions[0].id],
      met: false,
      wins: 0,
      playTime: 0,
      recap: '',
      goal: '',
      hints: [],
      events: [],
      explored: {},
      completed: false,
      battle: null,
      party: [starter],
      ...(pack === LEGACY_PACK ? {} : {contentVersion}),
    };
    if (inventoryRules) {
      save.inventory = suppliesToInventory(save, inventoryRules);
      Object.assign(save, inventoryToSupplies(save.inventory, save, inventoryRules));
    }
    return save;
  }

  function normalizeInventory(raw, supplies) {
    if (!inventoryRules) return raw === undefined ? undefined : null;
    if (raw === undefined) return suppliesToInventory(supplies, inventoryRules);
    if (!isObj(raw) || !isObj(raw.bag) || !isObj(raw.storage) || !Number.isInteger(raw.coins) || raw.coins < 0 || raw.coins > MAX_COUNT) return null;
    const supplyItems = new Set(Object.values(inventoryRules.supplies ?? {}));
    const counts = (source, limit, ignored = new Set()) => {
      let total = 0;
      const result = {};
      for (const [id, quantity] of Object.entries(source)) {
        if (ignored.has(id)) continue;
        if (!inventoryRules.items[id] || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_COUNT) return null;
        total += quantity;
        if (total > limit) return null;
        result[id] = quantity;
      }
      return result;
    };
    const bag = counts(raw.bag, inventoryRules.carryCap, supplyItems);
    const storage = counts(raw.storage, inventoryRules.storageCap);
    if (!bag || !storage) return null;
    let room = inventoryRules.carryCap - Object.values(bag).reduce((total, quantity) => total + quantity, 0);
    for (const [field, item] of Object.entries(inventoryRules.supplies ?? {})) {
      const quantity = Math.min(supplies[field] ?? 0, room);
      if (quantity > 0) bag[item] = quantity;
      room -= quantity;
    }
    const claimEntries = isObj(raw.claimed) ? Object.entries(raw.claimed) : [];
    if (claimEntries.length > 256 || claimEntries.some(([key, value]) => !/^[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(key) || value !== true)) return null;
    return {bag, storage, coins: raw.coins, claimed: Object.fromEntries(claimEntries)};
  }

  /**
   * A data update may add content freely, but removing or renaming an ID already used by a save is unsafe.
   * Refuse to normalize such a save so its original bytes and checkpoint remain available for recovery.
   */
  function contentIssue(raw) {
    if (!isObj(raw)) return null;
    if (raw.inventory !== undefined && !inventoryRules)
      return 'This save contains pack inventory, but the installed adventure does not provide its item rules.';
    if (raw.inventory !== undefined && inventoryRules) {
      const itemIds = [...Object.keys(raw.inventory?.bag ?? {}), ...Object.keys(raw.inventory?.storage ?? {})];
      const missingItem = itemIds.find(id => !inventoryRules.items[id]);
      if (missingItem) return `This save contains item ID "${missingItem}", which the installed adventure no longer defines.`;
    }
    if (raw.contentVersion !== undefined && (!Number.isInteger(raw.contentVersion) || raw.contentVersion < 1))
      return 'The save has an invalid adventure content version.';
    const savedContentVersion = raw.contentVersion ?? 1;
    if (savedContentVersion > contentVersion)
      return `This save uses adventure content version ${savedContentVersion}, newer than the installed version ${contentVersion}. Its save and checkpoint were left untouched; restore the matching complete game build to continue.`;
    if (savedContentVersion === contentVersion) return null;
    const schema = Number.isInteger(raw.version) ? raw.version : 0;
    if (schema < 3) return null; // Older saves contain array indexes; their existing schema migration remains authoritative.
    const unsupported = (value, find, field) => {
      if (!Array.isArray(value)) return null;
      const missing = value.find(id => typeof id === 'string' && find(id) < 0);
      return missing ? `This save refers to ${field} ID "${missing}", which the installed adventure content no longer has.` : null;
    };
    const regionIds = new Set(regions.map(region => region.id));
    const mapIds = new Set([...regionIds, ...Object.keys(bounds)]);
    const speciesIds = new Set(species.map(entry => entry.id));
    const missingRegion = value =>
      typeof value === 'string' && !regionIds.has(value)
        ? `This save refers to region ID "${value}", which the installed adventure content no longer has.`
        : null;
    const missingMap = value =>
      typeof value === 'string' && !mapIds.has(value) ? `This save refers to map ID "${value}", which the installed adventure content no longer has.` : null;
    const missingSpecies = value =>
      typeof value === 'string' && !speciesIds.has(value)
        ? `This save refers to creature ID "${value}", which the installed adventure content no longer has.`
        : null;
    const missingEventMap = Array.isArray(raw.events)
      ? raw.events.find(key => typeof key === 'string' && /^[a-z0-9-]+\/[a-z0-9-]+$/.test(key) && !mapIds.has(key.split('/')[0]))
      : null;
    const issue =
      missingRegion(raw.region) ||
      missingMap(raw.mapId) ||
      (Array.isArray(raw.mapFlags) ? raw.mapFlags.map(flag => (typeof flag === 'string' ? missingMap(flag.split('.')[0]) : null)).find(Boolean) : null) ||
      missingSpecies(raw.active) ||
      unsupported(raw.visited, id => (regionIds.has(id) ? 1 : -1), 'visited region') ||
      unsupported(raw.badges, id => (regionIds.has(id) ? 1 : -1), 'region') ||
      unsupported(raw.chests, id => (regionIds.has(id) ? 1 : -1), 'region') ||
      unsupported(raw.visitedMaps, id => (mapIds.has(id) ? 1 : -1), 'visited map') ||
      unsupported(raw.caught, id => (speciesIds.has(id) ? 1 : -1), 'caught creature') ||
      unsupported(raw.seen, id => (speciesIds.has(id) ? 1 : -1), 'seen creature') ||
      unsupported(raw.party, id => (speciesIds.has(id) ? 1 : -1), 'party creature') ||
      missingSpecies(raw.battle?.id) ||
      (missingEventMap
        ? `This save refers to story event "${missingEventMap}", which belongs to a map the installed adventure content no longer has.`
        : null) ||
      (isObj(raw.team) ? Object.keys(raw.team).map(missingSpecies).find(Boolean) : null);
    return issue ? `${issue} The save and checkpoint were left untouched; restore the matching complete game build to continue.` : null;
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
    const mapIds = new Set([...regions.map(r => r.id), ...Object.keys(bounds)]);
    s.mapFlags = [
      ...new Set(
        (Array.isArray(raw.mapFlags) ? raw.mapFlags : []).filter(
          flag => typeof flag === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*\.(seal|chest)$/.test(flag) && mapIds.has(flag.split('.')[0]),
        ),
      ),
    ].slice(0, 256);
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
    ]) {
      const packLimit = inventoryRules && raw.inventory !== undefined && (key === 'orbs' || key === 'potions') ? inventoryRules.carryCap : CAPS[key];
      s[key] = Math.floor(num(raw[key], 0, packLimit, def));
    }
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
    s.explored = {}; // what the map screens show: optional, bounded, and checked against each map's size (domain/discovery.js)
    if (isObj(raw.explored) && !legacy) {
      for (const [id, entry] of Object.entries(raw.explored).slice(0, 32)) {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) continue;
        const dims = bounds[id];
        if (!dims && Object.keys(bounds).length) continue; // a map this adventure no longer has
        const decoded = decodeEntry(entry, dims && Number.isInteger(dims.w) && Number.isInteger(dims.h) ? dims : null);
        if (decoded) s.explored[id] = decoded;
      }
    }
    s.battle = normalizeBattle(raw.battle, legacy);
    const region = ref(raw.region, regions, regionIndex);
    s.region = region >= 0 && (region === 0 || s.badges.includes(region - 1)) ? region : 0;
    const requestedMapId = typeof raw.mapId === 'string' && MAP_ID.test(raw.mapId) ? raw.mapId : '';
    const requestedMap = requestedMapId ? bounds[requestedMapId] : null;
    s.mapId = requestedMap && (requestedMap.region === undefined || requestedMap.region === s.region) ? requestedMapId : regions[s.region].id;
    const knownMapIds = new Set([...regions.map(r => r.id), ...Object.keys(bounds)]);
    const visitedMapIds = Array.isArray(raw.visitedMaps) ? raw.visitedMaps.filter(id => typeof id === 'string' && MAP_ID.test(id) && knownMapIds.has(id)) : [];
    s.visitedMaps = [...new Set([...s.visited.map(i => regions[i].id), ...visitedMapIds, s.mapId])];
    if (inventoryRules) {
      const inventory = normalizeInventory(raw.inventory, s);
      if (!inventory) return null;
      s.inventory = inventory;
      s.inventory.coins = s.coins;
      for (const [field, item] of Object.entries(inventoryRules.supplies ?? {})) s[field] = inventory.bag[item] ?? 0;
    }
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
    return {
      seen: old.seen,
      caught: old.caught,
      orbs: old.orbs,
      potions: old.potions,
      coins: old.coins,
      wins,
      met: old.met,
      active: 0,
      team: {0: {xp: wins * 14, hp: old.hp}},
    };
  }

  function exploredField(save) {
    const out = {};
    for (const [id, entry] of Object.entries(save.explored ?? {})) {
      const encoded = encodeEntry(entry);
      if (encoded) out[id] = encoded;
    }
    return Object.keys(out).length ? {explored: out} : {};
  }

  function serialize(save) {
    const sid = i => species[i].id,
      rid = i => regions[i].id;
    const team = {};
    for (const idx of save.caught) team[sid(idx)] = {xp: save.team[idx].xp, hp: save.team[idx].hp};
    const inventory = save.inventory && inventoryRules ? structuredClone(save.inventory) : undefined;
    if (inventory) {
      inventory.coins = save.coins;
      for (const [field, item] of Object.entries(inventoryRules.supplies ?? {})) {
        if (save[field] > 0) inventory.bag[item] = save[field];
        else delete inventory.bag[item];
      }
    }
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
      ...(inventory ? {inventory} : {}),
      seen: save.seen.map(sid),
      caught: save.caught.map(sid),
      team,
      badges: save.badges.map(rid),
      chests: save.chests.map(rid),
      ...(save.mapFlags?.length ? {mapFlags: save.mapFlags} : {}),
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
      ...exploredField(save),
      completed: save.completed === true,
      party: save.party.map(sid),
      battle: save.battle ? {...save.battle, id: sid(save.battle.id)} : null,
      ...(pack === LEGACY_PACK ? {} : {contentVersion}),
    });
  }

  function quarantine(storage, key, raw, reason) {
    try {
      let list = [];
      try {
        const prev = JSON.parse(storage.getItem(keys.quarantine));
        if (Array.isArray(prev)) list = prev;
      } catch {
        /* no previous quarantine list */
      }
      list.push({key, reason, at: new Date().toISOString(), raw: String(raw).slice(0, 200000)});
      storage.setItem(keys.quarantine, JSON.stringify(list.slice(-MAX_QUARANTINE)));
    } catch {
      /* quarantine is best effort */
    }
  }

  /* Returns {save, status, message, writable, source}.
     status: 'new' | 'ok' | 'migrated' | 'restored' | 'recovered' | 'future' | 'foreign' | 'incompatible' | 'unavailable' | 'transaction-recovered' | 'transaction-pending'
     - restored: primary save was invalid and the last checkpoint was loaded instead.
     - recovered: nothing usable; a fresh save is used and the bad payload is kept under keys.quarantine.
     - future: written by a newer game version; it is never overwritten (writable=false).
     - foreign: written for a different adventure pack; never overwritten (writable=false), like a future save.
     - unavailable: storage cannot be read; play continues in memory only (writable=false). */
  function load(storage) {
    const out = {save: fresh(), status: 'new', message: '', writable: true, source: null};
    let transactionRecovery;
    try {
      transactionRecovery = recoverSaveTransaction(storage, keys);
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
      [keys.v3, null],
      [keys.backup, null],
      [keys.v2, 2],
      [keys.v1, 1],
    ].filter(([key]) => key); // only the first adventure has older save generations
    let failed = null;
    for (const [key, version] of candidates) {
      let raw;
      try {
        raw = readSaveItem(storage, key, keys);
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
      const contentProblem = contentIssue(parsed);
      if (contentProblem)
        return finish({
          ...out,
          status: 'incompatible',
          writable: false,
          source: key,
          raw,
          message: contentProblem,
        });
      const schema = Number.isInteger(parsed?.version) ? parsed.version : version;
      const save =
        schema === 1
          ? normalize(fromV1(parsed), true)
          : schema === 2
            ? isObj(parsed) && parsed.version === 2
              ? normalize(parsed, true)
              : null
            : (schema === 3 || schema === 4 || schema === VERSION) && isObj(parsed) && parsed.version === schema
              ? normalize(parsed, false)
              : null;
      if (!save) {
        quarantine(storage, key, raw, 'invalid or unsupported structure');
        failed = failed || key;
        continue;
      }
      out.save = save;
      out.source = key;
      if (key === keys.backup) {
        out.status = 'restored';
        out.message = 'Your latest save could not be read, so the previous checkpoint was restored. The damaged data was kept for recovery.';
      } else if (failed) {
        out.status = 'restored';
        out.message = 'Your latest save could not be read, so an older save was restored. The damaged data was kept for recovery.';
      } else if (key === keys.v3 && schema === VERSION) {
        out.status = 'ok';
        if (!transactionRecovery.pending && !transactionRecovery.recovered) {
          try {
            storage.setItem(keys.backup, raw);
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

  return {fresh, normalize, serialize, load, pack, keys, contentVersion, contentIssue};
}

export {VERSION, KEYS, create, keysFor, packOf, LEGACY_PACK};
