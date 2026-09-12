<?php
declare(strict_types=1);
require __DIR__ . '/../includes/api-common.php';
$allowed = ['match_start', 'match_stop', 'pause', 'resume', 'score', 'penalty'];
$events = array_values(array_filter(ivr_mock_pssel(ivr_ring()), fn(array $event): bool => in_array($event['type'], $allowed, true)));
ivr_json(['ok' => true, 'data' => ['events' => $events, 'advisoryOnly' => true]]);
