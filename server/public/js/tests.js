(function(){
  let state=null;
  const esc=v=>$('<div>').text(v==null?'':v).html();
  const badge=s=>`<span class="badge test-${esc(s)}">${esc(s)}</span>`;
  const options=()=>({streamId:`ring${$('#ring').val()}_cam${$('#camera').val()}`,ring:Number($('#ring').val()),durationSeconds:30});

  function render(response){
    state=response.data;
    $('#testMode').text(state.testMode?'TEST MODE ENABLED':'TEST MODE OFF').attr('class','badge '+(state.testMode?'text-bg-warning':'text-bg-secondary'));
    $('#readiness').text(state.readiness.readiness).attr('class','display-6 readiness-'+state.readiness.readiness);
    $('#recommendation').text(state.readiness.recommendation);
    $('#activeStreams').text(state.activeStreams);
    $('#gates').html(state.gates.map(g=>`<div class="col-6 col-lg-2"><div class="card gate-card"><div class="card-body p-2"><div>${esc(g.name)}</div>${badge(g.status)}</div></div></div>`).join(''));
    $('#activeTests').html(state.active.length?state.active.map(a=>`<div class="mb-2"><strong>${esc(a.name)}</strong> since ${new Date(a.startedAt).toLocaleTimeString()} ${a.testId==='sync.three-camera'?`<button class="btn btn-sm btn-warning mark" data-id="${esc(a.testId)}">Mark Event</button> <button class="btn btn-sm btn-info positions" data-id="${esc(a.testId)}">Enter Positions</button>`:''} ${a.testId==='backpressure.queue'?`<button class="btn btn-sm btn-warning throttle" data-id="${esc(a.testId)}">Throttle Ingest</button>`:''} <button class="btn btn-sm btn-success evaluate" data-id="${esc(a.testId)}">Evaluate</button> <button class="btn btn-sm btn-outline-danger stop" data-id="${esc(a.testId)}">Stop</button></div>`).join(' '):'No tests running.');
    $('#testRows').html(state.latestResults.map(t=>`<tr class="detail-row" data-id="${esc(t.id)}"><td><strong>${esc(t.name)}</strong><div class="small text-secondary">${esc(t.description)}</div></td><td>${esc(t.category)}</td><td>${badge(t.status)}</td><td>${t.completed_at?new Date(t.completed_at).toLocaleString():'—'}</td><td><button class="btn btn-sm btn-outline-primary run" data-id="${esc(t.id)}">Start</button></td></tr>`).join(''));
    $('#runRows').html(state.runs.map(x=>`<tr><td>#${x.id}</td><td>${new Date(x.started_at).toLocaleString()}</td><td>${badge(x.status)}</td><td>${Number(x.pass_count||0)}</td><td>${Number(x.warn_count||0)}</td><td>${Number(x.fail_count||0)}</td></tr>`).join(''));
  }
  function refresh(){$.getJSON('../api/tests.php').done(render).fail(x=>$('#activeTests').text(x.responseJSON?.error?.message||'Test service unavailable'));}
  function post(url,data){return $.ajax({url,type:'POST',contentType:'application/json',data:JSON.stringify(data)}).done(refresh).fail(x=>alert(x.responseJSON?.error?.message||'Request failed'));}
  function number(value,digits=2){const n=Number(value);return Number.isFinite(n)?n.toLocaleString(undefined,{maximumFractionDigits:digits}):'—';}
  function measurementSummary(t){
    const a=t.actual||{},m=t.metrics||{},e=t.expected||{};
    switch(t.id){
      case 'protocol.fpv1-header': return `${number(m.invalidMessagesRejected,0)} of ${number(m.invalidMessagesInjected,0)} malformed messages rejected; ${number(m.unexpectedAccepts,0)} unexpected accepts.`;
      case 'stream.codec-config': return `Configuration ${a.codecConfigReady?'ready':'missing'}; version ${number(a.codecConfigVersion,0)}, ${number(m.codecConfigBuffers,0)} config buffers, ${number(m.keyframes,0)} keyframes, recording ${a.recordingStarted?'started':'not started'}.`;
      case 'stream.gop-interval': return a.average==null?'No completed GOPs measured.':`Average ${number(a.average)} ms (${number(a.average-e.targetMs)} ms from target); range ${number(a.min)}–${number(a.max)} ms; fail threshold ${number(e.failMaxMs)} ms.`;
      case 'stream.sequence': return `${number(a.gaps,0)} sequence gaps and ${number(a.estimatedMissing,0)} estimated missing messages; passing target is zero.`;
      case 'timing.pts': return a.average==null?'No PTS deltas measured.':`Average delta ${number(a.average)} µs (${number(a.average-e.nominalDeltaUs)} µs from nominal); ${number(a.backwardJumps,0)} backward, ${number(a.duplicatePts,0)} duplicate, ${number(a.largeDiscontinuities,0)} large.`;
      case 'recording.playable': return `${number(m.validFiles,0)} of ${number(m.filesChecked,0)} files structurally valid; ${number(m.invalidFiles,0)} invalid.`;
      case 'recording.rotation': return a.average==null?'No completed file rotations measured.':`Average ${number(a.average/1000)} s; range ${number(a.min/1000)}–${number(a.max/1000)} s; target ${number(e.rotationMs/1000)} s + ${number(e.boundaryToleranceMs/1000)} s tolerance.`;
      case 'replay.random-access': return `${number(m.queriesSuccessful,0)} of ${number(m.queriesRun,0)} lookups succeeded; maximum latency ${number(a.latency?.max)} ms; warning threshold ${number(e.warnMs)} ms.`;
      case 'replay.ram-cache': return `${number(m.ramCacheSeconds)} s available versus ${number(e.recentSeconds)} s minimum; ${number(m.ramCacheBytes,0)} RAM bytes and ${number(m.diskIndexedGops,0)} disk GOPs.`;
      case 'resilience.reconnect': return a.recoveryMs==null?'A complete disconnect/reconnect/keyframe cycle was not measured.':`Recovery ${number(a.recoveryMs)} ms; warning threshold ${number(e.reconnectWarnMs)} ms.`;
      case 'backpressure.queue': return `Maximum queue ${number(a.maximumQueueBytes,0)} bytes; final queue ${number(a.finalQueueBytes,0)} bytes.`;
      case 'endurance.single-camera': return `${number(m.eventsObserved,0)} events, ${number(m.sequenceGaps,0)} gaps, ${number(m.recordingErrors,0)} recording errors, ${number(a.rssBytes,0)} RSS bytes.`;
      case 'sync.three-camera': return a.maxPairwiseOffsetMs==null?'Three camera event positions were not supplied.':`Maximum offset ${number(a.maxPairwiseOffsetMs)} ms; pass ≤ ${number(e.passMs)} ms, warning ≤ ${number(e.warnMs)} ms.`;
      case 'load.capacity': return `${number(a.activeStreams,0)} of ${number(e.activeStreams,0)} target streams active; ${number(a.protocolErrors,0)} protocol errors.`;
      default: return `${t.status}: review the stored actual and metrics values below.`;
    }
  }
  function showDetail(t){
    console.log( 'TEST', t ); // MW
    const style={ PASS:'success', WARN:'warning', FAIL:'danger', NOT_RUN:'secondary' }[t.status]||'secondary';
    const steps=(t.instructions||[]).map(x=>`<li>${esc(x)}</li>`).join('');
    const measurement=t.latestMeasurement;
    const measurementHtml=measurement?`<section class="measurement measurement-${style}"><div class="d-flex flex-wrap justify-content-between align-items-center gap-2"><h3 class="h5 mb-0">Latest Test Measurements</h3>${badge(t.status)}</div><div class="measurement-summary">${esc(measurementSummary(t))}</div><div class="small measurement-meta">Result #${number(measurement.resultId,0)} · Run #${number(measurement.testRunId,0)} · ${measurement.completedAt?new Date(measurement.completedAt).toLocaleString():'Completion time unavailable'} · ${number(measurement.durationMs,0)} ms</div><details class="mt-3"><summary>Show measurement JSON</summary><pre class="mt-2 mb-0">${esc(JSON.stringify(measurement,null,2))}</pre></details></section>`:`<section class="measurement measurement-NOT_RUN"><h3 class="h5">Latest database measurement</h3><p class="mb-0">This test has not produced a stored result yet. Run and evaluate the test to capture measurements.</p></section>`;
    $( '#detailModal' ).find('.modal-title').html( `<b>${t.category} Test:</b> ${t.name}` );
    $('#detail').html(`<p>${esc(t.description)}</p><h3 class="h6 mt-4">How to conduct this test</h3><ol>${steps||'<li>No operator steps are required.</li>'}</ol><h3 class="h6">Expected criteria</h3><pre>${esc(JSON.stringify(t.expected||{},null,2))}</pre><h3 class="h6">Observations</h3><ul>${(t.observations||[]).map(x=>`<li>${esc(typeof x==='string'?x:JSON.stringify(x))}</li>`).join('')}</ul>${measurementHtml}<p><strong>Recommendation:</strong> ${esc(t.recommendation||'None')}</p>`);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('detailModal')).show();
  }

  $(document).on('click','.run',function(e){e.stopPropagation();post('../api/test-run.php',{testId:$(this).data('id'),options:options()});})
    .on('click','.suite',function(){post('../api/test-run.php',{suiteId:$(this).data('suite'),options:options()});})
    .on('click','.evaluate',function(){post('../api/test-control.php',{command:'evaluate',testId:$(this).data('id')});})
    .on('click','.stop',function(){post('../api/test-control.php',{command:'stop',testId:$(this).data('id')});})
    .on('click','.throttle',function(){post('../api/test-control.php',{command:'action',testId:$(this).data('id'),action:'throttle',streamId:options().streamId});})
    .on('click','.mark',function(){post('../api/test-control.php',{command:'action',testId:$(this).data('id'),action:'mark_event',ring:options().ring});})
    .on('click','.positions',function(){const raw=prompt('Enter cam1, cam2, cam3 event epoch times in microseconds (comma separated):');if(!raw)return;const v=raw.split(',').map(x=>x.trim());if(v.length!==3||v.some(x=>!/^\d+$/.test(x)))return alert('Enter exactly three integer epoch-microsecond values.');post('../api/test-control.php',{command:'action',testId:$(this).data('id'),action:'set_sync_positions',positions:{cam1:v[0],cam2:v[1],cam3:v[2]}});})
    .on('click','.detail-row',function(){const t=state.latestResults.find(x=>x.id===$(this).data('id'));if(t)showDetail(t);});
  $('#refresh').on('click',refresh);refresh();setInterval(refresh,3000);
})();
