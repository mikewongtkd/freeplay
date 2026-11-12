'use strict';
const {parentPort, workerData} = require('worker_threads');
const {ThumbnailEngine} = require('./thumbnail-engine');
let engine, closing = false, background, initialized = false, startup;
const operations = new Set();
function run(message) {
  const operation = (async () => {
    try {
      let result;
      if (message.type === 'metadata') result = await engine.metadata(message.plan);
      else if (message.type === 'image') result = await engine.image(message.key);
      else if (message.type === 'background') result = await engine.background();
      if (message.id) parentPort.postMessage({id:message.id, result});
    } catch (error) {
      if (message.id) parentPort.postMessage({id:message.id, error:{code:error.status ? error.code : 'thumbnail_unavailable', status:error.status || 503, message:error.status ? error.message : 'Thumbnail service unavailable'}});
    }
  })();
  operations.add(operation); void operation.finally(() => operations.delete(operation));
}
// Install shutdown handling before the asynchronous FFmpeg prerequisite probe.
parentPort.on('message', message => {
  if (message.type === 'close' && !closing) {
    closing = true; clearInterval(background);
    for (const child of engine?.children || []) child.kill('SIGKILL');
    void (async () => {
      await startup;
      await Promise.allSettled([...operations]);
      if (engine) await engine.close();
      parentPort.close();
    })();
  } else if (!closing && initialized && message.type === 'priority') {
    engine.paused = message.paused;
    if (message.deferMs) engine.defer(message.deferMs);
    else engine.pump();
  } else if (!closing && initialized) run(message);
});
startup = (async () => {
  try {
    engine = new ThumbnailEngine({...workerData, onMetrics:metrics => parentPort.postMessage({metrics})});
    await engine.initialize();
    if (closing) return;
    initialized = true;
    parentPort.postMessage({ready:true});
    background = setInterval(() => {
      if (closing || operations.size || engine.paused || Date.now() < engine.busyUntil) return;
      run({type:'background'});
    }, workerData.config.intervalMs);
  } catch (_) {
    parentPort.postMessage({startupError:true});
  }
})();
