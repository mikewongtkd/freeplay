'use strict';
const crypto = require('crypto');
function invalid(message) { return Object.assign(new Error(message), {code:'invalid_request', status:400}); }
function planRequest(params, config, maxRings = 14, camerasPerRing = 3) {
  const integer = (key, fallback, min, max) => {
    const raw = params.get(key) ?? fallback;
    if (!/^\d+$/.test(String(raw))) throw invalid(`${key} must be an integer`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw invalid(`${key} is outside the allowed range`);
    return value;
  };
  const epoch = key => {
    const raw = params.get(key);
    if (!raw || !/^\d{1,19}$/.test(raw)) throw invalid(`${key} must be a decimal epoch-microsecond string`);
    const value = BigInt(raw);
    if (value <= 0n || value > 9223372036854775807n) throw invalid(`${key} is outside SQLite timestamp bounds`);
    return value;
  };
  const ring = integer('ring', '', 1, maxRings), camera = integer('camera', '', 1, camerasPerRing);
  const start = epoch('startEpochUs'), end = epoch('endEpochUs');
  const intervalMs = integer('intervalMs', config.intervalMs, config.minIntervalMs, config.maxIntervalMs);
  const width = integer('width', config.width, config.minWidth, config.maxWidth);
  const step = BigInt(intervalMs) * 1000n;
  if (end <= start || (end - start + step - 1n) / step > BigInt(config.maxSamples)) throw invalid('Invalid range or excessive sample count');
  const times = [];
  for (let time = start; time < end; time += step) times.push(String(time));
  return {ring, camera, streamId:`ring${ring}_cam${camera}`, startEpochUs:String(start), endEpochUs:String(end), intervalMs, width, times};
}
function sourceKey(row, width) {
  return crypto.createHash('sha256').update(JSON.stringify([
    'jpeg-keyframe-v1', String(row.camera_id), String(row.session_id), String(row.file_id),
    String(row.codec_config_version), String(row.id), String(row.start_time_epoch_us),
    row.start_pts_us, row.path, String(row.file_offset), String(row.file_length), width,
  ])).digest('hex');
}
module.exports = {planRequest, sourceKey};
