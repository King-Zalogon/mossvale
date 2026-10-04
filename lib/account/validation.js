import {ApiError} from './http.js';

export const validId = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_-]{0,99}$/.test(value);
export function feedbackInput(value) {
  if (!value || typeof value !== 'object' || typeof value.message !== 'string') throw new ApiError(400, 'Please write some feedback.');
  const message = value.message.trim();
  if ([...message].length < 1 || [...message].length > 2000) throw new ApiError(400, 'Feedback must contain 1–2,000 characters.');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId ?? '') ||
    !validId(value.packId) ||
    (value.mapId != null && !validId(value.mapId)) ||
    (value.build != null && (typeof value.build !== 'string' || value.build.length > 100))
  )
    throw new ApiError(400, 'The feedback context is not valid.');
  return {p_request_id: value.requestId, p_message: message, p_pack_id: value.packId, p_map_id: value.mapId ?? null, p_build: value.build ?? null};
}

export function saveInput(value) {
  if (
    !value ||
    !validId(value.packId) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    value.backup?.kind !== 'mossvale-save-backup' ||
    value.backup.format !== 1 ||
    (value.backup.save?.pack ?? 'mossvale') !== value.packId ||
    !Number.isInteger(value.backup.save.version) ||
    new TextEncoder().encode(JSON.stringify(value.backup)).length > 1000000
  )
    throw new ApiError(400, 'That account save is not valid.');
  return {p_pack_id: value.packId, p_backup: value.backup, p_revision: value.revision};
}
