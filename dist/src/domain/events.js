/* In-memory, versioned gameplay events for local tests and debugging. Nothing is sent or persisted. */
export const GAME_EVENT_SCHEMA = 'mossvale.game-event';
export const GAME_EVENT_VERSION = 1;

export function createEventLog({seed = 0, now = () => 0, capacity = 512} = {}) {
  const prefix = `seed-${Number.isFinite(seed) ? seed >>> 0 : 0}`;
  const records = [];
  let sequence = 0;

  function emit(type, data = {}) {
    if (typeof type !== 'string' || !type) throw new TypeError('event type must be a non-empty string');
    const event = {
      ...data,
      schema: GAME_EVENT_SCHEMA,
      version: GAME_EVENT_VERSION,
      id: `${prefix}-${String(++sequence).padStart(6, '0')}`,
      tick: Math.max(0, Math.floor(now())),
      type,
    };
    records.push(event);
    if (records.length > capacity) records.splice(0, records.length - capacity);
    return event;
  }

  return {
    emit,
    read: () => records.map(event => ({...event})),
    clear: () => records.splice(0, records.length),
  };
}
