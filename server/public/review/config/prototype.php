<?php
declare(strict_types=1);

return [
    'name' => 'FreePlay Instant Video Replay',
    'version' => '0.1.0-prototype',
    'cameraCount' => 3,
    'frameDurationSeconds' => 1 / 30,
    'reviewWindowSeconds' => [
        'coach' => 5,
        'referee' => 10,
    ],
    'initialContextSeconds' => 10,
    'defaultRing' => 1,
    'notificationUrl' => null,
    // Override when the ingest/replay service is published behind a proxy.
    'replayApiBase' => null,
];
