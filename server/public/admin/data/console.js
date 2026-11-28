'use strict';
$(() => {
  const csrf = document.getElementById('console').dataset.csrf;
  let selected = null;
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
      const alive = data.worker && Date.now() - Date.parse(data.worker.heartbeat) < 15000;
      const workerStatus = alive ? 'available' : data.worker ? 'heartbeat stale; an inspection may still be running' : 'not available; queued jobs will wait';
      $('#status').text(`${data.mode.mode} — ${data.mode.detail} Database: ${data.activeDatabase}. Media: ${data.mediaRoot}. Worker: ${workerStatus}.`);
      const tbody = $('#history').empty();
      for (const op of data.operations) {
        const row = $('<tr>');
        for (const value of [op.created_at, op.type, op.state, op.progress]) row.append($('<td>').text(value));
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
  $('#date-form').on('submit', function (e) { e.preventDefault(); enqueue('date-preview', Object.fromEntries(new FormData(this))); });
  $('#storage-form').on('submit', function (e) { e.preventDefault(); enqueue('storage-probe', Object.fromEntries(new FormData(this))); });
  refresh(); setInterval(refresh, 3000);
});
