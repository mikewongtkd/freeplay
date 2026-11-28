'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');

function mediaPath(root, videoDir, stored) {
  if (typeof stored !== 'string' || stored.includes('\0')) throw new Error('Invalid media path');
  const base = fs.realpathSync(videoDir);
  const candidate = path.resolve(root, stored);
  const configured = path.resolve(videoDir);
  const relative = path.relative(configured, candidate);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('Media path escapes configured video root');
  let current = base;
  for (const component of relative.split(path.sep)) {
    current = path.join(current, component);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('Media symlinks are not allowed in inspection mode');
  }
  if (!fs.statSync(current).isFile()) throw new Error('Referenced media is not a regular file');
  return current;
}

function timestampUs(value) {
  // Stream PTS is never a wall clock. Unzoned legacy text remains ambiguous.
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return null;
  const result = Date.parse(value) * 1000;
  return Number.isSafeInteger(result) ? result : null;
}

function inspect(db, {root, videoDir, limit = 1000, onProgress = () => {}}) {
  const findings = []; let total = 0;
  const add = (severity, table, row, code, evidence, action) => {
    total++;
    if (findings.length < limit) findings.push({severity, table, row, code, evidence, recommendedAction:action});
  };
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(r => r.name));
  onProgress({phase:'tables',message:'Counting records in the snapshot',current:0,total:tables.size});
  const counts = {};
  for (const name of tables) {
    counts[name] = db.prepare(`SELECT count(*) AS n FROM "${name.replaceAll('"', '""')}"`).get().n;
    onProgress({phase:'tables',message:`Counted ${name}`,current:Object.keys(counts).length,total:tables.size});
  }
  onProgress({phase:'integrity',message:'Checking SQLite integrity. Large databases can take several minutes; SQLite does not provide a reliable percentage for this check.'});
  for (const result of db.prepare('PRAGMA integrity_check').all()) {
    const message = Object.values(result)[0];
    if (message !== 'ok') add('error', 'database', null, 'integrity', message, 'Preserve the source and recover from a verified backup.');
  }
  onProgress({phase:'foreign-keys',message:'Checking database relationships. This check has no reliable time estimate.'});
  for (const result of db.prepare('PRAGMA foreign_key_check').all()) add('error', result.table, result.rowid, 'foreign_key', result, 'Resolve the missing relationship before extraction.');
  const checks = [
    ['sessions', "SELECT id FROM sessions WHERE ended_at IS NULL", 'unfinished_session', 'warning', 'Confirm whether the session is still recording; preserve incomplete footage.'],
    ['sessions', "SELECT id,started_at,ended_at FROM sessions WHERE julianday(ended_at)<julianday(started_at)", 'invalid_time_range', 'error', 'Resolve timestamp evidence before selection.'],
    ['files', 'SELECT id FROM files WHERE complete=0 OR ended_at IS NULL', 'incomplete_file', 'warning', 'Preserve footage; confirm recording has stopped before archiving.'],
    ['gop_index', 'SELECT id,file_id,complete FROM gop_index WHERE file_id IS NULL OR complete=0', 'incomplete_or_ram_gop', 'info', 'A nullable file reference may be expected RAM-only data; do not discard it.'],
    ['gop_index', 'SELECT id,start_time_epoch_us,end_time_epoch_us FROM gop_index WHERE end_time_epoch_us<start_time_epoch_us OR CAST(end_pts_us AS INTEGER)<CAST(start_pts_us AS INTEGER)', 'invalid_gop_time', 'error', 'Inspect server timestamps and stream-relative PTS separately.'],
    ['cameras', 'SELECT group_concat(id) AS id,ring,camera,count(*) AS n FROM cameras WHERE ring IS NOT NULL AND camera IS NOT NULL GROUP BY ring,camera HAVING count(*)>1', 'duplicate_camera_identity', 'warning', 'Resolve logical ring/camera identity; cameras are shared parents.'],
    ['ivr_matches', "SELECT id,status FROM ivr_matches WHERE status IN ('active','paused')", 'unclosed_match', 'warning', 'Confirm whether this is a live match or a stale historical record.'],
    ['ivr_review_requests', "SELECT id,status FROM ivr_review_requests WHERE status IN ('selected','active')", 'unclosed_review', 'warning', 'Confirm status against the session-based review workflow.'],
    ['ivr_review_requests', 'SELECT q.id,q.ring_id,m.ring_id AS match_ring FROM ivr_review_requests q JOIN ivr_matches m ON m.id=q.match_id WHERE q.ring_id<>m.ring_id', 'review_ring_mismatch', 'error', 'Resolve review/match ring assignments before extraction.'],
    ['ivr_matches', 'SELECT m.id,r.tournament_id,c.tournament_id AS competitor_tournament FROM ivr_matches m JOIN ivr_rings r ON r.id=m.ring_id JOIN ivr_competitors c ON c.id IN (m.chung_competitor_id,m.hong_competitor_id) WHERE c.tournament_id<>r.tournament_id', 'cross_tournament_competitor', 'error', 'Resolve competitor assignments before extraction.'],
  ];
  let checked = 0;
  for (const [table, sql, code, severity, action] of checks) {
    onProgress({phase:'records',message:`Checking ${table}: ${code.replaceAll('_',' ')}`,current:checked++,total:checks.length});
    if (!tables.has(table)) { add('error', table, null, 'missing_table', table, 'Schema is incompatible; do not migrate the source automatically.'); continue; }
    try { for (const row of db.prepare(sql).all()) add(severity, table, row.id, code, row, action); }
    catch (error) { add('error', table, null, 'unsupported_schema', error.message, 'Inspect the deployed schema and migrations.'); }
  }
  onProgress({phase:'records',message:'Record checks finished',current:checks.length,total:checks.length});
  let referencedBytes = 0;
  const files = tables.has('files') ? db.prepare('SELECT * FROM files').all() : [];
  let checkedFiles = 0;
  onProgress({phase:'media',message:`Checking referenced media and GOP byte ranges: 0 of ${files.length} files`,current:0,total:files.length});
  for (const file of files) {
    onProgress({phase:'media',message:`Checking file ${checkedFiles+1} of ${files.length}: ${file.path}`,current:checkedFiles,total:files.length});
    try {
      const resolved = mediaPath(root, videoDir, file.path);
      const stat = fs.statSync(resolved); referencedBytes += stat.size;
      if (stat.size === 0) add('error', 'files', file.id, 'zero_byte_file', file.path, 'Preserve and investigate the recording.');
      if (stat.size !== file.byte_size) add(file.complete ? 'error' : 'warning', 'files', file.id, 'size_mismatch', {path:file.path, indexed:file.byte_size, actual:stat.size}, 'An open recording may have changed since the snapshot; repeat after quiescence.');
      let previousEnd = -1;
      const gops = tables.has('gop_index') ? db.prepare('SELECT * FROM gop_index WHERE file_id=? ORDER BY file_offset,id').all(file.id) : [];
      for (const gop of gops) {
        const offset = gop.file_offset, length = gop.file_length;
        if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 || !Number.isSafeInteger(offset + length) || offset + length > stat.size) {
          add('error', 'gop_index', gop.id, 'invalid_byte_range', {path:file.path, offset, length, size:stat.size}, 'Investigate the index and media; do not delete overlapping or incomplete footage.');
        } else {
          if (offset < previousEnd) add('warning', 'gop_index', gop.id, 'overlapping_byte_range', {offset, previousEnd}, 'Investigate overlapping ranges; no automatic deletion is safe.');
          previousEnd = Math.max(previousEnd, offset + length);
        }
      }
    } catch (error) {
      add(file.complete ? 'error' : 'warning', 'files', file.id, 'unresolved_media', {path:file.path, reason:error.message}, 'Check configured roots, storage availability and incomplete-recording status.');
    }
    onProgress({phase:'media',message:`Checked ${++checkedFiles} of ${files.length} files; ${total} findings so far`,current:checkedFiles,total:files.length});
  }
  return {counts, referencedBytes, findings, findingCount:total, findingsTruncated:total > limit,
    scope:'Consistent database snapshot and referenced-file metadata only; live media can change after snapshot.',
    omittedChecks:['Unreferenced-media traversal (requires maintenance)', 'Deep ffprobe validation (requires maintenance)', 'Safe repair mutations (none established)'],
    repairs:[], archiveEligible:false};
}

function datePreview(db, interval) {
  const {startUs, endUs} = interval || {};
  if (!Number.isSafeInteger(startUs) || !Number.isSafeInteger(endUs) || startUs >= endUs) throw new Error('Invalid half-open UTC interval');
  const all = {};
  for (const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
    all[name] = db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all();
  }
  const required = ['cameras','sessions','files','gop_index','codec_configurations','statistics','events','configuration','test_runs','test_results','ivr_tournaments','ivr_rings','ivr_ring_cameras','ivr_competitors','ivr_matches','ivr_review_requests','ivr_review_decisions','ivr_review_annotations','ivr_review_audit_events'];
  for (const name of required) if (!all[name]) throw new Error(`Unsupported schema: missing ${name}`);
  const selected = Object.fromEntries(required.map(name => [name, new Set()]));
  const ambiguous = []; const boundaryDependencies = [];
  const key = (table, row) => table === 'ivr_ring_cameras' ? `${row.ring_id}:${row.camera_id}` : row.id;
  const add = (table, row) => selected[table].add(key(table, row));
  const overlaps = (start, end) => start < endUs && end >= startUs;
  const inside = value => Number.isSafeInteger(value) && value >= startUs && value < endUs;
  for (const file of all.files) {
    const gops = all.gop_index.filter(g => g.file_id === file.id);
    const valid = gops.filter(g => Number.isSafeInteger(g.start_time_epoch_us) && Number.isSafeInteger(g.end_time_epoch_us) && g.start_time_epoch_us <= g.end_time_epoch_us);
    const start = valid.length ? Math.min(...valid.map(g => g.start_time_epoch_us)) : timestampUs(file.started_at);
    const end = valid.length ? Math.max(...valid.map(g => g.end_time_epoch_us)) : timestampUs(file.ended_at);
    if (start === null || end === null || start > end || !file.complete) {
      ambiguous.push({table:'files', id:file.id, reason:'Missing, incomplete or invalid time bounds; requires explicit resolution.'});
      continue;
    }
    if (overlaps(start, end)) {
      add('files', file);
      for (const gop of gops) add('gop_index', gop);
      if (start < startUs || end >= endUs) boundaryDependencies.push({table:'files', id:file.id, path:file.path, startUs:start, endUs:end, policy:'Retain entire selected media file and all indexed GOPs; never trim binary media.'});
    }
  }
  for (const session of all.sessions) {
    const start = timestampUs(session.started_at), end = timestampUs(session.ended_at);
    if (start === null || end === null || start > end) ambiguous.push({table:'sessions', id:session.id, reason:'Open session or ambiguous timestamp bounds.'});
    else if (overlaps(start, end)) add('sessions', session);
  }
  for (const gop of all.gop_index) if (gop.file_id === null && overlaps(gop.start_time_epoch_us, gop.end_time_epoch_us)) {
    add('gop_index', gop);
    ambiguous.push({table:'gop_index', id:gop.id, reason:'Selected GOP has no persisted media reference; may have been RAM-only.'});
  }
  for (const event of all.events) {
    if (inside(event.event_time_epoch_us)) add('events', event);
    else if (!Number.isSafeInteger(event.event_time_epoch_us)) ambiguous.push({table:'events', id:event.id, reason:'No authoritative epoch timestamp.'});
  }
  for (const match of all.ivr_matches) {
    if (Number.isSafeInteger(match.started_at_epoch_us) && Number.isSafeInteger(match.ended_at_epoch_us) && match.started_at_epoch_us <= match.ended_at_epoch_us) {
      if (overlaps(match.started_at_epoch_us, match.ended_at_epoch_us)) add('ivr_matches', match);
    } else ambiguous.push({table:'ivr_matches', id:match.id, reason:'Match dates cannot be established from match bounds.'});
  }
  for (const review of all.ivr_review_requests) if (inside(review.request_mark_epoch_us)) add('ivr_review_requests', review);
  for (const row of all.configuration) add('configuration', row);
  let changed = true;
  while (changed) {
    const before = Object.values(selected).reduce((n,s) => n+s.size, 0);
    for (const row of all.ivr_review_requests) if (selected.ivr_matches.has(row.match_id)) add('ivr_review_requests', row);
    for (const table of ['ivr_review_decisions','ivr_review_annotations','ivr_review_audit_events']) {
      for (const row of all[table]) if (selected.ivr_review_requests.has(row.review_request_id)) add(table, row);
    }
    for (const row of all.codec_configurations) if (selected.sessions.has(row.session_id)) add('codec_configurations', row);
    for (const row of all.statistics) if (inside(timestampUs(row.sample_time ?? row.ts)) && (selected.sessions.has(row.session_id) || selected.cameras.has(row.camera_id))) add('statistics', row);
    for (const row of all.ivr_ring_cameras) if (selected.ivr_rings.has(row.ring_id)) add('ivr_ring_cameras', row);
    // Foreign-key closure retains required parents, including linked reviews and shared cameras.
    for (const table of required) {
      const relations = db.prepare(`PRAGMA foreign_key_list("${table}")`).all();
      for (const row of all[table]) if (selected[table].has(key(table, row))) {
        for (const fk of relations) {
          const value = row[fk.from];
          if (value == null) continue;
          const parent = all[fk.table]?.find(item => item[fk.to || 'id'] === value);
          if (!parent) throw new Error(`Missing foreign-key parent: ${table}:${key(table,row)} -> ${fk.table}`);
          add(fk.table, parent);
        }
      }
    }
    changed = Object.values(selected).reduce((n,s) => n+s.size, 0) !== before;
  }
  const counts = {}; const excludedCounts = {};
  for (const table of required) { counts[table] = selected[table].size; excludedCounts[table] = all[table].length - counts[table]; }
  const media = all.files.filter(row => selected.files.has(row.id)).map(row => ({id:row.id, path:row.path, indexedBytes:row.byte_size}));
  return {interval, counts, excludedCounts, media, indexedMediaBytes:media.reduce((n,r) => n+r.indexedBytes, 0),
    selectedIds:Object.fromEntries(Object.entries(selected).map(([table,ids]) => [table,[...ids]])),
    ambiguous, boundaryDependencies, archiveEligible:false,
    policy:'Diagnostic preview only. Complete files and foreign-key parents are retained; unrelated full-session media is excluded. Diagnostic tests are excluded. Same-day unrelated events and IVR associations require operator review; resolution/extraction is not enabled.'};
}

function storageProbe(input) {
  if (typeof input !== 'string' || !path.isAbsolute(input) || input.includes('\0') || input.split(path.sep).includes('..')) throw new Error('Expected an absolute mounted path without traversal');
  const supplied = path.resolve(input);
  if (supplied === '/') throw new Error('Filesystem root is not an archive destination');
  let cursor = path.parse(supplied).root;
  for (const segment of supplied.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('Storage mount path must not contain symlinks');
  }
  if (!fs.statSync(supplied).isDirectory()) throw new Error('Storage path is not a directory');
  fs.accessSync(supplied, fs.constants.R_OK | fs.constants.W_OK);
  const stat = fs.statSync(supplied), space = fs.statfsSync(supplied);
  let mount = null;
  if (process.platform === 'linux') {
    const decode = value => value.replace(/\\([0-7]{3})/g, (_,octal) => String.fromCharCode(parseInt(octal,8)));
    for (const line of fs.readFileSync('/proc/self/mountinfo','utf8').trim().split('\n')) {
      const [left,right] = line.split(' - '); if (!right) continue;
      const fields = left.split(' '), extra = right.split(' ');
      if (decode(fields[4]) === supplied) mount = {device:fields[2], root:decode(fields[3]), mountPoint:supplied, filesystem:extra[0], source:decode(extra[1]), options:fields[5]};
    }
  }
  const result = {path:supplied, device:stat.dev, freeBytes:space.bavail*space.bsize, mount,
    verified:false, archiveEligible:false,
    reason:mount ? 'Container mount found. Host SSD backing volume identity and read-only historical access still require commissioning; a bind mount alone does not prove an SSD is present.' : 'No exact mounted volume identity established. No archive or media writes are allowed.'};
  try { result.rsync = execFileSync('/usr/bin/rsync',['--version'],{encoding:'utf8',timeout:3000,maxBuffer:8192}).split('\n').slice(0,2).join('\n'); }
  catch { result.rsync = null; }
  return result;
}

module.exports = {mediaPath, timestampUs, inspect, datePreview, storageProbe};
