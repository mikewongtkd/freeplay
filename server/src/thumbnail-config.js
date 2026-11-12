'use strict';
const path = require('path');
function thumbnailConfig({videoDir, env = process.env, get = (_, fallback) => fallback} = {}) {
  const number = (key, fallback, min, max) => {
    const value = Number(env[key] ?? get(key.toLowerCase(), fallback));
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${key}: expected ${min}..${max}`);
    return value;
  };
  const config = {
    enabled: String(env.THUMBNAILS_ENABLED ?? get('thumbnails_enabled', '1')).match(/^(1|true)$/i) !== null,
    ffmpeg: env.THUMBNAIL_FFMPEG || 'ffmpeg',
    cacheDir: path.resolve(env.THUMBNAIL_CACHE_DIR || path.join(videoDir, 'thumbnails')),
    intervalMs: number('THUMBNAIL_DEFAULT_INTERVAL_MS', 5000, 1000, 60000),
    minIntervalMs: number('THUMBNAIL_MIN_INTERVAL_MS', 1000, 100, 60000),
    maxIntervalMs: number('THUMBNAIL_MAX_INTERVAL_MS', 60000, 1000, 60000),
    width: number('THUMBNAIL_DEFAULT_WIDTH', 240, 80, 480),
    minWidth: number('THUMBNAIL_MIN_WIDTH', 80, 16, 480),
    maxWidth: number('THUMBNAIL_MAX_WIDTH', 480, 80, 960),
    maxSamples: number('THUMBNAIL_MAX_SAMPLES_PER_REQUEST', 120, 1, 240),
    workers: number('THUMBNAIL_WORKERS', 1, 1, 4),
    queueMax: number('THUMBNAIL_QUEUE_MAX', 256, 1, 1024),
    perCameraQueue: number('THUMBNAIL_PER_CAMERA_QUEUE', 32, 1, 256),
    timeoutMs: number('THUMBNAIL_JOB_TIMEOUT_MS', 10000, 100, 30000),
    toleranceMs: number('THUMBNAIL_TOLERANCE_MS', 1500, 0, 5000),
    cacheBytes: number('THUMBNAIL_CACHE_MAX_BYTES', 1024 * 1024 * 1024, 1024, 16 * 1024 ** 3),
    cacheEntries: number('THUMBNAIL_CACHE_MAX_ENTRIES', 100000, 1, 1000000),
    maxInputBytes: number('THUMBNAIL_MAX_INPUT_BYTES', 16 * 1024 * 1024, 1024, 64 * 1024 * 1024),
    maxImageBytes: 512 * 1024,
    maxSourcePixels: number('THUMBNAIL_MAX_SOURCE_PIXELS', 3840 * 2160, 1, 7680 * 4320),
    maxPendingRequests: 16,
    requestTimeoutMs: 15000,
  };
  if (config.minIntervalMs > config.intervalMs || config.intervalMs > config.maxIntervalMs || config.minWidth > config.width || config.width > config.maxWidth)
    throw new Error('Thumbnail defaults must be inside configured bounds');
  return config;
}
module.exports = {thumbnailConfig};
