'use strict';

const crypto = require('crypto');
const WebSocket = require('ws');

const DEFAULTS = {ackTimeoutMs:2000,startTimeoutMs:10000,stopTimeoutMs:5000,retentionMs:120000,rateLimitMs:2000};

class ControlError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}

class CameraStreamCommandService {
  constructor({liveStreams, events, audit=()=>{}, config={}}) {
    this.liveStreams=liveStreams; this.events=events; this.audit=audit; this.config={...DEFAULTS,...config};
    this.commands=new Map(); this.requests=new Map(); this.subscribers=new Set(); this.disconnected=new Map();
  }

  cameraView(state) {
    const caps=state.hello.capabilities||{}, active=state.activeCommandId?this.commands.get(state.activeCommandId):null;
    return {streamId:state.streamId,ring:state.hello.ring,camera:state.hello.camera,connected:true,
      streamState:state.streamState||'streaming',streamGeneration:state.streamGeneration||0,
      remoteStartSupported:caps.remoteStreamingControl===true,remoteStopSupported:caps.remoteStreamingControl===true&&caps.remoteStop===true,
      remoteControlEnabled:state.remoteControlEnabled!==false,lastStatusAt:state.lastStatusAt?new Date(state.lastStatusAt).toISOString():null,
      mediaReady:state.mediaReady===true,lastError:state.lastControlError||null,
      lastCommand:active?this.publicCommand(active):state.lastCommand?this.publicCommand(state.lastCommand):null};
  }

  publicCommand(c) { return {commandId:c.commandId,requestId:c.requestId||null,desired:c.desired,state:c.state,requestedAt:new Date(c.requestedAt).toISOString(),acknowledgedAt:c.acknowledgedAt?new Date(c.acknowledgedAt).toISOString():null,completedAt:c.completedAt?new Date(c.completedAt).toISOString():null,failureReason:c.failureReason||null,retryable:c.retryable===true}; }
  register(state){this.disconnected.delete(state.streamId);}
  rememberDisconnected(camera){if(!camera?.streamId)return;this.disconnected.set(camera.streamId,{streamId:camera.streamId,ring:camera.ring,camera:camera.camera,connected:false,streamState:'disconnected',streamGeneration:0,remoteStartSupported:false,remoteStopSupported:false,remoteControlEnabled:false,lastStatusAt:camera.lastStatusAt||null,mediaReady:false,lastError:null,lastCommand:null});}
  list({ring}={}) { const connected=[...this.liveStreams.values()].filter(s=>ring==null||s.hello.ring===ring).map(s=>this.cameraView(s));const ids=new Set(connected.map(x=>x.streamId));return connected.concat([...this.disconnected.values()].filter(x=>!ids.has(x.streamId)&&(ring==null||x.ring===ring))); }
  get(streamId) { const state=this.liveStreams.get(streamId); return state?this.cameraView(state):this.disconnected.get(streamId)||null; }

  subscribe(ws) { this.subscribers.add(ws); ws.once('close',()=>this.subscribers.delete(ws)); this.send(ws,{type:'camera_state_snapshot',cameras:this.list(),serverTimeEpochUs:this.epochUs()}); }
  send(ws,payload) { if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(payload)); }
  publish(payload) { const event={...payload,serverTimeEpochUs:this.epochUs()}; for(const ws of this.subscribers)this.send(ws,event); this.events?.emit('ivr:event',event); }
  publishState(state) { this.publish({type:'camera_state_changed',...this.cameraView(state),commandId:state.activeCommandId||state.lastCommand?.commandId||null}); }
  epochUs() { return String(BigInt(Date.now())*1000n); }

  issue({ring,camera,desired,requestId=null,reason='ivr_operator'}) {
    if(!Number.isInteger(ring)||!Number.isInteger(camera)||typeof desired!=='boolean') throw new ControlError(400,'invalid_request','Ring, camera, and boolean desired are required.');
    if(requestId!=null&&(typeof requestId!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(requestId))) throw new ControlError(400,'invalid_request','requestId is invalid.');
    const streamId=`ring${ring}_cam${camera}`, requestKey=requestId?`${streamId}:${requestId}`:null;
    if(requestKey&&this.requests.has(requestKey)) { const existing=this.requests.get(requestKey); if(existing.desired!==desired)throw new ControlError(409,'idempotency_conflict','requestId was already used for a different request.'); if(existing.alreadyInDesiredState)return {status:200,replayed:true,alreadyInDesiredState:true,view:this.get(streamId)};return {status:existing.httpStatus||202,replayed:true,command:existing}; }
    const state=this.liveStreams.get(streamId);
    if(!state) { if(this.disconnected.has(streamId))throw new ControlError(409,'camera_disconnected','Camera is registered but disconnected.'); throw new ControlError(404,'camera_unknown','Camera is unknown.'); }
    const caps=state.hello.capabilities||{};
    if(caps.remoteStreamingControl!==true)throw new ControlError(409,'remote_stream_control_unsupported','Camera does not support remote stream control.');
    if(!desired&&caps.remoteStop!==true)throw new ControlError(409,'remote_stop_unsupported','Camera does not support remote stop.');
    if(state.remoteControlEnabled===false)throw new ControlError(409,'remote_control_disabled','Remote control is disabled on the camera.');
    if(state.activeCommandId)throw new ControlError(409,'camera_busy','Camera already has an active lifecycle command.');
    const stable=desired?'streaming':'idle';
    if(state.streamState===stable) {if(requestKey){const record={desired,alreadyInDesiredState:true};this.requests.set(requestKey,record);const timer=setTimeout(()=>this.requests.delete(requestKey),this.config.retentionMs);timer.unref?.();}return {status:200,alreadyInDesiredState:true,view:this.cameraView(state)};}
    const now=Date.now();
    if(state.lastCommandAt&&now-state.lastCommandAt<this.config.rateLimitMs)throw new ControlError(429,'rate_limited','Camera stream transitions are rate limited.');
    const command={commandId:`cmd-${crypto.randomBytes(12).toString('base64url')}`,requestId,streamId,ring,camera,desired,state:desired?'starting':'stopping',requestedAt:now,preCommandState:state.streamState||null,httpStatus:202};
    this.commands.set(command.commandId,command); if(requestKey)this.requests.set(requestKey,command);
    state.activeCommandId=command.commandId;state.lastCommand=command;state.lastCommandAt=now;state.streamState=command.state;state.mediaReady=desired?false:state.mediaReady;
    this.send(state.socket,{type:'set_streaming',commandId:command.commandId,desired,reason:String(reason).slice(0,128),requestedAtEpochUs:this.epochUs()});
    command.ackTimer=setTimeout(()=>this.fail(command,'camera_ack_timeout',false,'ack_timeout'),this.config.ackTimeoutMs);command.ackTimer.unref?.();
    this.audit({...command,event:'sent'});this.publishState(state);return {status:202,command};
  }

  requireCommand(state,message,{allowMissing=false}={}) {
    if(!message.commandId&&allowMissing)return null;
    const command=this.commands.get(message.commandId);
    if(!command||command.streamId!==state.streamId)throw new ControlError(409,'command_correlation_failed','Command does not belong to this camera.');
    return command;
  }

  handle(state,message) {
    if(message.type==='command_ack')return this.ack(state,message);
    if(message.type==='stream_started')return this.started(state,message);
    if(message.type==='stream_start_failed')return this.startFailed(state,message);
    if(message.type==='stream_stopped')return this.stopped(state,message);
  }

  ack(state,message) {
    const command=this.requireCommand(state,message); if(['completed','failed','rejected','ack_timeout','transition_timeout','cancelled_by_disconnect'].includes(command.state))return;
    if(command.acknowledgedAt)return;
    clearTimeout(command.ackTimer);command.acknowledgedAt=Date.now();
    if(!message.accepted){this.fail(command,message.reason||'command_rejected',message.retryable,'rejected');return;}
    command.state=message.alreadyInDesiredState?'completed':(command.desired?'starting':'stopping');
    state.streamState=message.streamState||command.state;
    if(message.alreadyInDesiredState){state.streamState=command.desired?'streaming':'idle';this.complete(state,command);return;}
    const timeout=command.desired?this.config.startTimeoutMs:this.config.stopTimeoutMs;
    command.transitionTimer=setTimeout(()=>this.fail(command,'camera_transition_timeout',true,'transition_timeout'),timeout);command.transitionTimer.unref?.();
    this.audit({...command,event:'acknowledged'});this.publishState(state);
  }

  started(state,message) {
    const command=this.requireCommand(state,message);if(!command.desired||['completed','failed','transition_timeout'].includes(command.state))return false;
    if(message.streamGeneration==null||message.streamGeneration<=Number(state.streamGeneration||0))throw new ControlError(409,'stale_stream_generation','streamGeneration must increase on start.');
    clearTimeout(command.ackTimer);clearTimeout(command.transitionTimer);state.streamGeneration=message.streamGeneration;state.streamState='streaming';state.mediaReady=false;state.lastControlError=null;this.complete(state,command);return true;
  }
  startFailed(state,message) { const command=this.requireCommand(state,message);if(!command.desired)return;state.streamState='error';this.fail(command,message.reason,message.retryable,'failed',message.message); }
  stopped(state,message) { const command=this.requireCommand(state,message,{allowMissing:true});if(command&&command.desired)return false;if(message.streamGeneration!=null&&message.streamGeneration<Number(state.streamGeneration||0))return false;state.streamState='idle';state.mediaReady=false;if(command)this.complete(state,command);else this.publishState(state);return true; }
  complete(state,command){clearTimeout(command.ackTimer);clearTimeout(command.transitionTimer);command.state='completed';command.completedAt=Date.now();state.activeCommandId=null;state.lastCommand=command;this.audit({...command,event:'completed'});this.publishState(state);this.scheduleCleanup(command);}
  fail(command,reason,retryable=false,resultState='failed',message=null){if(['completed','failed','rejected','ack_timeout','transition_timeout','cancelled_by_disconnect'].includes(command.state))return;clearTimeout(command.ackTimer);clearTimeout(command.transitionTimer);command.state=resultState;command.failureReason=reason;command.retryable=retryable;command.message=message;command.completedAt=Date.now();const state=this.liveStreams.get(command.streamId);if(state&&state.activeCommandId===command.commandId){state.activeCommandId=null;state.lastCommand=command;state.lastControlError={code:reason,message,retryable};if(resultState.includes('timeout'))state.streamState='error';this.publishState(state);}this.audit({...command,event:resultState});this.publish({type:'camera_stream_command_failed',streamId:command.streamId,commandId:command.commandId,desired:command.desired,reason,retryable});this.scheduleCleanup(command);}
  disconnect(state){if(state.activeCommandId){const command=this.commands.get(state.activeCommandId);if(command)this.fail(command,'camera_disconnected',true,'cancelled_by_disconnect');}const view={...this.cameraView(state),connected:false,streamState:'disconnected',mediaReady:false};this.disconnected.set(state.streamId,view);this.publish({type:'camera_state_changed',...view});}
  mediaReady(state){if(state.streamState!=='streaming'||state.mediaReady)return;state.mediaReady=true;this.publish({type:'camera_media_ready',streamId:state.streamId,streamGeneration:state.streamGeneration,mediaReady:true});this.publishState(state);}
  scheduleCleanup(command){const timer=setTimeout(()=>{this.commands.delete(command.commandId);if(command.requestId)this.requests.delete(`${command.streamId}:${command.requestId}`);},this.config.retentionMs);timer.unref?.();}
}

module.exports={CameraStreamCommandService,ControlError,DEFAULTS};
