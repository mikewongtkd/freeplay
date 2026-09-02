<?php
require __DIR__.'/common.php';
if($_SERVER['REQUEST_METHOD']!=='POST')fp_error('method_not_allowed','POST required',405);
$body=fp_body();fp_json(fp_node_request('/api/tests/run','POST',$body));
