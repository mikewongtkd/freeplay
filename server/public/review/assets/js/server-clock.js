let serverAnchorSeconds = Date.now() / 1000;
let localAnchorMs = performance.now();
let source = 'client-bootstrap';

function secondsFromNotification(notification) {
  if (Number.isFinite(Number(notification?.serverTimestamp))) return Number(notification.serverTimestamp);
  if (notification?.serverTimestampEpochUs != null) return Number(notification.serverTimestampEpochUs) / 1e6;
  if (notification?.eventTimeEpochUs != null) return Number(notification.eventTimeEpochUs) / 1e6;
  return null;
}

export const serverClock = {
  anchor(serverSeconds, anchorSource = 'server') {
    const value = Number(serverSeconds);
    if (!Number.isFinite(value)) return false;
    serverAnchorSeconds = value;
    localAnchorMs = performance.now();
    source = anchorSource;
    return true;
  },
  anchorNotification(notification) {
    const value = secondsFromNotification(notification);
    return value == null ? false : this.anchor(value, notification.type || 'server-notification');
  },
  now() { return serverAnchorSeconds + (performance.now() - localAnchorMs) / 1000; },
  snapshot() { return {serverAnchorSeconds, localAnchorMs, source, estimatedServerSeconds: this.now()}; }
};
