<?php
require __DIR__ . '/common.php';
$liveFile = fp_data_dir() . '/live-status.json';
$live = ['updated_at'=>null,'cameras'=>[]];
if (is_file($liveFile)) {
    $decoded = json_decode(file_get_contents($liveFile), true);
    if (is_array($decoded)) $live = $decoded;
}
$db = fp_db();
$rows = $db->query('SELECT * FROM cameras ORDER BY COALESCE(ring_no,9999), COALESCE(camera_no,9999), stream_id')->fetchAll(PDO::FETCH_ASSOC);
$out = [];
foreach ($rows as $row) {
    $ls = $live['cameras'][$row['stream_id']] ?? null;
    $out[] = array_merge($row, $ls ?: ['connected'=>false,'fps'=>0,'bitrate'=>0,'frames'=>0,'dropped'=>0,'bytes'=>0,'keyframes'=>0,'uptime_seconds'=>0,'last_frame_ms'=>null]);
}
fp_json(['updated_at'=>$live['updated_at'] ?? null,'cameras'=>$out]);
