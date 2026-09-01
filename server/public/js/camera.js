(function(){
 const ctx=document.getElementById('statsChart');
 const chart=new Chart(ctx,{type:'line',data:{labels:[],datasets:[{label:'FPS',data:[],yAxisID:'y'},{label:'Mbps',data:[],yAxisID:'y1'}]},options:{animation:false,responsive:true,interaction:{mode:'index',intersect:false},scales:{y:{position:'left',suggestedMin:0,suggestedMax:35},y1:{position:'right',suggestedMin:0,grid:{drawOnChartArea:false}}}}});
 function refresh(){ $.getJSON('api/stats.php',{stream_id:window.FREEPLAY_STREAM_ID,limit:300}).done(r=>{const s=r.stats||[];chart.data.labels=s.map(x=>new Date(x.ts).toLocaleTimeString());chart.data.datasets[0].data=s.map(x=>Number(x.fps));chart.data.datasets[1].data=s.map(x=>Number(x.bitrate)/1e6);chart.update('none');}); }
 refresh(); setInterval(refresh,2000);
})();
