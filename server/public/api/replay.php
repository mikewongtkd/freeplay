<?php
declare(strict_types=1);
require __DIR__ . '/common.php';

fp_json([
    'ok' => false,
    'error' => [
        'code' => 'replay_api_moved',
        'message' => 'Use the versioned replay API at the ingestion service: /api/ivr/v1/replay.',
    ],
], 410);
