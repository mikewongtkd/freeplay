(function(){
  let state=null;
  const esc=v=>$('<div>').text(v==null?'':v).html();
  const badge=s=>`<span class="badge test-${esc(s)}">${esc(s)}</span>`;
  const options=()=>({streamId:$('#streamId').val().trim(),ring:Number($('#ring').val()),durationSeconds:30});

  function render(response){
    state=response.data;
    $('#testMode').text(state.testMode?'TEST MODE ENABLED':'TEST MODE OFF').attr('class','badge '+(state.testMode?'text-bg-warning':'text-bg-secondary'));
    $('#readiness').text(state.readiness.readiness).attr('class','display-6 readiness-'+state.readiness.readiness);
    $('#recommendation').text(state.readiness.recommendation);
    $('#activeStreams').text(state.activeStreams);
    $('#gates').html(state.gates.map(g=>`<div class="col-6 col-lg-2"><div class="card gate-card"><div class="card-body p-2"><div>${esc(g.name)}</div>${badge(g.status)}</div></div></div>`).join(''));
    $('#activeTests').html(state.active.length?state.active.map(a=>`<div class="mb-2"><strong>${esc(a.name)}</strong> since ${new Date(a.startedAt).toLocaleTimeString()} ${a.testId==='sync.three-camera'?`<button class="btn btn-sm btn-warning mark" data-id="${esc(a.testId)}">Mark Event</button> <button class="btn btn-sm btn-info positions" data-id="${esc(a.testId)}">Enter Positions</button>`:''} <button class="btn btn-sm btn-success evaluate" data-id="${esc(a.testId)}">Evaluate</button> <button class="btn btn-sm btn-outline-danger stop" data-id="${esc(a.testId)}">Stop</button></div>`).join(' '):'No tests running.');
    $('#testRows').html(state.latestResults.map(t=>`<tr class="detail-row" data-id="${esc(t.id)}"><td><strong>${esc(t.name)}</strong><div class="small text-secondary">${esc(t.description)}</div></td><td>${esc(t.category)}</td><td>${badge(t.status)}</td><td>${t.completed_at?new Date(t.completed_at).toLocaleString():'—'}</td><td><button class="btn btn-sm btn-outline-primary run" data-id="${esc(t.id)}">Start</button></td></tr>`).join(''));
    $('#runRows').html(state.runs.map(x=>`<tr><td>#${x.id}</td><td>${new Date(x.started_at).toLocaleString()}</td><td>${badge(x.status)}</td><td>${Number(x.pass_count||0)}</td><td>${Number(x.warn_count||0)}</td><td>${Number(x.fail_count||0)}</td></tr>`).join(''));
  }
  function refresh(){$.getJSON('api/tests.php').done(render).fail(x=>$('#activeTests').text(x.responseJSON?.error?.message||'Test service unavailable'));}
  function post(url,data){return $.ajax({url,type:'POST',contentType:'application/json',data:JSON.stringify(data)}).done(refresh).fail(x=>alert(x.responseJSON?.error?.message||'Request failed'));}
  function showDetail(t){
    const steps=(t.instructions||[]).map(x=>`<li>${esc(x)}</li>`).join('');
    $('#detail').html(`<p>${esc(t.description)}</p><h3 class="h6">How to conduct this test</h3><ol>${steps||'<li>No operator steps are required.</li>'}</ol><h3 class="h6">Expected</h3><pre>${esc(JSON.stringify(t.expected||{},null,2))}</pre><h3 class="h6">Actual / metrics</h3><pre>${esc(JSON.stringify({actual:t.actual,metrics:t.metrics},null,2))}</pre><h3 class="h6">Observations</h3><ul>${(t.observations||[]).map(x=>`<li>${esc(typeof x==='string'?x:JSON.stringify(x))}</li>`).join('')}</ul><p><strong>Recommendation:</strong> ${esc(t.recommendation||'None')}</p>`);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('detailModal')).show();
  }

  $(document).on('click','.run',function(e){e.stopPropagation();post('api/test-run.php',{testId:$(this).data('id'),options:options()});})
    .on('click','.suite',function(){post('api/test-run.php',{suiteId:$(this).data('suite'),options:options()});})
    .on('click','.evaluate',function(){post('api/test-control.php',{command:'evaluate',testId:$(this).data('id')});})
    .on('click','.stop',function(){post('api/test-control.php',{command:'stop',testId:$(this).data('id')});})
    .on('click','.mark',function(){post('api/test-control.php',{command:'action',testId:$(this).data('id'),action:'mark_event',ring:options().ring});})
    .on('click','.positions',function(){const raw=prompt('Enter cam1, cam2, cam3 event epoch times in microseconds (comma separated):');if(!raw)return;const v=raw.split(',').map(x=>x.trim());if(v.length!==3||v.some(x=>!/^\d+$/.test(x)))return alert('Enter exactly three integer epoch-microsecond values.');post('api/test-control.php',{command:'action',testId:$(this).data('id'),action:'set_sync_positions',positions:{cam1:v[0],cam2:v[1],cam3:v[2]}});})
    .on('click','.detail-row',function(){const t=state.latestResults.find(x=>x.id===$(this).data('id'));if(t)showDetail(t);});
  $('#refresh').on('click',refresh);refresh();setInterval(refresh,3000);
})();
