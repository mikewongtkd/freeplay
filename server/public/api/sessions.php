<?php
require __DIR__ . '/common.php';
$db = fp_db();
$sql = 'SELECT s.*, c.stream_id FROM sessions s JOIN cameras c ON c.id=s.camera_id ORDER BY s.id DESC LIMIT 200';
fp_json(['sessions'=>$db->query($sql)->fetchAll(PDO::FETCH_ASSOC)]);
