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
  const capabilities = validateCapabilities(o.capabilities);
  const streamState = o.streamState == null ? 'streaming' : enumValue(o.streamState, 'streamState', ['idle','starting','streaming','stopping','error'], 'invalid_hello');
  return {
    streamId:o.streamId, ring, camera, device:String(o.device || ''), manufacturer:String(o.manufacturer || ''),
    androidVersion:String(o.androidVersion || ''), appVersion:String(o.appVersion || ''), codec:'h264',
    width:integer(o.width, 'width', 1, 16384), height:integer(o.height, 'height', 1, 16384),
    fps:positive(o.fps, 'fps'), bitrate:positive(o.bitrate, 'bitrate'),
    keyframeInterval:positive(o.keyframeInterval, 'keyframeInterval'), encoder:String(o.encoder || ''),
    streamState, streamGeneration:optionalInteger(o.streamGeneration, 'streamGeneration', 0, Number.MAX_SAFE_INTEGER, 'invalid_hello'),
    remoteControlEnabled:o.remoteControlEnabled !== false, capabilities
  };
}

function validateCapabilities(value) {
  if (value == null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new ProtocolError('invalid_hello', 'capabilities must be an object');
  const allowed = ['remoteStreamingControl','remoteStop','requestKeyframe','setBitrate','commandAcknowledgement','streamGeneration'];
  const result = {};
  for (const key of allowed) if (value[key] !== undefined) {
    if (typeof value[key] !== 'boolean') throw new ProtocolError('invalid_hello', `capabilities.${key} must be boolean`);
    result[key] = value[key];
  }
  return result;
}

function optionalInteger(value, name, min, max, code = 'invalid_control_message') {
  if (value == null) return null;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new ProtocolError(code, `${name} must be an integer from ${min} to ${max}`);
  return value;
}

function enumValue(value, name, values, code = 'invalid_control_message') {
  if (typeof value !== 'string' || !values.includes(value)) throw new ProtocolError(code, `${name} is invalid`);
  return value;
}

function safeString(value, name, {required=false,max=256,pattern=null}={}) {
  if (value == null && !required) return null;
  if (typeof value !== 'string' || !value.length || value.length > max || (pattern && !pattern.test(value))) throw new ProtocolError('invalid_control_message', `${name} is invalid`);
  return value;
}

function validateCameraControlMessage(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new ProtocolError('invalid_control_message', 'Control message must be an object');
  const commandId = safeString(o.commandId, 'commandId', {required:o.type !== 'stream_stopped', max:128, pattern:/^[\x21-\x7e]+$/});
  const streamState = o.streamState == null ? null : enumValue(o.streamState, 'streamState', ['idle','starting','streaming','stopping','error']);
  switch (o.type) {
    case 'command_ack':
      if (o.commandType !== 'set_streaming' || typeof o.accepted !== 'boolean') throw new ProtocolError('invalid_control_message', 'Invalid command acknowledgement');
      return {type:o.type,commandId,commandType:o.commandType,accepted:o.accepted,streamState,alreadyInDesiredState:o.alreadyInDesiredState===true,reason:safeString(o.reason,'reason'),retryable:o.retryable===true};
    case 'stream_started': {
      const generation=optionalInteger(o.streamGeneration,'streamGeneration',1,Number.MAX_SAFE_INTEGER), width=optionalInteger(o.width,'width',1,16384), height=optionalInteger(o.height,'height',1,16384), bitrate=optionalInteger(o.bitrate,'bitrate',1,Number.MAX_SAFE_INTEGER), fps=Number(o.fps), keyframeInterval=Number(o.keyframeInterval);
      if(generation==null||width==null||height==null||bitrate==null||String(o.codec).toLowerCase()!=='h264'||!Number.isFinite(fps)||fps<=0||!Number.isFinite(keyframeInterval)||keyframeInterval<=0)throw new ProtocolError('invalid_control_message','stream_started media fields are incomplete or invalid');
      return {type:o.type,commandId,streamGeneration:generation,streamState:streamState||'streaming',codec:'h264',width,height,fps,bitrate,keyframeInterval,encoder:safeString(o.encoder,'encoder',{max:256}),ptsOriginUs:safeString(o.ptsOriginUs,'ptsOriginUs',{max:32,pattern:/^-?\d+$/}),startedAtTabletMonotonicNs:safeString(o.startedAtTabletMonotonicNs,'startedAtTabletMonotonicNs',{max:32,pattern:/^\d+$/})};
    }
    case 'stream_start_failed':
      return {type:o.type,commandId,streamGeneration:optionalInteger(o.streamGeneration,'streamGeneration',0,Number.MAX_SAFE_INTEGER),streamState:streamState||'error',reason:safeString(o.reason,'reason',{required:true,max:128,pattern:/^[a-z0-9_]+$/}),message:safeString(o.message,'message',{max:512}),retryable:o.retryable===true};
    case 'stream_stopped':
      return {type:o.type,commandId,streamGeneration:optionalInteger(o.streamGeneration,'streamGeneration',0,Number.MAX_SAFE_INTEGER),streamState:streamState||'idle',reason:safeString(o.reason,'reason',{max:128,pattern:/^[a-z0-9_]+$/}),finalSequenceNumber:optionalInteger(o.finalSequenceNumber,'finalSequenceNumber',0,0xffffffff),stoppedAtTabletMonotonicNs:safeString(o.stoppedAtTabletMonotonicNs,'stoppedAtTabletMonotonicNs',{max:32,pattern:/^\d+$/})};
    default: throw new ProtocolError('unknown_message', 'Unknown control message type');
  }
}

function sequenceDelta(previous, current) { return (current - previous) >>> 0; }

module.exports = { FP_HEADER_SIZE, FP_MAGIC, BUFFER_FLAG_KEY_FRAME, BUFFER_FLAG_CODEC_CONFIG, BUFFER_FLAG_END_OF_STREAM, ProtocolError, parseFpv1Binary, validateHello, validateCameraControlMessage, sequenceDelta };
