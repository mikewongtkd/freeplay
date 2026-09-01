<?php
require __DIR__ . '/common.php';
$streamId = $_GET['stream_id'] ?? '';
$limit = max(10, min(3600, intval($_GET['limit'] ?? 300)));
if ($streamId === '') fp_json(['error'=>'stream_id required'],400);
$db = fp_db();
$stmt = $db->prepare('SELECT s.ts,s.fps,s.bitrate,s.frames,s.dropped,s.bytes,s.keyframes FROM statistics s JOIN cameras c ON c.id=s.camera_id WHERE c.stream_id=? ORDER BY s.id DESC LIMIT ?');
$stmt->bindValue(1,$streamId,PDO::PARAM_STR);
$stmt->bindValue(2,$limit,PDO::PARAM_INT);
$stmt->execute();
$rows = array_reverse($stmt->fetchAll(PDO::FETCH_ASSOC));
fp_json(['stream_id'=>$streamId,'stats'=>$rows]);
