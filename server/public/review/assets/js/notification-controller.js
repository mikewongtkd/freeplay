import {state, notify} from './state.js';
import {serverClock} from './server-clock.js';

function cameraFor(notification) {
  const cameraId = Number(notification.camera ?? notification.cameraId);
  return state.cameras.find(item => item.id === cameraId);
}

export const notificationController = {
  receive(notification) {
    if (!notification || !serverClock.anchorNotification(notification)) return false;
    if (notification.type === 'camera-start-recording' || notification.type === 'camera-stop-recording') {
      const camera = cameraFor(notification);
      if (!camera) return false;
      camera.available = notification.type === 'camera-start-recording';
      camera.status = camera.available ? 'streaming' : 'recording stopped';
      notify('server-camera-event');
      return true;
    }
    if (notification.type === 'pssel-event') {
      const event = {...notification.event};
      if (event.time == null && notification.eventTimeEpochUs != null) event.time = Number(notification.eventTimeEpochUs) / 1e6;
      if (!event?.id || state.psselEvents.some(item => item.id === event.id)) return false;
      state.psselEvents.push(event);
      state.psselEvents.sort((a, b) => a.time - b.time);
      notify('server-pssel-event');
      return true;
    }
    notify('server-time-anchor');
    return true;
  },
  install() {
    window.addEventListener('freeplay:server-notification', event => this.receive(event.detail));
    window.FreePlayIVRNotifications = this;
    const url = window.FREEPLAY_IVR?.config?.notificationUrl;
    if (url && window.EventSource) {
      const source = new EventSource(url);
      source.onmessage = event => { try { this.receive(JSON.parse(event.data)); } catch (_) { /* Ignore malformed prototype notifications. */ } };
      this.source = source;
    }
  }
};
