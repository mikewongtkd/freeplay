function apiBase() {
  const configured = window.FREEPLAY_IVR?.config?.replayApiBase;
  if (configured) return configured.replace(/\/$/, '');
  return `${window.location.protocol}//${window.location.hostname}:9000/api/ivr/v1`;
}

function errorFrom(payload, fallback) {
  return Object.assign(new Error(payload?.error?.message || fallback), {code:payload?.error?.code || 'camera_control_failed'});
}

export class StreamControlClient {
  constructor({ring, onState, onConnection}) {
    this.ring = Number(ring); this.onState = onState; this.onConnection = onConnection;
    this.base = apiBase(); this.socket = null; this.closed = false; this.reconnectTimer = null;
  }

  async start() {
    await this.refresh();
    this.connectEvents();
  }

  async refresh() {
    const response = await fetch(`${this.base}/cameras?ring=${encodeURIComponent(this.ring)}`, {cache:'no-store'});
    let payload = null; try { payload = await response.json(); } catch (_) {}
    if (!response.ok || !payload?.ok) throw errorFrom(payload, 'Camera state could not be loaded.');
    payload.cameras.forEach(camera => this.onState?.(camera));
    return payload.cameras;
  }

  connectEvents() {
    if (this.closed) return;
    const url = new URL(this.base);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ivr'; url.search = '';
    const socket = new WebSocket(url); this.socket = socket;
    socket.addEventListener('open', () => this.onConnection?.(true));
    socket.addEventListener('message', event => {
      let message; try { message = JSON.parse(event.data); } catch (_) { return; }
      if (message.type === 'camera_state_snapshot') message.cameras?.filter(camera => camera.ring === this.ring).forEach(camera => this.onState?.(camera));
      const messageRing = Number(message.ring || message.streamId?.match(/^ring(\d+)_/)?.[1]);
      if (message.streamId && messageRing === this.ring && ['camera_state_changed','camera_media_ready'].includes(message.type)) this.onState?.({...message,ring:messageRing});
    });
    socket.addEventListener('close', () => { if (this.socket === socket) this.socket = null; this.onConnection?.(false); if (!this.closed) this.reconnectTimer = setTimeout(() => this.connectEvents(), 2000); });
    socket.addEventListener('error', () => socket.close());
  }

  async setStreaming(camera, desired) {
    const requestId = `ivr-${this.ring}-${camera}-${desired ? 'start' : 'stop'}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
    const response = await fetch(`${this.base}/cameras/${this.ring}/${camera}/stream`, {method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':requestId},body:JSON.stringify({desired,requestId})});
    let payload = null; try { payload = await response.json(); } catch (_) {}
    if (!response.ok || payload?.accepted !== true) throw errorFrom(payload, `Camera ${camera} could not be ${desired ? 'started' : 'stopped'}.`);
    this.onState?.({...payload,ring:this.ring,camera,connected:true,streamId:`ring${this.ring}_cam${camera}`,streamState:payload.streamState || (desired ? 'starting' : 'stopping')});
    return payload;
  }

  close() { this.closed = true; clearTimeout(this.reconnectTimer); this.socket?.close(); }
}
