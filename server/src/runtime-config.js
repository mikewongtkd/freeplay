'use strict';
const fs = require('fs');
const path = require('path');

function loadConfig(filename = path.join(__dirname, 'config.json'), {fallback = true} = {}) {
  let source = path.resolve(filename), document;
  try { document = fs.readFileSync(source, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT' || !fallback) throw error;
    source = path.join(__dirname, 'config-default.json');
    document = fs.readFileSync(source, 'utf8');
  }
  let config;
  try { config = JSON.parse(document).fp_conf; }
  catch (_) { throw new Error(`Invalid JSON configuration: ${source}`); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuration requires an fp_conf object');
  for (const key of ['video_dir', 'db']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error(`fp_conf.${key} must be a nonempty path`);
  }
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('fp_conf.port must be an integer from 0 to 65535');
  return {...config, video_dir:path.resolve(path.dirname(source), config.video_dir), db:path.resolve(path.dirname(source), config.db)};
}
module.exports = {loadConfig};
