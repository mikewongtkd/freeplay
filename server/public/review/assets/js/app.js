import {state, subscribe, update, replaceReviews, selectedReview, notify} from './state.js';
import {mockServer} from './mock-server.js';
import {reviewController} from './review-controller.js';
import {playbackController} from './playback-controller.js';
import {cameraController} from './camera-controller.js';
import {timelineController} from './timeline-controller.js';
import {psselController} from './pssel-controller.js';
import {scenarioController} from './scenario-controller.js';
import {installKeyboard} from './keyboard-controller.js';

const $ = window.jQuery;
let lastTick = performance.now();
const resultLabels = {accepted: 'Accepted', rejected: 'Rejected', ivr_issue: 'Rejected: IVR Issue', resolved_without_review: 'Resolved without Review'};
const originLabels = {chung: 'Chung coach', hong: 'Hong coach', official: 'Official / Referee', technical: 'Technical review'};

function formatTime(time, ms = true) { return time == null ? '—' : timelineController.format(time, ms); }
function cameraAtCursor(camera) { return camera.available && !(camera.gaps || []).some(gap => state.playbackCursor >= gap.start && state.playbackCursor <= gap.end); }
function statusClass(camera) { return cameraAtCursor(camera) ? 'text-bg-success' : camera.available ? 'text-bg-warning' : 'text-bg-secondary'; }
function statusLabel(camera) { return cameraAtCursor(camera) ? 'AVAILABLE' : camera.available ? 'GAP' : 'UNAVAILABLE'; }
function toast(message, tone = 'primary') { const id = `toast-${Date.now()}`; $('#toastRegion').append(`<div id="${id}" class="toast show border-${tone}" role="status"><div class="toast-body d-flex justify-content-between gap-3"><span>${$('<div>').text(message).html()}</span><button class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button></div></div>`); setTimeout(() => $(`#${id}`).remove(), 4500); }

function renderHeader() {
  $('#headerRing').text(`Ring ${state.ring}`); $('#headerDivision').text(state.match?.division || 'Prototype match'); $('#headerStage').text(state.match?.stage || '');
  $('#headerClock').text(new Date().toLocaleString([], {month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'}));
  const usable = state.cameras.some(cameraAtCursor); $('#liveStatus').toggleClass('offline', !usable).html(`<span class="live-dot"></span> ${usable ? 'Live' : 'Video unavailable'}`);
}

function renderCameras() {
  state.cameras.forEach(camera => {
    $(`[data-camera-name="${camera.id}"]`).text(camera.name);
    $(`[data-camera-state="${camera.id}"]`).attr('class', `camera-state badge ${statusClass(camera)}`).text(statusLabel(camera));
    $(`[data-camera-unavailable="${camera.id}"]`).toggleClass('visible', !cameraAtCursor(camera));
    $(`[data-video-time="${camera.id}"]`).text(formatTime(state.playbackCursor));
    $(`[data-camera-tile="${camera.id}"]`).attr('aria-disabled', camera.available ? 'false' : 'true').toggleClass('unavailable', !cameraAtCursor(camera));
  });
  const selected = state.cameras.find(camera => camera.id === state.selectedCamera) || state.cameras[0]; if (!selected) return;
  $('#cameraSelect').html(state.cameras.map(camera => `<option value="${camera.id}" ${camera.id === selected.id ? 'selected' : ''} ${camera.available ? '' : 'disabled'}>CAM ${camera.id} · ${camera.name}${camera.available ? '' : ' · unavailable'}</option>`).join(''));
  $('#scvCameraLabel').text(`CAM ${selected.id}`); $('#scvCameraName').text(selected.name); $('#scvCameraState').attr('class', `camera-state badge ${statusClass(selected)}`).text(statusLabel(selected));
  $('#scvUnavailable').toggleClass('visible', !cameraAtCursor(selected)); $('#scvTimecode').text(formatTime(state.playbackCursor));
  $('#scvScene').attr('class', `simulated-video camera-scene camera-scene-${selected.id}`).css('--zoom', state.zoom).css('--pan-x', `${state.pan.x}%`).css('--pan-y', `${state.pan.y}%`);
}

function renderReview() {
  const review = selectedReview(), has = !!review, active = review?.status === 'active', pending = review?.status === 'pending', final = ['completed', 'resolved'].includes(review?.status);
  $('#reviewEmpty').toggleClass('d-none', has); $('#reviewMetadata').toggleClass('d-none', !has);
  $('#reviewStatusBadge').attr('class', `badge ${active ? 'text-bg-primary' : pending ? 'text-bg-warning' : final ? 'text-bg-success' : 'text-bg-secondary'}`).text(has ? review.status.toUpperCase() : 'NO REQUEST');
  if (has) {
    $('#metaOrigin').text(originLabels[review.origin] || review.origin); $('#metaRm').text(formatTime(review.rm)); $('#metaWindow').text(`${formatTime(review.windowStart)} – ${formatTime(review.windowEnd)}`);
    $('#metaAur').text(review.aur == null ? 'Not marked' : formatTime(review.aur)); $('#metaRst').text(review.rst == null ? 'Not started' : formatTime(review.rst));
  }
  $('#aurWarning').toggleClass('d-none', !review?.aurOutsideWindow);
  $('.request-actions').toggleClass('d-none', active);
  $('#startReviewButton').prop('disabled', !pending).toggleClass('d-none', active || final);
  $('#resolveButton').toggleClass('d-none', !pending); $('#formalResults').toggleClass('d-none', !active); $('#annotationSection').toggleClass('d-none', !final);
  const linkedEligible = final && ['chung', 'hong'].includes(review?.origin); $('#secondReviewButton').toggleClass('d-none', !linkedEligible).html(linkedEligible ? `<i class="fa-solid fa-link"></i> Create linked ${review.origin === 'chung' ? 'Hong' : 'Chung'} second review` : 'Create linked second review');
  $('#reviewClock').toggleClass('d-none', !active); renderClock(review);
}

function renderClock(review = selectedReview()) {
  if (!review?.rst) return; const elapsed = review.status === 'active' ? Date.now() / 1000 - review.rst : (review.reviewDurationSeconds || 0); state.reviewClockSeconds = elapsed;
  const tone = elapsed < 10 ? 'clock-blue' : elapsed < 20 ? 'clock-green' : elapsed < 30 ? 'clock-yellow' : 'clock-red';
  $('#reviewClock').attr('class', `review-clock ${review.status === 'active' ? '' : 'stopped'} ${tone}`); $('#reviewClockValue').text(`00:${elapsed.toFixed(1).padStart(4, '0')}`);
}

function renderViews() {
  const mcv = state.currentView === 'MCV'; $('#mcvView').toggleClass('d-none', !mcv); $('#scvView').toggleClass('d-none', mcv); $('#scvTools').toggleClass('d-none', mcv);
  const panel = document.getElementById('reviewPanel'); if (mcv) document.querySelector('#mcvView .mcv-grid').append(panel); else document.getElementById('scvReviewPanel').append(panel);
}

function renderPlayback() {
  const icon = state.isPlaying ? 'pause' : 'play'; $('#playPauseButton').html(`<i class="fa-solid fa-${icon}"></i> ${state.isPlaying ? 'Pause' : 'Play'}`);
  $('[data-action="set-rate"]').removeClass('active'); $(`[data-action="set-rate"][data-rate="${state.playbackRate}"]`).addClass('active');
  $('#playbackState').text(state.playbackState.toUpperCase()); $('#cursorReadout').text(formatTime(state.playbackCursor));
}

function renderStatus() {
  const review = selectedReview(), pieces = [];
  if (state.scenario) pieces.push(`<span class="status-pill"><i class="fa-solid fa-diagram-project"></i> Scenario ${state.scenario}</span>`);
  if (review) pieces.push(`<span class="status-pill ${review.origin}">${originLabels[review.origin]} · ${review.id}</span>`);
  if (state.syncWarning) pieces.push(`<span class="status-pill warning"><i class="fa-solid fa-triangle-exclamation"></i> ${state.syncWarning}</span>`);
  if (state.lastError) pieces.push(`<span class="status-pill error"><i class="fa-solid fa-circle-xmark"></i> ${state.lastError}</span>`);
  $('#statusStrip').html(pieces.join('')).toggleClass('empty', !pieces.length);
}

function renderScenarios() { $('#scenarioList').html(state.scenarios.map(item => `<button class="btn btn-outline-primary text-start scenario-button" data-action="load-scenario" data-scenario="${item.id}"><strong>${item.id} · ${item.name}</strong><span>${item.summary}</span></button>`).join('')); }
function renderAll() { renderHeader(); renderViews(); renderCameras(); renderReview(); renderPlayback(); renderStatus(); timelineController.render(); }

async function dispatch(action, element) {
  switch (action) {
    case 'show-mcv': cameraController.showMCV(); break; case 'show-camera': if (!cameraController.showCamera(Number(element.dataset.camera))) toast('That camera is unavailable at the current time.', 'warning'); break;
    case 'previous-camera': cameraController.previous(); break; case 'next-camera': cameraController.next(); break;
    case 'create-request': await reviewController.createRequest(element.dataset.origin); break; case 'start-review': await reviewController.startReview(); break;
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
    case 'second-review': { const prior = selectedReview(); if (prior) await reviewController.createCoachRequest(prior.origin === 'chung' ? 'hong' : 'chung', {linkedReviewId: prior.id, issues: ['Gam-jeom given to the wrong player']}); break; }
    case 'load-scenario': await scenarioController.load(element.dataset.scenario); bootstrap.Offcanvas.getInstance(document.getElementById('developerPanel'))?.hide(); toast(`Scenario ${element.dataset.scenario} loaded.`); break;
    case 'reset-prototype': await scenarioController.reset(); toast('Prototype session reset.'); break;
  }
}

async function bootstrapApp() {
  try {
    const data = await mockServer.bootstrap(window.FREEPLAY_IVR?.ring || 1), model = data.match;
    state.ring = model.ring; state.match = model.match; state.round = model.match.round; state.cameras = model.cameras;
    state.timelineRange = {start: model.timeline.start, end: model.timeline.end}; state.liveEdge = model.timeline.liveEdge; state.playbackCursor = model.timeline.liveEdge;
    state.psselEvents = data.psselEvents; state.scenarios = data.scenarios; replaceReviews(data.reviews); state.syncWarning = Math.max(...model.cameras.map(camera => camera.syncOffsetMs)) - Math.min(...model.cameras.map(camera => camera.syncOffsetMs)) > 33 ? 'Camera synchronization exceeds one frame.' : null;
    subscribe(renderAll); renderScenarios(); renderAll(); installKeyboard();
    $(document).on('click', '[data-action]', async function(event) { if (this.dataset.action === 'cursor') return; event.preventDefault(); try { await dispatch(this.dataset.action, this); } catch (error) { toast(error.message, 'danger'); } });
    $('[data-camera-tile]').on('click keydown', function(event) { if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return; event.preventDefault(); if (!cameraController.showCamera(Number(this.dataset.cameraTile))) toast('That camera is unavailable.', 'warning'); });
    $('#cameraSelect').on('change', function() { cameraController.showCamera(Number(this.value)); });
    $('#timeline').on('click', function(event) { if ($(event.target).closest('button').length) return; if (!timelineController.seekFromEvent(event)) toast('Selected camera has no video at that time. Choose another angle.', 'warning'); });
    $('#timeline').on('click', '.review-window,.annotation-marker', function(event) { event.stopPropagation(); reviewController.selectReview(this.dataset.reviewId, this.dataset.time == null); if (this.dataset.time) playbackController.seekTo(Number(this.dataset.time)); });
    $('#timeline').on('click', '.pssel-marker', function(event) { event.stopPropagation(); psselController.goTo(this.dataset.psselId); });
    $('#annotationModal').on('show.bs.modal', fillAnnotation); $('#annotationForm').on('submit', saveAnnotation);
    $('#scvScene').on('click', function(event) { if (state.currentView === 'MCV' || $(event.target).closest('button').length) return; const rect = this.getBoundingClientRect(); state.pan = {x: ((event.clientX - rect.left) / rect.width - .5) * -40, y: ((event.clientY - rect.top) / rect.height - .5) * -40}; notify('focal-point'); });
    lastTick = performance.now(); setInterval(tick, 100);
  } catch (error) { $('#statusStrip').removeClass('empty').html(`<div class="alert alert-danger m-2"><strong>Prototype failed to initialize:</strong> ${$('<div>').text(error.message).html()}</div>`); }
}

function fillAnnotation() { const review = selectedReview(); if (!review) return; $('#annotationMatch').val(state.match.number); $('#annotationRound').val(state.round); $('#annotationActionTime').val(formatTime(review.aur ?? review.rm)); $('#annotationIdentity').val(originLabels[review.origin]); $('#annotationJury').val(review.annotation?.reviewJury || 'Prototype Operator'); $('#annotationResult').val(resultLabels[review.result] || 'Pending'); $('#annotationReason').val(review.annotation?.reason || review.issues?.[0] || 'Other / official correction'); $('#annotationGamjeom').val(review.annotation?.gamJeomType || ''); $('#annotationExplanation').val(review.annotation?.explanation || ''); $('#annotationNotes').val(review.annotation?.notes || $('#workingNotes').val() || ''); }
async function saveAnnotation(event) { event.preventDefault(); const annotation = Object.fromEntries(new FormData(event.currentTarget).entries()); await reviewController.annotate(annotation); bootstrap.Modal.getInstance(document.getElementById('annotationModal'))?.hide(); toast('Post-review annotation saved.', 'success'); }
function tick() { const now = performance.now(), delta = Math.min(.25, (now - lastTick) / 1000); lastTick = now; playbackController.tick(delta); renderClock(); }

bootstrapApp();
