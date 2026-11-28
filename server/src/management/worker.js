#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {inspect, datePreview, storageProbe} = require('./inspection');
const {progressReporter} = require('./progress');
const now = () => new Date().toISOString();
const configPath=path.join(__dirname,'..','config.json');
if(!fs.existsSync(configPath)) {
  try {
    fs.copyFileSync(path.join(__dirname,'config-default.json'),configPath,fs.constants.COPYFILE_EXCL);
  } catch(err) {
    if(err.code!=='EEXIST') throw err;
  }
}

const {fpConf}=require(configPath);
function configuration(configFile = process.env.FREEPLAY_CONFIG || path.join(__dirname,'..','config.json')) {
  const {fpConf:c} = JSON.parse(fs.readFileSync(configFile,'utf8'));
  if (!c || typeof c !== 'object') throw new Error('Missing fpConf');
  const base = path.dirname(configFile);
  const root = path.resolve(base,c.root || '..');
  const dataDir = path.resolve(c.dataDir || '/data');
  const db = path.resolve(c.db || path.join(dataDir,'freeplay.sqlite'));
  const managementDb = path.resolve(c.managementDb || path.join(dataDir,'management.sqlite'));
  if (db === managementDb) throw new Error('Management database must be separate');
  if (!fs.statSync(path.dirname(managementDb)).isDirectory()) throw new Error('Management storage directory is unavailable');
  for (const target of [db,managementDb]) if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('Database symlinks are not supported');
  if (fs.existsSync(db) && fs.existsSync(managementDb)) {
    const a = fs.statSync(db), b = fs.statSync(managementDb);
    if (a.dev === b.dev && a.ino === b.ino) throw new Error('Management database aliases tournament database');
  }
  return {root, dataDir, db, managementDb, videoDir:path.resolve(c.videoDir || path.join(dataDir,'video'))};
}

function store(Database, config, schemaFile) {
  const db = new Database(config.managementDb);
  db.pragma('busy_timeout=5000'); db.pragma('journal_mode=WAL'); db.pragma('synchronous=FULL');
  db.exec(fs.readFileSync(schemaFile,'utf8'));
  return db;
}

function acquire(db, owner) {
  db.transaction(() => {
    const prior = db.prepare('SELECT * FROM worker_lock WHERE singleton=1').get();
    if (prior) throw new Error(`Administrative worker lock exists (${prior.hostname}, PID ${prior.pid}). Verify the old worker is stopped before manual recovery; locks are never stolen on a timer.`);
    db.prepare('INSERT INTO worker_lock VALUES (1,?,?,?,?)').run(owner,process.pid,os.hostname(),now());
    // A previous worker that died without releasing ownership requires operator recovery.
    const unfinished = db.prepare("SELECT id FROM operations WHERE state='running'").all();
    for (const op of unfinished) db.prepare("UPDATE operations SET state='recovery_required',error=?,updated_at=? WHERE id=?").run('Interrupted operation. Preserve its snapshot and consult the recovery guide.',now(),op.id);
  }).immediate();
}

function journal(db, id, step, phase, detail) {
  db.prepare('INSERT INTO operation_steps(operation_id,step,phase,detail,created_at) VALUES (?,?,?,?,?)').run(id,step,phase,JSON.stringify(detail),now());
}

async function executeNext(db, Database, config) {
  const op = db.transaction(() => {
    const item = db.prepare("SELECT * FROM operations WHERE state='queued' ORDER BY created_at LIMIT 1").get();
    if (item) db.prepare("UPDATE operations SET state='running',progress='Starting inspection',updated_at=? WHERE id=?").run(now(),item.id);
    return item;
  }).immediate();
  if (!op) return false;
  const report = progressReporter(db,op.id);
  report({phase:'preparing',message:'Preparing inspection and checking snapshot space'});
  let source, snapshot;
  try {
    const params = JSON.parse(op.parameters);
    let result;
    if (op.type === 'storage-probe') {
      journal(db,op.id,'storage-probe','intent',{path:params.storagePath,readOnly:true});
      result = storageProbe(params.storagePath);
      journal(db,op.id,'storage-probe','complete',result);
    } else if (['inspect','date-preview'].includes(op.type)) {
      if (!/^[a-f0-9]{32}$/.test(op.id)) throw new Error('Invalid operation ID');
      if (!fs.statSync(config.db).isFile() || fs.lstatSync(config.db).isSymbolicLink()) throw new Error('Source database must be an existing regular file');
      const mainBytes = fs.statSync(config.db).size;
      const walBytes = fs.existsSync(config.db+'-wal') ? fs.statSync(config.db+'-wal').size : 0;
      const space = fs.statfsSync(path.dirname(config.managementDb));
      const requiredBytes = Math.ceil((mainBytes + walBytes) * 1.2) + 64 * 1024 * 1024;
      if (space.bavail * space.bsize < requiredBytes) throw new Error('Insufficient local space for a snapshot and safety reserve');
      journal(db,op.id,'snapshot-space-preflight','complete',{requiredBytes,availableBytes:space.bavail*space.bsize});
      const base = path.join(path.dirname(config.managementDb),'management-work');
      journal(db,op.id,'ensure-work-root','intent',{path:base});
      if (fs.existsSync(base)) {
        if (!fs.lstatSync(base).isDirectory() || fs.lstatSync(base).isSymbolicLink()) throw new Error('Unsafe management work directory');
      } else fs.mkdirSync(base,{mode:0o700});
      journal(db,op.id,'ensure-work-root','complete',{path:base});
      const owned = path.join(base,op.id);
      db.prepare('UPDATE operations SET owned_path=?,updated_at=? WHERE id=?').run(owned,now(),op.id);
      journal(db,op.id,'create-owned-directory','intent',{path:owned});
      fs.mkdirSync(owned,{mode:0o700});
      journal(db,op.id,'create-owned-directory','complete',{path:owned});
      const file = path.join(owned,'snapshot.sqlite');
      journal(db,op.id,'sqlite-backup','intent',{source:config.db,destination:file});
      report({phase:'backup',message:'Creating a consistent snapshot. Recording activity and database size affect copy time.'});
      source = new Database(config.db,{readonly:true,fileMustExist:true});
      source.pragma('busy_timeout=5000'); source.pragma('query_only=ON');
      await source.backup(file,{progress:({totalPages,remainingPages}) => {
        report({phase:'backup',message:`Copying snapshot: ${totalPages-remainingPages} of ${totalPages} database pages`,current:totalPages-remainingPages,total:totalPages});
        return 200;
      }});
      source.close(); source = null;
      journal(db,op.id,'sqlite-backup','complete',{destination:file});
      snapshot = new Database(file,{readonly:true,fileMustExist:true}); snapshot.pragma('query_only=ON');
      report({phase:'analysis',message:op.type === 'inspect' ? 'Starting snapshot checks' : 'Resolving date selection and dependencies; duration depends on database size'});
      if (op.type === 'inspect') result = inspect(snapshot,{...config,onProgress:report});
      else if (params.intervals) {
        result = {selectedDates:params.dates,timezone:'UTC',previews:params.intervals.map(interval => datePreview(snapshot,interval)),
          archiveEligible:false,policy:'Separate previews for the selected UTC recording dates only. Shared boundary dependencies can appear in more than one preview; counts must not be summed.'};
      } else result = datePreview(snapshot,params.interval);
      result.snapshot = file;
      snapshot.close(); snapshot = null;
    } else throw new Error('Operation is not allowlisted');
    journal(db,op.id,'result','complete',{readOnlySource:true});
    report({phase:'complete',message:op.type === 'inspect' ? `Inspection complete: ${result.findingCount} findings. Source unchanged.` : 'Completed; source unchanged',current:1,total:1},true);
    db.prepare("UPDATE operations SET state='completed',result=?,updated_at=? WHERE id=?").run(JSON.stringify(result),now(),op.id);
  } catch (error) {
    journal(db,op.id,'operation','error',{message:error.message, recovery:'Source was not modified. Preserve any operation-owned snapshot for diagnosis.'});
    db.prepare("UPDATE operations SET state='failed',error=?,progress='Failed; source unchanged',updated_at=? WHERE id=?").run(error.message,now(),op.id);
  } finally { if (snapshot) snapshot.close(); if (source) source.close(); }
  return true;
}

async function main() {
  const Database = require('better-sqlite3');
  const config = configuration();
  const candidates = [path.join(fpConf.schemaDir,'management.sql'),'/usr/share/freeplay/db/management.sql', '/opt/freeplay/db/management.sql'].filter(Boolean);
  const schema = candidates.find(file => fs.existsSync(file));
  if (!schema) throw new Error('Management schema unavailable');
  const db = store(Database,config,schema), owner = crypto.randomUUID();
  let acquired = false, stopping = false;
  try {
    acquire(db,owner); acquired = true;
    process.on('SIGTERM',() => { stopping = true; }); process.on('SIGINT',() => { stopping = true; });
    console.log(JSON.stringify({event:'management_worker_start',mode:'INSPECTION_ONLY',pid:process.pid}));
    while (!stopping) {
      db.prepare('UPDATE worker_lock SET heartbeat=? WHERE owner=?').run(now(),owner);
      await executeNext(db,Database,config);
      if (!stopping) await new Promise(resolve => setTimeout(resolve,1000));
    }
  } finally {
    if (acquired) db.prepare('DELETE FROM worker_lock WHERE owner=?').run(owner);
    db.close();
  }
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({event:'management_worker_error',error:error.message})); process.exitCode = 1; });
module.exports = {configuration,store,acquire,journal,executeNext};
