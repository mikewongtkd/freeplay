<?php
require __DIR__.'/common.php';
if($_SERVER['REQUEST_METHOD']!=='POST')fp_error('method_not_allowed','POST required',405);
$body=fp_body();$action=$body['command']??'';$paths=['stop'=>'stop','evaluate'=>'evaluate','action'=>'action'];if(!isset($paths[$action]))fp_error('invalid_request','Unknown command');unset($body['command']);fp_json(fp_node_request('/api/tests/'.$paths[$action],'POST',$body));
