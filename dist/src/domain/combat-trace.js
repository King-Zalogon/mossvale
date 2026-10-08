/* Bounded, opt-in local combat decision trace. It never touches saves, RNG or network APIs. */
export const COMBAT_TRACE_SCHEMA = 'mossvale.combat-trace';
export const COMBAT_TRACE_VERSION = 1;
let traceSequence = 0;

export function createCombatTrace({capacity = 200} = {}) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 2000) throw new RangeError('combat trace capacity must be 1..2000');
  const records = [];
  const createdAt = new Date().toISOString();
  const traceId = `trace-${createdAt.replaceAll(/[^0-9TZ]/g, '')}-${++traceSequence}`;
  let omittedRecords = 0;

  function record(type, data) {
    if (typeof type !== 'string' || !type || !data || typeof data !== 'object' || Array.isArray(data)) return false;
    let copy;
    try {
      copy = structuredClone(data);
      JSON.stringify(copy); // reject cycles and values that cannot be exported as JSON
    } catch {
      return false;
    }
    records.push({...copy, type});
    if (records.length > capacity) {
      records.splice(0, records.length - capacity);
      omittedRecords++;
    }
    return true;
  }

  function safeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
    try {
      const copy = structuredClone(metadata);
      JSON.stringify(copy);
      return copy;
    } catch {
      return {};
    }
  }

  return {
    record,
    read: () => structuredClone(records),
    export: metadata =>
      JSON.stringify(
        {
          schema: COMBAT_TRACE_SCHEMA,
          version: COMBAT_TRACE_VERSION,
          traceId,
          createdAt,
          metadata: safeMetadata(metadata),
          omittedRecords,
          records: structuredClone(records),
        },
        null,
        2,
      ) + '\n',
    clear: () => {
      records.splice(0, records.length);
      omittedRecords = 0;
    },
  };
}
