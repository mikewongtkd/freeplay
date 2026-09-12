<?php
declare(strict_types=1);
require __DIR__ . '/../includes/api-common.php';
$ring = ivr_ring();
ivr_json(['ok' => true, 'data' => ivr_mock_match($ring), 'scenarios' => ivr_scenarios()]);
