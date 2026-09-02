<?php
require __DIR__.'/common.php';$id=intval($_GET['runId']??0);
if($id)fp_json(fp_node_request('/api/tests/runs/'.$id));
fp_json(fp_node_request('/api/tests/runs'));
