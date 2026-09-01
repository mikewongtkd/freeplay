'use strict';

const FP_HEADER_SIZE = 32;
const FP_MAGIC = Buffer.from('FPV1');
const BUFFER_FLAG_KEY_FRAME = 1;
const BUFFER_FLAG_CODEC_CONFIG = 2;
const BUFFER_FLAG_END_OF_STREAM = 4;

class ProtocolError extends Error {
  constructor(code, message) { super(message); this.name = 'ProtocolError'; this.code = code; }
}

function parseFpv1Binary(value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (buf.length < FP_HEADER_SIZE) throw new ProtocolError('frame_too_short', 'FPV1 message is shorter than 32 bytes');
  if (!buf.subarray(0, 4).equals(FP_MAGIC)) throw new ProtocolError('invalid_magic', 'Invalid FPV1 magic');
  const payloadLength = buf.readUInt32BE(20);
  if (buf.length !== FP_HEADER_SIZE + payloadLength) throw new ProtocolError('payload_length_mismatch', 'FPV1 payload length does not match message size');
  return {
    ptsUs: buf.readBigInt64BE(4), sequence: buf.readUInt32BE(12), flags: buf.readUInt32BE(16),
    payloadLength, tabletTimestampNs: buf.readBigUInt64BE(24), payload: buf.subarray(FP_HEADER_SIZE)
  };
}

function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new ProtocolError('invalid_hello', `${name} must be an integer from ${min} to ${max}`);
  return value;
}

function positive(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) throw new ProtocolError('invalid_hello', `${name} must be positive`);
  return n;
}

function validateHello(o, options = {}) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new ProtocolError('invalid_hello', 'hello must be a JSON object');
  if (o.type !== 'hello') throw new ProtocolError('expected_hello', 'First message must be hello');
  if (o.protocol !== 'freeplay-ingest') throw new ProtocolError('unsupported_protocol', 'protocol must be freeplay-ingest');
  if (o.version !== 1) throw new ProtocolError('unsupported_version', 'Only protocol version 1 is supported');
  if (typeof o.streamId !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/.test(o.streamId)) throw new ProtocolError('invalid_hello', 'streamId is missing or invalid');
  const maxRings = options.maxRings || 14, camerasPerRing = options.camerasPerRing || 3;
  const ring = integer(o.ring, 'ring', 1, maxRings), camera = integer(o.camera, 'camera', 1, camerasPerRing);
  if (options.requireDeterministicId !== false && o.streamId !== `ring${ring}_cam${camera}`) throw new ProtocolError('invalid_hello', 'streamId does not match ring/camera');
  if (String(o.codec).toLowerCase() !== 'h264') throw new ProtocolError('unsupported_codec', 'codec must be h264');
  return {
    streamId:o.streamId, ring, camera, device:String(o.device || ''), manufacturer:String(o.manufacturer || ''),
    androidVersion:String(o.androidVersion || ''), appVersion:String(o.appVersion || ''), codec:'h264',
    width:integer(o.width, 'width', 1, 16384), height:integer(o.height, 'height', 1, 16384),
    fps:positive(o.fps, 'fps'), bitrate:positive(o.bitrate, 'bitrate'),
    keyframeInterval:positive(o.keyframeInterval, 'keyframeInterval'), encoder:String(o.encoder || '')
  };
}

function sequenceDelta(previous, current) { return (current - previous) >>> 0; }

module.exports = { FP_HEADER_SIZE, FP_MAGIC, BUFFER_FLAG_KEY_FRAME, BUFFER_FLAG_CODEC_CONFIG, BUFFER_FLAG_END_OF_STREAM, ProtocolError, parseFpv1Binary, validateHello, sequenceDelta };
