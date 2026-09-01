PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cameras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stream_id TEXT NOT NULL UNIQUE,
    ring_no INTEGER,
    camera_no INTEGER,
    device_model TEXT,
    resolution TEXT,
    fps_target REAL,
    codec TEXT,
    bitrate_target INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT,
    bytes_total INTEGER NOT NULL DEFAULT 0,
    frames_total INTEGER NOT NULL DEFAULT 0,
    dropped_total INTEGER NOT NULL DEFAULT 0,
    keyframes_total INTEGER NOT NULL DEFAULT 0,
    recording_path TEXT,
    FOREIGN KEY(camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id INTEGER NOT NULL,
    ts TEXT NOT NULL,
    fps REAL NOT NULL DEFAULT 0,
    bitrate INTEGER NOT NULL DEFAULT 0,
    frames INTEGER NOT NULL DEFAULT 0,
    dropped INTEGER NOT NULL DEFAULT 0,
    bytes INTEGER NOT NULL DEFAULT 0,
    keyframes INTEGER NOT NULL DEFAULT 0,
    reconnects INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_statistics_camera_ts
    ON statistics(camera_id, ts);

CREATE TABLE IF NOT EXISTS configuration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id INTEGER,
    ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT NOT NULL,
    message TEXT,
    FOREIGN KEY(camera_id) REFERENCES cameras(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO configuration(key, value, description) VALUES
('stats_flush_seconds', '1', 'How often live statistics are persisted to SQLite'),
('record_raw_h264', '0', 'Save incoming H.264 payloads to data/video when set to 1');
