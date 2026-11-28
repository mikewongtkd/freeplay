PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS management_state (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    mode TEXT NOT NULL,
    detail TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO management_state VALUES
    (1,'INSPECTION_ONLY','Service coordination and historical replay are not commissioned.',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('inspect','date-preview','storage-probe')),
    state TEXT NOT NULL CHECK(state IN ('queued','running','completed','failed','cancelled','recovery_required')),
    parameters TEXT NOT NULL,
    result TEXT,
    error TEXT,
    progress TEXT NOT NULL DEFAULT 'Waiting for administrative worker',
    owned_path TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS management_one_operation ON operations((1))
    WHERE state IN ('queued','running','recovery_required');
CREATE TABLE IF NOT EXISTS operation_steps (
    id INTEGER PRIMARY KEY,
    operation_id TEXT NOT NULL REFERENCES operations(id),
    step TEXT NOT NULL,
    phase TEXT NOT NULL CHECK(phase IN ('intent','complete','error')),
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS worker_lock (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    owner TEXT NOT NULL,
    pid INTEGER NOT NULL,
    hostname TEXT NOT NULL,
    heartbeat TEXT NOT NULL
);
