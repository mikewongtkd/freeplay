import {state, subscribe, replaceReviews, selectedReview, activeReview, notify} from './state.js';
import {mockServer} from './mock-server.js';
import {reviewController} from './review-controller.js';
import {playbackController} from './playback-controller.js';
import {cameraController} from './camera-controller.js';
import {timelineController} from './timeline-controller.js';
import {psselController} from './pssel-controller.js';
import {scenarioController} from './scenario-controller.js';
import {installKeyboard} from './keyboard-controller.js';
import {serverClock} from './server-clock.js';
import {notificationController} from './notification-controller.js';
import {MediaController} from './media-controller.js';

const $ = window.jQuery;
const resultLabels = {accepted: 'Accepted', rejected: 'Rejected', ivr_issue: 'Rejected: IVR Issue', resolved_without_review: 'Resolved without Review'};
const originLabels = {coach: 'Coach', referee: 'Referee'};
const issueTypeLabels = {standard: 'Standard', technical: 'Technical'};
let animationFrame = null;
let lastFrameMs = 0;
let renderedPlaybackRate = null;
let renderedPlaying = null;
let renderedClockClass = null;
const mediaController = new MediaController({
  video: document.getElementById('scvMedia'),
  scene: document.getElementById('scvScene'),
  onTime: epochSeconds => {
    if (state.currentView === 'MCV') return;
    if (state.playbackState === 'live') return;
    state.playbackCursor = Math.max(state.timelineRange.start, Math.min(state.timelineRange.end, epochSeconds));
    updateTimeSensitiveValues();
  },
  onState: (mediaState, detail) => {
    if (mediaState === 'loading') { state.mediaLoading = true; state.mediaError = null; updateCameraValues(); }
    if (mediaState === 'error') { state.mediaLoading = false; state.mediaError = detail?.message || 'Replay media error.'; state.lastError = state.mediaError; state.isPlaying = false; if (state.playbackState === 'live') state.playbackState = 'paused'; notify('error'); updateCameraValues(); }
    if (mediaState === 'ready') { state.mediaLoading = false; state.mediaError = null; state.lastError = null; renderStatus(); updateCameraValues(); syncAnimationLoop(); }
  }
});

function setText(selector, value) { const node = document.querySelector(selector); if (node && node.textContent !== String(value)) node.textContent = String(value); }
function setClass(selector, value) { const node = document.querySelector(selector); if (node && node.className !== value) node.className = value; }
function formatTime(time, ms = true) { return time == null ? '—' : timelineController.format(time, ms); }
function cameraAtCursor(camera) { return camera.available && !(camera.gaps || []).some(gap => state.playbackCursor >= gap.start && state.playbackCursor <= gap.end); }
function statusClass(camera) { return cameraAtCursor(camera) ? 'text-bg-success' : camera.available ? 'text-bg-warning' : 'text-bg-secondary'; }
function statusLabel(camera) { return cameraAtCursor(camera) ? 'AVAILABLE' : camera.available ? 'GAP' : 'UNAVAILABLE'; }
function toast(message, tone = 'primary') { const id = `toast-${Date.now()}`; $('#toastRegion').append(`<div id="${id}" class="toast show border-${tone}" role="status"><div class="toast-body d-flex justify-content-between gap-3"><span>${$('<div>').text(message).html()}</span><button class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button></div></div>`); setTimeout(() => $(`#${id}`).remove(), 4500); }

function renderHeaderStructure() {
  setText('#headerRing', `Ring ${state.ring}`); setText('#headerDivision', state.match?.division || 'Prototype match'); setText('#headerStage', state.match?.stage || '');
}

function updateHeaderClock() {
  setText('#headerClock', new Date(serverClock.now() * 1000).toLocaleString([], {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'}));
}

function updateLiveStatus() {
  const usable = state.cameras.some(cameraAtCursor);
  $('#liveStatus').toggleClass('offline', !usable); setText('#liveStatusText', usable ? 'Live' : 'Video unavailable');
}

function renderCameraOptions() {
  const selected = state.cameras.find(camera => camera.id === state.selectedCamera) || state.cameras[0];
  if (!selected) return;
  $('#cameraSelect').html(state.cameras.map(camera => `<option value="${camera.id}" ${camera.id === selected.id ? 'selected' : ''} ${camera.available ? '' : 'disabled'}>CAM ${camera.id} · ${camera.name}${camera.available ? '' : ' · unavailable'}</option>`).join(''));
  state.cameras.forEach(camera => setText(`[data-camera-name="${camera.id}"]`, camera.name));
}

function updateCameraValues() {
  state.cameras.forEach(camera => {
    setClass(`[data-camera-state="${camera.id}"]`, `camera-state badge ${statusClass(camera)}`); setText(`[data-camera-state="${camera.id}"]`, statusLabel(camera));
    $(`[data-camera-unavailable="${camera.id}"]`).toggleClass('visible', !cameraAtCursor(camera));
    setText(`[data-video-time="${camera.id}"]`, formatTime(state.playbackCursor));
    $(`[data-camera-tile="${camera.id}"]`).attr('aria-disabled', camera.available ? 'false' : 'true').toggleClass('unavailable', !cameraAtCursor(camera));
  });
  const selected = state.cameras.find(camera => camera.id === state.selectedCamera) || state.cameras[0];
  if (!selected) return;
  setText('#scvCameraLabel', `CAM ${selected.id}`); setText('#scvCameraName', selected.name);
  setClass('#scvCameraState', `camera-state badge ${statusClass(selected)}`); setText('#scvCameraState', statusLabel(selected));
  const mediaUnavailable = !cameraAtCursor(selected) || !!state.mediaError || state.mediaLoading;
  $('#scvUnavailable').toggleClass('visible', mediaUnavailable); setText('#scvTimecode', formatTime(state.playbackCursor));
  setClass('#scvUnavailableIcon', `fa-solid fa-${state.mediaLoading ? 'spinner fa-spin' : 'video-slash'}`);
  setText('#scvUnavailableTitle', state.mediaLoading ? 'Loading replay' : state.mediaError ? 'Replay unavailable' : 'No video available');
  setText('#scvUnavailableDetail', state.mediaLoading ? 'Retrieving retained camera media…' : state.mediaError || 'Choose another camera');
}

function updateScvTransform() {
  const selected = state.cameras.find(camera => camera.id === state.selectedCamera) || state.cameras[0];
  if (!selected) return;
  $('#scvScene').removeClass('camera-scene-1 camera-scene-2 camera-scene-3').addClass(`camera-scene-${selected.id}`).css('--zoom', state.zoom).css('--pan-x', `${state.pan.x}%`).css('--pan-y', `${state.pan.y}%`);
}

function renderReview() {
  const review = selectedReview(), has = !!review, active = review?.status === 'active', selectable = ['pending', 'selected'].includes(review?.status), final = ['completed', 'resolved_without_review'].includes(review?.status);
  $('#reviewEmpty').toggleClass('d-none', has); $('#reviewMetadata').toggleClass('d-none', !has);
  $('#reviewStatusBadge').attr('class', `badge ${active ? 'text-bg-primary' : selectable ? 'text-bg-warning' : final ? 'text-bg-success' : 'text-bg-secondary'}`).text(has ? review.status.replaceAll('_', ' ').toUpperCase() : 'NO REQUEST');
  if (has) {
    setText('#metaOrigin', originLabels[review.origin] || review.origin); setText('#metaIssueType', issueTypeLabels[review.issueType] || review.issueType); setText('#metaReason', review.reason || review.issues?.[0] || 'Reason pending');
    setText('#metaRm', formatTime(review.rm)); setText('#metaWindow', `${formatTime(review.windowStart)} – ${formatTime(review.windowEnd)}`);
    setText('#metaAur', review.aur == null ? 'Not marked' : formatTime(review.aur)); setText('#metaRst', review.rst == null ? 'Not started' : formatTime(review.rst));
  }
  $('#aurWarning').toggleClass('d-none', !review?.aurOutsideWindow);
  $('#startReviewButton').prop('disabled', review?.status !== 'selected' || !!state.activeReviewId).toggleClass('d-none', active || final); $('#resolveButton').toggleClass('d-none', !selectable || !!state.activeReviewId);
  $('#formalResults').toggleClass('d-none', !active); $('#annotationSection').toggleClass('d-none', !final);
  $('#reviewClock').toggleClass('d-none', !active); updateReviewClock();
  renderPendingQueue();
}

function renderPendingQueue() {
  const locked = !!state.activeReviewId;
  $('#pendingReviewList').html(state.pendingRequests.length ? state.pendingRequests.map(review => `<button class="btn btn-sm ${review.id === state.selectedReviewId ? 'btn-primary' : 'btn-outline-secondary'}" data-action="select-review" data-review-id="${review.id}" ${locked ? 'disabled' : ''}><strong>${review.side === 'chung' ? 'Chung' : 'Hong'}</strong> ${review.id}<span>${originLabels[review.origin]} · ${issueTypeLabels[review.issueType]} · ${review.reason || 'Reason pending'}</span></button>`).join('') : '<span class="empty-copy">No pending requests</span>');
  $('#previousReviewButton,#nextReviewButton').prop('disabled', locked || state.pendingRequests.length < 2);
}

function updateReviewClock() {
  const review = selectedReview(); if (!review?.rst) return;
  const elapsed = review.status === 'active' ? serverClock.now() - review.rst : (review.reviewDurationSeconds || 0); state.reviewClockSeconds = elapsed;
  const tone = elapsed < 10 ? 'clock-blue' : elapsed < 20 ? 'clock-green' : elapsed < 30 ? 'clock-yellow' : 'clock-red';
  const clockClass = `review-clock ${review.status === 'active' ? '' : 'stopped'} ${tone}`;
  if (clockClass !== renderedClockClass) {
    $('#reviewClock').removeClass('stopped clock-blue clock-green clock-yellow clock-red').toggleClass('stopped', review.status !== 'active').addClass(tone);
    renderedClockClass = clockClass;
  }
  setText('#reviewClockValue', `00:${elapsed.toFixed(1).padStart(4, '0')}`);
}

function renderViews() {
  const mcv = state.currentView === 'MCV'; $('#mcvView').toggleClass('d-none', !mcv); $('#scvView').toggleClass('d-none', mcv); $('#scvTools').toggleClass('d-none', mcv);
  $('#ivrMain').toggleClass('scv-active', !mcv);
  const panel = document.getElementById('reviewPanel'), destination = mcv ? document.querySelector('#mcvView .mcv-grid') : document.getElementById('scvReviewPanel');
  if (panel.parentElement !== destination) destination.append(panel);
}

function updatePlaybackValues() {
  if (renderedPlaying !== state.isPlaying) { setClass('#playPauseIcon', `fa-solid fa-${state.isPlaying ? 'pause' : 'play'}`); setText('#playPauseLabel', state.isPlaying ? 'Pause' : 'Play'); renderedPlaying = state.isPlaying; }
  if (renderedPlaybackRate !== state.playbackRate) { $('[data-action="set-rate"]').removeClass('active'); $(`[data-action="set-rate"][data-rate="${state.playbackRate}"]`).addClass('active'); renderedPlaybackRate = state.playbackRate; }
  setText('#playbackState', state.playbackState.toUpperCase()); setText('#cursorReadout', formatTime(state.playbackCursor));
}

function renderStatus() {
  const review = selectedReview(), pieces = [];
  if (state.scenario) pieces.push(`<span class="status-pill"><i class="fa-solid fa-diagram-project"></i> Scenario ${state.scenario}</span>`);
  if (review) pieces.push(`<span class="status-pill ${review.side}">${review.side === 'chung' ? 'Chung' : 'Hong'} · ${originLabels[review.origin]} · ${review.id}</span>`);
  if (state.syncWarning) pieces.push(`<span class="status-pill warning"><i class="fa-solid fa-triangle-exclamation"></i> ${state.syncWarning}</span>`);
  if (state.lastError) pieces.push(`<span class="status-pill error"><i class="fa-solid fa-circle-xmark"></i> ${state.lastError}</span>`);
  $('#statusStrip').html(pieces.join('')).toggleClass('empty', !pieces.length);
}

function renderScenarios() { $('#scenarioList').html(state.scenarios.map(item => `<button class="btn btn-outline-primary text-start scenario-button" data-action="load-scenario" data-scenario="${item.id}"><strong>${item.id} · ${item.name}</strong><span>${item.summary}</span></button>`).join('')); }
function updateTimeSensitiveValues() { updateHeaderClock(); updateLiveStatus(); updateCameraValues(); updatePlaybackValues(); updateReviewClock(); timelineController.updateDynamic(); }

function renderInitial() {
  renderHeaderStructure(); renderViews(); renderCameraOptions(); updateScvTransform(); renderReview(); renderStatus(); renderScenarios(); timelineController.initialize(); updateTimeSensitiveValues();
}

function renderForChange(_currentState, reason) {
  if (reason.startsWith('server-')) playbackController.syncServerTime(serverClock.now());
  if (['seek', 'frame-step', 'play-pause', 'rate', 'go-live'].includes(reason)) updateTimeSensitiveValues();
  else if (['show-mcv', 'show-camera'].includes(reason)) { renderViews(); renderCameraOptions(); updateScvTransform(); updateCameraValues(); timelineController.updateTrackState(); timelineController.updateDynamic(); }
  else if (['camera-availability', 'server-camera-event'].includes(reason)) { renderCameraOptions(); updateCameraValues(); updateLiveStatus(); timelineController.renderTracks(); renderStatus(); }
  else if (reason === 'server-pssel-event') { timelineController.renderPsselEvents(); updateTimeSensitiveValues(); }
  else if (reason === 'server-time-anchor') updateTimeSensitiveValues();
  else if (['review-updated', 'request-created', 'review-started', 'review-selected'].includes(reason)) { renderReview(); renderStatus(); timelineController.renderAnnotations(); updateTimeSensitiveValues(); }
  else if (['fit', 'zoom', 'pan', 'focal-point'].includes(reason)) updateScvTransform();
  else if (reason === 'scenario-loaded') { renderViews(); renderCameraOptions(); updateScvTransform(); renderReview(); renderStatus(); timelineController.renderTracks(); timelineController.renderAnnotations(); updateTimeSensitiveValues(); }
  else if (reason === 'error') renderStatus();
  syncRealMedia(reason);
  syncAnimationLoop();
}

function syncRealMedia(reason) {
  if (state.currentView === 'MCV') { if (reason === 'show-mcv') mediaController.reset(); return; }
  if (reason === 'play-pause') {
    if (mediaController.liveActive && state.playbackState !== 'live') mediaController.stopLivePolling();
    if (mediaController.active) mediaController.setPlaying(state.isPlaying);
    else void mediaController.seek(state.playbackCursor, {ring:state.ring, camera:state.selectedCamera, play:state.isPlaying}).catch(() => {});
    return;
  }
  if (reason === 'rate') { mediaController.stopLivePolling(); mediaController.setRate(state.playbackRate); if (state.playbackRate > 0) mediaController.setPlaying(true); return; }
  if (reason === 'go-live' || reason === 'show-camera' && state.playbackState === 'live') {
    state.isPlaying = true; updatePlaybackValues();
    void mediaController.goLive(state.liveEdge, {ring:state.ring, camera:state.selectedCamera}).catch(() => {});
    return;
  }
  if (['show-camera', 'seek', 'frame-step', 'review-started'].includes(reason)) {
    void mediaController.seek(state.playbackCursor, {ring:state.ring, camera:state.selectedCamera, play:state.isPlaying && state.playbackRate > 0}).catch(() => {});
  }
}

function animationStep(nowMs) {
  const delta = Math.min(.25, (nowMs - lastFrameMs) / 1000); lastFrameMs = nowMs;
  if (!mediaController.active) playbackController.advance(delta); updateTimeSensitiveValues();
  if (state.isPlaying && state.playbackState !== 'live') animationFrame = requestAnimationFrame(animationStep); else animationFrame = null;
}

function syncAnimationLoop() {
  const needsSyntheticClock = state.isPlaying && state.playbackState !== 'live' && !mediaController.active;
  if (needsSyntheticClock && animationFrame == null) { lastFrameMs = performance.now(); animationFrame = requestAnimationFrame(animationStep); }
  if (!needsSyntheticClock && animationFrame != null) { cancelAnimationFrame(animationFrame); animationFrame = null; }
}

function installScvWheelControls() {
  const scene = document.getElementById('scvScene');
  if (!scene) return;
  scene.addEventListener('wheel', event => {
    if (state.currentView === 'MCV') return;
    event.preventDefault();

    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? scene.clientHeight : 1;
    const deltaX = event.deltaX * unit;
    const deltaY = event.deltaY * unit;
    const panStep = value => Math.max(-10, Math.min(10, value / 8));

    if (event.shiftKey || Math.abs(deltaX) > Math.abs(deltaY)) {
      playbackController.pan(panStep(event.shiftKey && !deltaX ? deltaY : deltaX), 0);
      return;
    }
    if (event.altKey) {
      playbackController.pan(0, panStep(deltaY));
      return;
    }

    const zoomDelta = Math.max(-.25, Math.min(.25, -deltaY / 400));
    if (zoomDelta) playbackController.zoom(zoomDelta);
  }, {passive: false});
}

let scvDragMoved = false;
function installScvDragControls() {
  const scene = document.getElementById('scvScene');
  if (!scene) return;
  let drag = null;

  scene.addEventListener('pointerdown', event => {
    if (state.currentView === 'MCV' || event.button !== 0 || event.target.closest('button')) return;
    scvDragMoved = false;
    drag = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: event.clientX, originY: event.clientY};
    scene.setPointerCapture(event.pointerId);
    scene.classList.add('is-panning');
  });
  scene.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = scene.getBoundingClientRect();
    if (Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY) >= 3) scvDragMoved = true;
    if (!scvDragMoved || !rect.width || !rect.height) return;
    event.preventDefault();
    playbackController.pan((event.clientX - drag.x) / rect.width * 100, (event.clientY - drag.y) / rect.height * 100);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  const finishDrag = event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (scene.hasPointerCapture(event.pointerId)) scene.releasePointerCapture(event.pointerId);
    scene.classList.remove('is-panning');
    drag = null;
  };
  scene.addEventListener('pointerup', finishDrag);
  scene.addEventListener('pointercancel', event => { finishDrag(event); scvDragMoved = false; });
}

function clockPulse() {
  playbackController.syncServerTime(serverClock.now());
  if (animationFrame == null) updateTimeSensitiveValues(); else { updateHeaderClock(); updateReviewClock(); }
}

async function dispatch(action, element) {
  switch (action) {
    case 'show-mcv': cameraController.showMCV(); break; case 'show-camera': if (!cameraController.showCamera(Number(element.dataset.camera))) toast('That camera is unavailable at the current time.', 'warning'); break;
    case 'previous-camera': cameraController.previous(); break; case 'next-camera': cameraController.next(); break;
    case 'create-request': await reviewController.createRequest(element.dataset.side, {origin: $('input[name="requestOrigin"]:checked').val(), issueType: $('input[name="requestIssueType"]:checked').val(), reason: $('#requestReason').val()}); break; case 'select-review': await reviewController.selectReview(element.dataset.reviewId); break; case 'start-review': await reviewController.startReview(); break;
    case 'resolve-without-review': await reviewController.resolveWithoutReview(); toast('Request preserved as Resolved without Review. No RST was created.'); break;
    case 'set-result': await reviewController.setResult(element.dataset.result); toast(`${resultLabels[element.dataset.result]} recorded. Review clock stopped.`, element.dataset.result === 'accepted' ? 'success' : element.dataset.result === 'ivr_issue' ? 'warning' : 'danger'); break;
    case 'previous-review': reviewController.previous(); break; case 'next-review': reviewController.next(); break;
    case 'seek': playbackController.seekRelative(Number(element.dataset.seconds)); break; case 'step-frame': playbackController.stepFrame(Number(element.dataset.direction)); break;
    case 'play-pause': playbackController.playPause(); break; case 'set-rate': playbackController.setRate(Number(element.dataset.rate)); break;
    case 'mark-aur': await reviewController.markAUR(); if (!selectedReview()?.rst) toast('Start a formal review before marking AUR.', 'warning'); break;
    case 'jump-window': reviewController.jumpWindow(); break; case 'jump-aur': reviewController.jumpAur(); break; case 'go-live': playbackController.goLive(); break;
    case 'fit': playbackController.fit(); break; case 'zoom': playbackController.zoom(Number(element.dataset.delta)); break;
    case 'pan': playbackController.pan(Number(element.dataset.x), Number(element.dataset.y)); break;
    case 'fullscreen': document.querySelector('.scv-video')?.requestFullscreen?.(); break;
    case 'second-review': { const prior = selectedReview(); if (prior) await reviewController.createCoachRequest(prior.side === 'chung' ? 'hong' : 'chung', {linkedReviewId: prior.id, issues: ['Gam-jeom given to the wrong player']}); break; }
    case 'load-scenario': await scenarioController.load(element.dataset.scenario); bootstrap.Offcanvas.getInstance(document.getElementById('developerPanel'))?.hide(); toast(`Scenario ${element.dataset.scenario} loaded.`); break;
    case 'reset-prototype': await scenarioController.reset(); toast('Prototype session reset.'); break;
  }
}

async function bootstrapApp() {
  try {
    const data = await mockServer.bootstrap(window.FREEPLAY_IVR?.ring || 1), model = data.match;
    serverClock.anchor(model.timeline.liveEdge, 'bootstrap');
    state.ring = model.ring; state.match = model.match; state.round = model.match.round; state.cameras = model.cameras;
    state.timelineRange = {start: model.timeline.start, end: model.timeline.end}; state.timelineStartSource = model.timeline.startSource; state.liveEdge = model.timeline.liveEdge; state.playbackCursor = model.timeline.liveEdge;
    state.psselEvents = data.psselEvents; state.scenarios = data.scenarios; replaceReviews(data.reviews, data.workflow?.activeReviewId || data.workflow?.selectedReviewId, data.workflow); state.timelineRange.end = activeReview()?.rst || state.liveEdge; state.syncWarning = Math.max(...model.cameras.map(camera => camera.syncOffsetMs)) - Math.min(...model.cameras.map(camera => camera.syncOffsetMs)) > 33 ? 'Camera synchronization exceeds one frame.' : null;
    subscribe(renderForChange); notificationController.install(); renderInitial(); installKeyboard(); installScvWheelControls(); installScvDragControls();
    $(document).on('click', '[data-action]', async function(event) { if (this.dataset.action === 'cursor') return; event.preventDefault(); try { await dispatch(this.dataset.action, this); } catch (error) { toast(error.message, 'danger'); } });
    $('[data-camera-tile]').on('click keydown', function(event) { if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return; event.preventDefault(); if (!cameraController.showCamera(Number(this.dataset.cameraTile))) toast('That camera is unavailable.', 'warning'); });
    $('#cameraSelect').on('change', function() { cameraController.showCamera(Number(this.value)); });
    $('#timeline').on('click', function(event) { if ($(event.target).closest('button').length) return; if (!timelineController.seekFromEvent(event)) toast('Selected camera has no video at that time. Choose another angle.', 'warning'); });
    $('#timeline').on('click', '.review-window,.annotation-marker', async function(event) { event.stopPropagation(); try { const selected = await reviewController.selectReview(this.dataset.reviewId, this.dataset.time == null); if (selected && this.dataset.time) playbackController.seekTo(Number(this.dataset.time)); } catch (error) { toast(error.message, 'warning'); } });
    $('#timeline').on('click', '.pssel-marker', function(event) { event.stopPropagation(); psselController.goTo(this.dataset.psselId); });
    $('#annotationModal').on('show.bs.modal', fillAnnotation); $('#annotationForm').on('submit', saveAnnotation);
    $('#scvScene').on('click', function(event) { if (scvDragMoved) { scvDragMoved = false; return; } if (state.currentView === 'MCV' || $(event.target).closest('button').length) return; const rect = this.getBoundingClientRect(); state.pan = {x: ((event.clientX - rect.left) / rect.width - .5) * -40, y: ((event.clientY - rect.top) / rect.height - .5) * -40}; notify('focal-point'); });
    setInterval(clockPulse, 100); syncAnimationLoop();
  } catch (error) { $('#statusStrip').removeClass('empty').html(`<div class="alert alert-danger m-2"><strong>Prototype failed to initialize:</strong> ${$('<div>').text(error.message).html()}</div>`); }
}

function fillAnnotation() { const review = selectedReview(); if (!review) return; $('#annotationMatch').val(state.match.number); $('#annotationRound').val(state.round); $('#annotationActionTime').val(formatTime(review.aur ?? review.rm)); $('#annotationIdentity').val(`${review.side === 'chung' ? 'Chung' : 'Hong'} · ${originLabels[review.origin]}`); $('#annotationJury').val(review.annotation?.reviewJury || 'Prototype Operator'); $('#annotationResult').val(resultLabels[review.result] || 'Pending'); $('#annotationReason').val(review.annotation?.reason || review.issues?.[0] || 'Other / official correction'); $('#annotationGamjeom').val(review.annotation?.gamJeomType || ''); $('#annotationExplanation').val(review.annotation?.explanation || ''); $('#annotationNotes').val(review.annotation?.notes || $('#workingNotes').val() || ''); }
async function saveAnnotation(event) { event.preventDefault(); const annotation = Object.fromEntries(new FormData(event.currentTarget).entries()); await reviewController.annotate(annotation); bootstrap.Modal.getInstance(document.getElementById('annotationModal'))?.hide(); toast('Post-review annotation saved.', 'success'); }

bootstrapApp();
