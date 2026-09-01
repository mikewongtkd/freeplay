<?php
require __DIR__ . '/common.php';
$id = $_GET['streamId'] ?? $_GET['stream_id'] ?? '';
if ($id === '') fp_error('invalid_request','Missing streamId');
$db=fp_db(); $q=$db->prepare('SELECT * FROM cameras WHERE stream_id=?'); $q->execute([$id]); $camera=$q->fetch(PDO::FETCH_ASSOC);
if (!$camera) fp_error('not_found','Camera not found',404);
$s=$db->prepare('SELECT * FROM sessions WHERE camera_id=? ORDER BY id DESC LIMIT 1');$s->execute([$camera['id']]);
$f=$db->prepare('SELECT * FROM files WHERE camera_id=? ORDER BY id DESC LIMIT 20');$f->execute([$camera['id']]);
fp_json(['ok'=>true,'data'=>['camera'=>$camera,'latestSession'=>$s->fetch(PDO::FETCH_ASSOC) ?: null,'recentFiles'=>$f->fetchAll(PDO::FETCH_ASSOC)]]);
