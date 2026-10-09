PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS cameras (id INTEGER PRIMARY KEY AUTOINCREMENT,stream_id TEXT UNIQUE NOT NULL,ring_no INTEGER,camera_no INTEGER,device_model TEXT,resolution TEXT,fps_target REAL,bitrate_target INTEGER,ring INTEGER,camera INTEGER,device TEXT,manufacturer TEXT,android_version TEXT,app_version TEXT,encoder TEXT,codec TEXT,width INTEGER,height INTEGER,fps REAL,bitrate INTEGER,keyframe_interval REAL,last_seen_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_cameras_ring_camera ON cameras(ring,camera);
CREATE TABLE IF NOT EXISTS sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,camera_id INTEGER NOT NULL,stream_id TEXT,start_time TEXT,end_time TEXT,started_at TEXT,ended_at TEXT,remote_address TEXT,codec TEXT,width INTEGER,height INTEGER,fps REAL,bitrate INTEGER,keyframe_interval REAL,encoder TEXT,codec_config_version INTEGER NOT NULL DEFAULT 0,disconnect_reason TEXT,bytes_total INTEGER NOT NULL DEFAULT 0,frames_total INTEGER NOT NULL DEFAULT 0,dropped_total INTEGER NOT NULL DEFAULT 0,keyframes_total INTEGER NOT NULL DEFAULT 0,recording_path TEXT,FOREIGN KEY(camera_id) REFERENCES cameras(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_sessions_camera_started ON sessions(camera_id,started_at);
CREATE TABLE IF NOT EXISTS codec_configurations (id INTEGER PRIMARY KEY AUTOINCREMENT,camera_id INTEGER NOT NULL,session_id INTEGER NOT NULL,version INTEGER NOT NULL,received_at TEXT NOT NULL,pts_us TEXT,format TEXT NOT NULL DEFAULT 'avcC',sps BLOB NOT NULL,pps BLOB NOT NULL,avcc BLOB NOT NULL,UNIQUE(session_id,version),FOREIGN KEY(camera_id) REFERENCES cameras(id),FOREIGN KEY(session_id) REFERENCES sessions(id));
CREATE INDEX IF NOT EXISTS idx_codec_config_session ON codec_configurations(session_id,version);
CREATE TABLE IF NOT EXISTS statistics (id INTEGER PRIMARY KEY AUTOINCREMENT,camera_id INTEGER NOT NULL,session_id INTEGER,ts TEXT,sample_time TEXT,fps REAL NOT NULL DEFAULT 0,bitrate INTEGER NOT NULL DEFAULT 0,bitrate_bps INTEGER NOT NULL DEFAULT 0,frames INTEGER NOT NULL DEFAULT 0,dropped INTEGER NOT NULL DEFAULT 0,bytes INTEGER NOT NULL DEFAULT 0,keyframes INTEGER NOT NULL DEFAULT 0,reconnects INTEGER NOT NULL DEFAULT 0,bytes_received INTEGER NOT NULL DEFAULT 0,buffers_received INTEGER NOT NULL DEFAULT 0,codec_config_buffers INTEGER NOT NULL DEFAULT 0,sequence_gaps INTEGER NOT NULL DEFAULT 0,estimated_missing_buffers INTEGER NOT NULL DEFAULT 0,ram_cache_seconds REAL NOT NULL DEFAULT 0,ram_cache_bytes INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(camera_id) REFERENCES cameras(id) ON DELETE CASCADE,FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_statistics_camera_ts ON statistics(camera_id,ts);
CREATE INDEX IF NOT EXISTS idx_statistics_session_sample ON statistics(session_id,sample_time);
CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT,camera_id INTEGER NOT NULL,session_id INTEGER NOT NULL,path TEXT UNIQUE NOT NULL,started_at TEXT NOT NULL,ended_at TEXT,start_pts_us TEXT,end_pts_us TEXT,byte_size INTEGER NOT NULL DEFAULT 0,gop_count INTEGER NOT NULL DEFAULT 0,codec_config_version INTEGER,complete INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(camera_id) REFERENCES cameras(id),FOREIGN KEY(session_id) REFERENCES sessions(id));
CREATE INDEX IF NOT EXISTS idx_files_camera_started ON files(camera_id,started_at);
CREATE TABLE IF NOT EXISTS gop_index (id INTEGER PRIMARY KEY AUTOINCREMENT,camera_id INTEGER NOT NULL,session_id INTEGER NOT NULL,file_id INTEGER,start_time_epoch_us INTEGER NOT NULL,end_time_epoch_us INTEGER NOT NULL,start_pts_us TEXT NOT NULL,end_pts_us TEXT NOT NULL,keyframe_pts_us TEXT NOT NULL,sequence_start INTEGER,sequence_end INTEGER,byte_size INTEGER NOT NULL,buffer_count INTEGER NOT NULL,file_offset INTEGER,file_length INTEGER,complete INTEGER NOT NULL DEFAULT 1,sequence_gap_count INTEGER NOT NULL DEFAULT 0,estimated_missing_buffers INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(camera_id) REFERENCES cameras(id),FOREIGN KEY(session_id) REFERENCES sessions(id),FOREIGN KEY(file_id) REFERENCES files(id));
CREATE INDEX IF NOT EXISTS idx_gop_camera_start ON gop_index(camera_id,start_time_epoch_us);
CREATE INDEX IF NOT EXISTS idx_gop_camera_end ON gop_index(camera_id,end_time_epoch_us);
CREATE INDEX IF NOT EXISTS idx_gop_file ON gop_index(file_id);
CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT,camera_id INTEGER,ring INTEGER,event_time_epoch_us INTEGER,pre_roll_ms INTEGER NOT NULL DEFAULT 8000,post_roll_ms INTEGER NOT NULL DEFAULT 4000,label TEXT,notes TEXT,ts TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,event_type TEXT,message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(camera_id) REFERENCES cameras(id) ON DELETE SET NULL);
CREATE INDEX IF NOT EXISTS idx_events_ring_time ON events(ring,event_time_epoch_us);
CREATE TABLE IF NOT EXISTS configuration (id INTEGER PRIMARY KEY AUTOINCREMENT,key TEXT UNIQUE NOT NULL,value TEXT,description TEXT);
INSERT OR IGNORE INTO configuration(key,value,description) VALUES ('stats_flush_seconds','1','Statistics persistence interval'),('ram_replay_seconds','60','Completed GOP cache duration'),('ram_replay_max_bytes','67108864','Per-camera RAM safety limit'),('record_file_seconds','60','fMP4 rotation interval'),('max_rings','14','Maximum ring number'),('cameras_per_ring','3','Cameras per ring'),('request_keyframe_on_connect','1','Request keyframe after hello'),('stale_socket_seconds','15','Disconnect silent sockets');
CREATE TABLE IF NOT EXISTS test_runs (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,started_at TEXT NOT NULL,completed_at TEXT,status TEXT NOT NULL,config_snapshot_json TEXT,notes TEXT);
CREATE TABLE IF NOT EXISTS test_results (id INTEGER PRIMARY KEY AUTOINCREMENT,test_run_id INTEGER NOT NULL,test_id TEXT NOT NULL,category TEXT NOT NULL,name TEXT NOT NULL,description TEXT,status TEXT NOT NULL,severity TEXT,test_type TEXT,started_at TEXT,completed_at TEXT,duration_ms INTEGER,expected_json TEXT,actual_json TEXT,metrics_json TEXT,observations_json TEXT,recommendation TEXT,FOREIGN KEY(test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_test_results_run ON test_results(test_run_id);
CREATE INDEX IF NOT EXISTS idx_test_results_test ON test_results(test_id);
CREATE INDEX IF NOT EXISTS idx_test_results_category ON test_results(category);
CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);

-- IVR MVP domain data. These tables deliberately use the ivr_ prefix so that
-- tournament/review records remain distinct from ingestion protocol events.
CREATE TABLE IF NOT EXISTS ivr_tournaments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE,
    name TEXT NOT NULL,
    venue TEXT,
    starts_at TEXT,
    ends_at TEXT,
    status TEXT NOT NULL DEFAULT 'planned'
        CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ivr_tournaments_status ON ivr_tournaments(status);

CREATE TABLE IF NOT EXISTS ivr_rings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    ring_number INTEGER NOT NULL CHECK (ring_number > 0),
    name TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tournament_id, ring_number),
    FOREIGN KEY (tournament_id) REFERENCES ivr_tournaments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ivr_rings_tournament ON ivr_rings(tournament_id, ring_number);

CREATE TABLE IF NOT EXISTS ivr_ring_cameras (
    ring_id INTEGER NOT NULL,
    camera_id INTEGER NOT NULL,
    display_name TEXT,
    sync_offset_ms INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ring_id, camera_id),
    FOREIGN KEY (ring_id) REFERENCES ivr_rings(id) ON DELETE CASCADE,
    FOREIGN KEY (camera_id) REFERENCES cameras(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ivr_ring_cameras_camera ON ivr_ring_cameras(camera_id);

CREATE TABLE IF NOT EXISTS ivr_competitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tournament_id INTEGER NOT NULL,
    external_id TEXT,
    display_name TEXT NOT NULL,
    team_name TEXT,
    country_code TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tournament_id, external_id),
    FOREIGN KEY (tournament_id) REFERENCES ivr_tournaments(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ivr_competitors_tournament_name ON ivr_competitors(tournament_id, display_name);

CREATE TABLE IF NOT EXISTS ivr_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ring_id INTEGER NOT NULL,
    external_id TEXT,
    match_number TEXT NOT NULL,
    division TEXT,
    stage TEXT,
    round_number INTEGER CHECK (round_number IS NULL OR round_number > 0),
    chung_competitor_id INTEGER,
    hong_competitor_id INTEGER,
    chung_quota INTEGER NOT NULL DEFAULT 1 CHECK (chung_quota >= 0),
    hong_quota INTEGER NOT NULL DEFAULT 1 CHECK (hong_quota >= 0),
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'active', 'paused', 'completed', 'cancelled')),
    scheduled_at TEXT,
    started_at_epoch_us INTEGER,
    ended_at_epoch_us INTEGER,
    recording_start_epoch_us INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (ring_id, match_number),
    UNIQUE (ring_id, external_id),
    CHECK (chung_competitor_id IS NULL OR hong_competitor_id IS NULL OR chung_competitor_id <> hong_competitor_id),
    CHECK (ended_at_epoch_us IS NULL OR started_at_epoch_us IS NULL OR ended_at_epoch_us >= started_at_epoch_us),
    FOREIGN KEY (ring_id) REFERENCES ivr_rings(id) ON DELETE RESTRICT,
    FOREIGN KEY (chung_competitor_id) REFERENCES ivr_competitors(id) ON DELETE RESTRICT,
    FOREIGN KEY (hong_competitor_id) REFERENCES ivr_competitors(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_ivr_matches_ring_status ON ivr_matches(ring_id, status);
CREATE INDEX IF NOT EXISTS idx_ivr_matches_chung ON ivr_matches(chung_competitor_id);
CREATE INDEX IF NOT EXISTS idx_ivr_matches_hong ON ivr_matches(hong_competitor_id);

CREATE TABLE IF NOT EXISTS ivr_review_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    ring_id INTEGER NOT NULL,
    match_id INTEGER,
    linked_review_id INTEGER,
    side TEXT NOT NULL CHECK (side IN ('chung', 'hong')),
    origin TEXT NOT NULL CHECK (origin IN ('coach', 'referee')),
    issue_type TEXT NOT NULL DEFAULT 'standard'
        CHECK (issue_type IN ('standard', 'technical')),
    reason TEXT,
    issues_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(issues_json)),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'selected', 'active', 'completed', 'resolved_without_review', 'cancelled')),
    request_mark_epoch_us INTEGER NOT NULL,
    window_start_epoch_us INTEGER NOT NULL,
    window_end_epoch_us INTEGER NOT NULL,
    review_start_epoch_us INTEGER,
    aur_epoch_us INTEGER,
    aur_outside_window INTEGER NOT NULL DEFAULT 0 CHECK (aur_outside_window IN (0, 1)),
    cameras_available_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cameras_available_json)),
    cameras_reviewed_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cameras_reviewed_json)),
    operator_identity TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (window_end_epoch_us >= window_start_epoch_us),
    CHECK (request_mark_epoch_us >= window_start_epoch_us AND request_mark_epoch_us <= window_end_epoch_us),
    FOREIGN KEY (ring_id) REFERENCES ivr_rings(id) ON DELETE RESTRICT,
    FOREIGN KEY (match_id) REFERENCES ivr_matches(id) ON DELETE SET NULL,
    FOREIGN KEY (linked_review_id) REFERENCES ivr_review_requests(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_ivr_review_requests_ring_status ON ivr_review_requests(ring_id, status);
CREATE INDEX IF NOT EXISTS idx_ivr_review_requests_match_time ON ivr_review_requests(match_id, request_mark_epoch_us);
CREATE INDEX IF NOT EXISTS idx_ivr_review_requests_window ON ivr_review_requests(ring_id, window_start_epoch_us, window_end_epoch_us);

CREATE TABLE IF NOT EXISTS ivr_review_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_request_id INTEGER NOT NULL UNIQUE,
    result TEXT NOT NULL
        CHECK (result IN ('accepted', 'rejected', 'ivr_issue', 'resolved_without_review')),
    decided_at_epoch_us INTEGER NOT NULL,
    review_duration_ms INTEGER CHECK (review_duration_ms IS NULL OR review_duration_ms >= 0),
    quota_outcome TEXT
        CHECK (quota_outcome IS NULL OR quota_outcome IN ('retained', 'consumed', 'returned', 'not_applicable')),
    recommendations TEXT,
    operator_identity TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (review_request_id) REFERENCES ivr_review_requests(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ivr_review_decisions_time ON ivr_review_decisions(decided_at_epoch_us);

CREATE TABLE IF NOT EXISTS ivr_review_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_request_id INTEGER NOT NULL UNIQUE,
    review_jury TEXT,
    reason TEXT,
    gam_jeom_type TEXT,
    explanation TEXT,
    notes TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (review_request_id) REFERENCES ivr_review_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ivr_review_audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_request_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    occurred_at_epoch_us INTEGER NOT NULL,
    actor_identity TEXT,
    data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data_json)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (review_request_id) REFERENCES ivr_review_requests(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ivr_review_audit_request_time ON ivr_review_audit_events(review_request_id, occurred_at_epoch_us);
