<?php
declare(strict_types=1);
require __DIR__ . '/../includes/api-common.php';
$match = ivr_mock_match(ivr_ring());
ivr_json(['ok' => true, 'data' => ['timeline' => $match['timeline'], 'cameras' => $match['cameras']]]);
