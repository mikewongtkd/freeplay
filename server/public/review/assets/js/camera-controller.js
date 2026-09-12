import {state, notify} from './state.js';

function camera(id) { return state.cameras.find(item => item.id === Number(id)); }
export const cameraController = {
  showMCV() { state.currentView = 'MCV'; notify('show-mcv'); },
  showCamera(id) { const target = camera(id); if (!target?.available) return false; state.selectedCamera = Number(id); state.currentView = `CAM${id}`; notify('show-camera'); return true; },
  next() { for (let offset = 1; offset <= 3; offset++) { const id = ((state.selectedCamera - 1 + offset) % 3) + 1; if (this.showCamera(id)) return; } },
  previous() { for (let offset = 1; offset <= 3; offset++) { const id = ((state.selectedCamera - 1 - offset + 6) % 3) + 1; if (this.showCamera(id)) return; } },
  setAvailability(id, available, status = available ? 'streaming' : 'unavailable') { const target = camera(id); if (!target) return; target.available = available; target.status = status; notify('camera-availability'); },
  setAllAvailable(available) { state.cameras.forEach(camera => { camera.available = available; camera.status = available ? 'streaming' : 'unavailable'; }); notify('camera-availability'); }
};
