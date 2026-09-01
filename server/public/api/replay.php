<?php
require __DIR__ . '/common.php';$ring=intval($_GET['ring']??0);$time=$_GET['time']??'';$before=max(0,min(120,floatval($_GET['before']??8)));$after=max(0,min(120,floatval($_GET['after']??4)));
if($ring<1||$ring>14||!preg_match('/^\d+$/',(string)$time))fp_error('invalid_request','Valid ring and epoch-microsecond time are required');
$start=(int)$time-(int)round($before*1000000);$end=(int)$time+(int)round($after*1000000);$db=fp_db();$cams=[];
for($n=1;$n<=3;$n++){$id="ring{$ring}_cam{$n}";$q=$db->prepare('SELECT g.*,f.path FROM gop_index g JOIN cameras c ON c.id=g.camera_id LEFT JOIN files f ON f.id=g.file_id WHERE c.stream_id=? AND g.end_time_epoch_us>=? AND g.start_time_epoch_us<=? ORDER BY g.start_time_epoch_us');$q->execute([$id,$start,$end]);$rows=$q->fetchAll(PDO::FETCH_ASSOC);$cams[]=['streamId'=>$id,'source'=>'disk','available'=>count($rows)>0,'startTimeEpochUs'=>$rows[0]['start_time_epoch_us']??null,'endTimeEpochUs'=>$rows?end($rows)['end_time_epoch_us']:null,'fragments'=>$rows];}
fp_json(['ok'=>true,'data'=>['ring'=>$ring,'requestedTimeEpochUs'=>(string)$time,'beforeSeconds'=>$before,'afterSeconds'=>$after,'cameras'=>$cams]]);
