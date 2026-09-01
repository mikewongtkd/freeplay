(function(){
  function fmtBits(v){ if(!v) return '0 Mbps'; return (v/1e6).toFixed(2)+' Mbps'; }
  function fmtBytes(v){ v=Number(v||0); const u=['B','KB','MB','GB','TB']; let i=0; while(v>=1024&&i<u.length-1){v/=1024;i++;} return v.toFixed(i<2?0:2)+' '+u[i]; }
  function fmtTime(s){ s=Number(s||0); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=Math.floor(s%60); return [h,m,x].map(v=>String(v).padStart(2,'0')).join(':'); }
  function esc(s){ return $('<div>').text(s==null?'':s).html(); }
  function card(c){
    const live=!!c.connected, cls=live?'success':'secondary';
    return `<div class="col-12 col-md-6 col-xl-4"><div class="card shadow-sm h-100 camera-card border-${cls}"><div class="card-body">
      <div class="d-flex justify-content-between"><div><h2 class="h5 mb-0">${esc(c.stream_id)}</h2><div class="small text-secondary">${esc(c.device_model||'Unknown')} · ${esc(c.resolution||'')}</div></div><span class="badge text-bg-${cls}">${live?'STREAMING':'OFFLINE'}</span></div>
      <hr><div class="row g-2 small"><div class="col-6 metric"><span>FPS</span><strong>${Number(c.fps||0).toFixed(2)}</strong></div><div class="col-6 metric"><span>Bitrate</span><strong>${fmtBits(c.bitrate)}</strong></div><div class="col-6 metric"><span>Frames</span><strong>${Number(c.frames||0).toLocaleString()}</strong></div><div class="col-6 metric"><span>Dropped</span><strong>${Number(c.dropped||0).toLocaleString()}</strong></div><div class="col-6 metric"><span>Sent</span><strong>${fmtBytes(c.bytes)}</strong></div><div class="col-6 metric"><span>Uptime</span><strong>${fmtTime(c.uptime_seconds)}</strong></div></div>
      <div class="mt-3"><a class="btn btn-sm btn-outline-primary" href="camera.php?stream_id=${encodeURIComponent(c.stream_id)}">History</a></div>
    </div></div></div>`;
  }
  function refresh(){ $.getJSON('api/cameras.php').done(r=>{ const cams=r.cameras||[]; $('#cameraGrid').html(cams.length?cams.map(card).join(''):'<div class="col-12"><div class="alert alert-info">No cameras registered yet. Start freeplay.js, then connect a tablet.</div></div>'); const n=cams.filter(x=>x.connected).length; $('#liveCount').text(n+' LIVE').attr('class','badge text-bg-'+(n?'success':'secondary')); $('#updatedAt').text(r.updated_at?'Updated '+new Date(r.updated_at).toLocaleTimeString():''); }); }
  refresh(); setInterval(refresh,1000);
})();
