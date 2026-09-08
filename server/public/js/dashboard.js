(function(){
  function fmtBits(v){ if(!v) return '0 Mbps'; return (v/1e6).toFixed(2)+' Mbps'; }
  function fmtBytes(v){ v=Number(v||0); const u=['B','KB','MB','GB','TB']; let i=0; while(v>=1024&&i<u.length-1){v/=1024;i++;} return v.toFixed(i<2?0:2)+' '+u[i]; }
  function fmtTime(s){ s=Number(s||0); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=Math.floor(s%60); return [h,m,x].map(v=>String(v).padStart(2,'0')).join(':'); }
  function esc(s){ return $('<div>').text(s==null?'':s).html(); }
  function cameraParts(c){
    const match=String(c.stream_id||'').match(/^ring(\d+)_cam(?:era)?(\d+)$/i);
    return {
      ring:Number(c.ring??c.ring_no??match?.[1]),
      camera:Number(c.camera??c.camera_no??match?.[2])
    };
  }
  function status(c){
    const live=!!c.connected, degraded=live&&(!c.healthy||Number(c.sequenceGaps||0)>0), cls=!live?'secondary':degraded?'warning':'success';
    return {live,cls,label:live?(degraded?'DEGRADED':'STREAMING'):'OFFLINE'};
  }
  function details(c){
    const state=status(c), parts=cameraParts(c);
    return `<div class="card shadow-sm camera-card border-${state.cls}"><div class="card-body">
      <div class="d-flex justify-content-between gap-3"><div><h2 id="cameraDetailsHeading" class="h5 mb-0">Ring ${esc(parts.ring)}, Camera ${esc(parts.camera)}</h2><div class="small text-secondary">${esc(c.stream_id)} · ${esc(c.device_model||'Unknown')} · ${esc(c.resolution||'')}</div></div><span class="badge text-bg-${state.cls} align-self-start">${state.label}</span></div>
      <hr><div class="row g-2 small"><div class="col-6 metric"><span>FPS</span><strong>${Number(c.fps||0).toFixed(2)} / ${Number(c.fps_target||0)}</strong></div><div class="col-6 metric"><span>Bitrate</span><strong>${fmtBits(c.bitrate)}</strong></div><div class="col-6 metric"><span>Buffers</span><strong>${Number(c.buffers||c.frames||0).toLocaleString()}</strong></div><div class="col-6 metric"><span>Sequence gaps</span><strong>${Number(c.sequenceGaps||0).toLocaleString()}</strong></div><div class="col-6 metric"><span>RAM replay</span><strong>${Number(c.ramCacheSeconds||0).toFixed(1)}s</strong></div><div class="col-6 metric"><span>Recording</span><strong>${c.recording?'ACTIVE':'IDLE'}</strong></div><div class="col-6 metric"><span>Received</span><strong>${fmtBytes(c.bytes)}</strong></div><div class="col-6 metric"><span>Uptime</span><strong>${fmtTime(c.uptime_seconds)}</strong></div></div>
      <div class="small text-secondary text-truncate mt-2" title="${esc(c.currentFile||'')}">${esc(c.currentFile||'No active file')}</div>
      <div class="mt-3"><a class="btn btn-sm btn-outline-primary" href="camera.php?stream_id=${encodeURIComponent(c.stream_id)}">History</a></div>
    </div></div>`;
  }
  function ringCard(ring,cameras){
    const live=cameras.filter(c=>c.connected).length;
    const badges=cameras.map(c=>{ const parts=cameraParts(c), state=status(c); return `<div><div class="text-center"><label class="small" for="camera-${esc(c.stream_id)}" class="form-label">Camera ${esc(parts.camera)}</label></div><button type="button" class="badge camera-status-badge text-bg-${state.cls}" data-stream-id="${esc(c.stream_id)}" aria-pressed="false" title="Show details for ${esc(c.stream_id)}">${state.label}</button></div></div>`; }).join('');
    return `<div class="col-12"><div class="card shadow-sm h-100 ring-card"><div class="card-body d-flex flex-column">
      <div class="d-flex justify-content-between align-items-start gap-3"><div><h3 class="h5 mb-1">Ring ${esc(ring)}</h3><div class="small text-secondary">${live} of ${cameras.length} cameras live</div></div><a class="btn btn-primary btn-sm text-nowrap" href="review.php?ring=${encodeURIComponent(ring)}">Ring ${esc(ring)} IVR</a></div>
      <div class="d-flex flex-wrap gap-2 mt-3">${badges}</div>
    </div></div></div>`;
  }
  let selectedStreamId=null, camerasById=new Map();
  function selectCamera(streamId){
    const c=camerasById.get(streamId); if(!c)return;
    selectedStreamId=streamId;
    $('#cameraDetails').html(details(c));
    $('.camera-status-badge').attr('aria-pressed','false').removeClass('selected');
    $('.camera-status-badge').filter(function(){return $(this).attr('data-stream-id')===streamId;}).attr('aria-pressed','true').addClass('selected');
  }
  function refresh(){ $.getJSON('api/cameras.php').done(r=>{
    const cams=r.cameras||[]; camerasById=new Map(cams.map(c=>[String(c.stream_id),c]));
    const rings=new Map();
    cams.forEach(c=>{ const ring=cameraParts(c).ring; if(!Number.isFinite(ring))return; if(!rings.has(ring))rings.set(ring,[]); rings.get(ring).push(c); });
    for(const cameras of rings.values())cameras.sort((a,b)=>cameraParts(a).camera-cameraParts(b).camera);
    const html=[...rings.entries()].sort((a,b)=>a[0]-b[0]).map(([ring,cameras])=>ringCard(ring,cameras)).join('');
    $('#ringGrid').html(html||'<div class="col-12"><div class="alert alert-info">No cameras registered yet. Start freeplay.js, then connect a tablet.</div></div>');
    if(selectedStreamId&&camerasById.has(selectedStreamId))selectCamera(selectedStreamId);
    else if(selectedStreamId){selectedStreamId=null; $('#cameraDetails').html('<div class="card shadow-sm border-secondary"><div class="card-body"><h2 id="cameraDetailsHeading" class="h5">Camera details</h2><p class="text-secondary mb-0">The selected camera is no longer registered. Select another camera status badge.</p></div></div>');}
    const n=cams.filter(x=>x.connected).length; $('#liveCount').text(n+' LIVE').attr('class','badge text-bg-'+(n?'success':'secondary')); $('#updatedAt').text(r.updated_at?'Updated '+new Date(r.updated_at).toLocaleTimeString():'');
  }); }
  $('#ringGrid').on('click','.camera-status-badge',function(){selectCamera(String($(this).attr('data-stream-id')));});
  refresh(); setInterval(refresh,1000);
})();
