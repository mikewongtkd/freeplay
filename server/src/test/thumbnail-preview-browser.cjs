#!/usr/bin/env node
'use strict';
// Optional real-browser acceptance harness; uses the production views/CSS/component and mock thumbnail responses.
const fs=require('fs'),path=require('path'),http=require('http'),os=require('os');
const {spawnSync,spawn}=require('child_process');
const root=path.resolve(__dirname,'../..'),publicRoot=path.join(root,'public');
const php=process.env.PHP_BIN||'php';
function view(name){const result=spawnSync(php,[path.join(publicRoot,'review/views',name)],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||'PHP unavailable');return result.stdout;}
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/vendor/bootstrap/5.3.3/css/bootstrap.min.css"><link rel="stylesheet" href="/review/assets/css/app.css"><link rel="stylesheet" href="/review/assets/css/timeline.css"><link rel="stylesheet" href="/review/assets/css/responsive.css"></head><body class="ivr-body"><header class="ivr-header" style="height:58px">TTP acceptance harness</header><main class="ivr-shell" id="ivrMain"><section id="statusStrip" class="status-strip empty"></section>${view('mcv.php')}${view('scv.php')}${view('timeline.php')}${view('playback-controls.php')}</main><pre id="report" style="position:fixed;z-index:9999;top:0;left:0"></pre><script src="/vendor/jquery/3.7.1/jquery.min.js"></script><script type="module" src="/harness.js"></script></body></html>`;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
 const filename=url.pathname==='/harness.js'?path.join(__dirname,'thumbnail-preview-browser.mjs'):path.resolve(publicRoot,'.'+url.pathname);
 if(filename!==path.join(__dirname,'thumbnail-preview-browser.mjs')&&!filename.startsWith(publicRoot+path.sep)){res.statusCode=404;return res.end();}
 fs.readFile(filename,(error,bytes)=>{if(error){res.statusCode=404;return res.end();}res.setHeader('Content-Type',filename.endsWith('.css')?'text/css':/\.m?js$/.test(filename)?'text/javascript':filename.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(bytes);});
});
server.listen(0,'127.0.0.1',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'freeplay-ttp-chrome-'));
 const chrome=process.env.CHROME_BIN||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':'google-chrome');
 const target=`http://127.0.0.1:${server.address().port}/`;
 const child=spawn(chrome,['--headless','--disable-gpu','--no-first-run','--disable-background-networking','--disable-renderer-backgrounding',`--user-data-dir=${dir}`,'--window-size=1366,900','--remote-debugging-port=0',target],{stdio:['ignore','ignore','pipe']});
 let errors='',socket;
 child.stderr.on('data',bytes=>{errors=(errors+bytes).slice(-2000);});
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 try {
  for(let i=0;i<100&&!fs.existsSync(path.join(dir,'DevToolsActivePort'));i++)await pause(50);
  const port=fs.readFileSync(path.join(dir,'DevToolsActivePort'),'utf8').split('\n')[0];
  let page;
  for(let i=0;i<100&&!page;i++){page=(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json())).find(p=>p.type==='page'&&p.url===target);if(!page)await pause(50);}
  const WS=require('ws');socket=new WS(page.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  let id=0;const pending=new Map();socket.on('message',data=>{const message=JSON.parse(data);if(message.id){pending.get(message.id)?.(message.result);pending.delete(message.id);}});
  const command=(method,params)=>new Promise(resolve=>{const seq=++id;pending.set(seq,resolve);socket.send(JSON.stringify({id:seq,method,params}));});
  let report;
  for(let i=0;i<200;i++){
   const value=await command('Runtime.evaluate',{expression:'document.getElementById("report")?.textContent',returnByValue:true});
   if(value.result?.value){report=JSON.parse(value.result.value);break;}await pause(100);
  }
  if(!report)throw new Error('Browser harness did not finish: '+errors);
  console.log(JSON.stringify(report,null,2));process.exitCode=report.ok?0:1;
 }catch(error){console.error(error);process.exitCode=1;}
 finally{socket?.close();child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));server.closeAllConnections();server.close();fs.rmSync(dir,{recursive:true,force:true});}
});
