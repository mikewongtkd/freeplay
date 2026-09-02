<?php
require __DIR__.'/common.php';
$data=fp_node_request('/api/tests/export');header('Content-Disposition: attachment; filename="freeplay-test-results.json"');fp_json($data);
