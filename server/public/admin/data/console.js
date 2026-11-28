'use strict';
$(() => {
  const csrf = document.getElementById('console').dataset.csrf;
  let selected = null;
  let inspection = null;
  let operationBusy = false;
  function updateArchiveButton() {
    $('#archive-preview').prop('disabled',operationBusy || !$('#archive-dates input:checked').length);
  }
  function loadDates() {
    const selectedDates = new Set($('#archive-dates input:checked').map(function () { return this.value; }).get());
    $('#refresh-dates').prop('disabled',true);
    return $.getJSON('api.php',{action:'video-dates'}).done(result => {
      const list = $('#archive-dates').empty();
      $('#archive-video-root').text(result.data.root);
      if (!result.data.dates.length) list.text('No recording date directories found.');
      for (const day of result.data.dates) {
        const id = `archive-date-${day}`;
        const row = $('<div class="form-check">');
        $('<input type="checkbox" class="form-check-input" name="dates">').attr({id,value:day}).prop('checked',selectedDates.has(day)).appendTo(row);
        $('<label class="form-check-label">').attr('for',id).text(day).appendTo(row);
        list.append(row);
      }
    }).fail(error => {
      $('#archive-dates').text(error.responseJSON?.error?.message || 'Recording dates could not be loaded.');
    }).always(() => { $('#refresh-dates').prop('disabled',false); updateArchiveButton(); });
  }
  function progressValue(raw) {
    try { const value = JSON.parse(raw); return value && typeof value === 'object' ? value : null; }
    catch { return null; }
  }
  function duration(seconds) {
    seconds = Math.max(0,Math.round(seconds));
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds/60)}m ${seconds%60}s`;
  }
  function renderInspection() {
    if (!inspection) return;
    const progress = progressValue(inspection.progress);
    const pending = inspection.state === 'queued';
    const running = inspection.state === 'running';
    const complete = inspection.state === 'completed';
    const terminal = !pending && !running;
    const bar = document.getElementById('inspection-bar');
    $('#inspection-progress').prop('hidden',false);
    const percent = complete ? 100 : terminal ? null : progress?.percent;
    if (typeof percent === 'number') bar.value = percent;
    else bar.removeAttribute('value');
    $('#inspection-message').text(inspection.error || progress?.message || inspection.progress);
    const start = Date.parse(progress?.startedAt || inspection.created_at);
    const end = terminal ? Date.parse(inspection.updated_at) : Date.now();
    let timing = `${pending ? 'Waiting' : 'Elapsed'}: ${duration((end-start)/1000)}`;
    if (running && typeof progress?.current === 'number' && typeof progress?.total === 'number') {
      timing += ` · ${progress.current} / ${progress.total} in this stage (${percent}%)`;
    }
    const staleSeconds = progress?.updatedAt ? (Date.now()-Date.parse(progress.updatedAt))/1000 : 0;
    if (running && staleSeconds > 15) {
      timing += ` · Last update ${duration(staleSeconds)} ago; the current check may still be running`;
    } else if (running && typeof progress?.etaSeconds === 'number') {
      // Display the last measured estimate; do not count down to a false zero if stalled.
      timing += ` · Approximately ${duration(progress.etaSeconds)} remaining in this stage`;
    } else if (running) timing += typeof percent === 'number' ? ' · Estimating time; please keep waiting' : ' · Time estimate unavailable for this stage';
    if (pending) timing += ' · The worker will start this job when available';
    $('#inspection-timing').text(timing);
    $('#inspection-bar').attr('aria-label',`Current inspection stage: ${progress?.phase || inspection.state}`);
  }
  function failure(error) {
    $('#error').prop('hidden', false).text(error.responseJSON?.error?.message || error.message || 'Request failed.');
  }
  function api(data) {
    return $.ajax({url:'api.php', method:'POST', contentType:'application/json', headers:{'X-CSRF-Token':csrf}, data:JSON.stringify(data)});
  }
  function detail(id) {
    selected = id;
    return $.getJSON('api.php', {id}).done(result => {
      const op = result.data.operation;
      let output = {...op};
      for (const key of ['parameters', 'result']) if (output[key]) output[key] = JSON.parse(output[key]);
      output.journal = result.data.steps;
      $('#details').text(JSON.stringify(output, null, 2));
    }).fail(failure);
  }
  function refresh() {
    return $.getJSON('api.php').done(result => {
      const data = result.data;
      inspection = data.operations.find(op => op.type === 'inspect') || null;
      renderInspection();
      operationBusy = data.operations.some(op => ['queued','running','recovery_required'].includes(op.state));
      $('[data-operation="inspect"]').prop('disabled',operationBusy);
      updateArchiveButton();
      const alive = data.worker && Date.now() - Date.parse(data.worker.heartbeat) < 15000;
      const workerStatus = alive ? 'available' : data.worker ? 'heartbeat stale; an inspection may still be running' : 'not available; queued jobs will wait';
      $('#status').text(`${data.mode.mode} — ${data.mode.detail} Database: ${data.activeDatabase}. Media: ${data.mediaRoot}. Worker: ${workerStatus}.`);
      const tbody = $('#history').empty();
      for (const op of data.operations) {
        const row = $('<tr>');
        for (const value of [op.created_at, op.type, op.state, progressValue(op.progress)?.message || op.progress]) row.append($('<td>').text(value));
        const actions = $('<td>');
        $('<button class="btn btn-sm btn-outline-primary">Details</button>').on('click', () => detail(op.id)).appendTo(actions);
        if (op.state === 'queued') $('<button class="btn btn-sm btn-outline-danger ms-2">Cancel</button>').on('click', () => api({action:'cancel', id:op.id}).done(refresh).fail(failure)).appendTo(actions);
        row.append(actions).appendTo(tbody);
      }
      if (selected) detail(selected);
    }).fail(failure);
  }
  function enqueue(action, parameters = {}) {
    $('#error').prop('hidden', true);
    api({action, ...parameters}).done(result => { detail(result.data.id); refresh(); }).fail(failure);
  }
  $('[data-operation]').on('click', function () { enqueue(this.dataset.operation); });
  $('#archive-dates').on('change','input',updateArchiveButton);
  $('#refresh-dates').on('click',loadDates);
  $('#date-form').on('submit', function (e) {
    e.preventDefault();
    const dates = $('#archive-dates input:checked').map(function () { return this.value; }).get();
    if (dates.length) enqueue('date-preview',{dates});
  });
  $('#storage-form').on('submit', function (e) { e.preventDefault(); enqueue('storage-probe', Object.fromEntries(new FormData(this))); });
  loadDates(); refresh(); setInterval(refresh, 3000); setInterval(renderInspection, 1000);
});
