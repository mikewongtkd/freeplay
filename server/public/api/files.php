<?php
require __DIR__ . '/common.php';
$limit=max(1,min(500,intval($_GET['limit']??100)));$stream=$_GET['streamId']??'';
$sql='SELECT f.*,c.stream_id,c.ring,c.camera FROM files f JOIN cameras c ON c.id=f.camera_id';$args=[];
if($stream!==''){$sql.=' WHERE c.stream_id=?';$args[]=$stream;}$sql.=' ORDER BY f.id DESC LIMIT '.$limit;
$q=fp_db()->prepare($sql);$q->execute($args);fp_json(['ok'=>true,'data'=>['files'=>$q->fetchAll(PDO::FETCH_ASSOC)]]);
