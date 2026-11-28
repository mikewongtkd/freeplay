'use strict';

// Keep progress in the existing text column so older administrative stores need
// no migration. Percentages and estimates refer to the current measured stage.
function progressReporter(db, operationId, clock = Date.now) {
  let phase = null, stageStarted = clock(), lastWrite = -Infinity;
  const startedAt = new Date(stageStarted).toISOString();
  return (update, force = false) => {
    const time = clock();
    const changed = update.phase !== phase;
    if (changed) { phase = update.phase; stageStarted = time; }
    const current = Number.isFinite(update.current) ? update.current : null;
    const total = Number.isFinite(update.total) && update.total >= 0 ? update.total : null;
    const finished = current !== null && total !== null && current >= total;
    if (!force && !changed && !finished && time-lastWrite < 750) return;
    lastWrite = time;
    const elapsed = Math.max(0,(time-stageStarted)/1000);
    const measured = current !== null && total !== null;
    const percent = measured ? (total === 0 ? 100 : Math.min(100,Math.max(0,Math.floor(current/total*100)))) : null;
    const etaSeconds = measured && current > 0 && current < total && elapsed >= 2 ? Math.ceil(elapsed*(total-current)/current) : null;
    const value = {phase:update.phase,message:update.message,current,total,percent,etaSeconds,startedAt,
      stageStartedAt:new Date(stageStarted).toISOString(),updatedAt:new Date(time).toISOString()};
    db.prepare('UPDATE operations SET progress=?,updated_at=? WHERE id=?').run(JSON.stringify(value),value.updatedAt,operationId);
    if (changed) db.prepare('INSERT INTO operation_steps(operation_id,step,phase,detail,created_at) VALUES (?,?,?,?,?)')
      .run(operationId,'inspection-progress','complete',JSON.stringify(value),value.updatedAt);
    db.prepare('UPDATE worker_lock SET heartbeat=? WHERE pid=?').run(value.updatedAt,process.pid);
  };
}
module.exports = {progressReporter};
