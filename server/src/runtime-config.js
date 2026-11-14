'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..');
const FALLBACK_CONFIG = Object.freeze({root:DEFAULT_ROOT, dataDir:'/data', schemaPath:path.join(DEFAULT_ROOT, 'share', 'freeplay', 'db', 'schema.sql'), videoDir:'/data/video', db:'/data/freeplay.sqlite', port:9000});

function loadConfig(directory = __dirname) {
  const source = path.resolve(directory, 'config.json');
  let document;
  try { document = fs.readFileSync(source, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    try {
      fs.copyFileSync(path.resolve(directory, 'config-default.json'), source, fs.constants.COPYFILE_EXCL);
    } catch (copyError) {
      // Another process may have created the local configuration during startup.
      if (copyError.code !== 'EEXIST') return {...FALLBACK_CONFIG};
    }
    document = fs.readFileSync(source, 'utf8');
  }
  let config;
  try { config = JSON.parse(document).fpConf; }
  catch (_) { throw new Error(`Invalid JSON configuration: ${source}`); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuration requires an fpConf object');
  for (const key of ['videoDir', 'db']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error(`fpConf.${key} must be a nonempty path`);
  }
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error('fpConf.port must be an integer from 0 to 65535');
  for (const key of ['root', 'dataDir', 'schemaPath']) {
    if (config[key] !== undefined && (typeof config[key] !== 'string' || !config[key].trim())) throw new Error(`fpConf.${key} must be a nonempty path`);
  }
  const root = config.root === undefined ? DEFAULT_ROOT : path.resolve(directory, config.root);
  return {...config, root,
    dataDir:path.resolve(directory, config.dataDir ?? '/data'),
    schemaPath:path.resolve(root, config.schemaPath ?? path.join('share', 'freeplay', 'db', 'schema.sql')),
    videoDir:path.resolve(directory, config.videoDir), db:path.resolve(directory, config.db)};
}
module.exports = {loadConfig};
