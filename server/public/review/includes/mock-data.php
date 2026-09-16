<?php
declare(strict_types=1);

function ivr_mock_match(int $ring): array
{
    $now = microtime(true);
    $recordingStart = $now - 70;
    $roundStart = $now - 40;
    return [
        'ring' => $ring,
        'match' => [
            'number' => 'M-042',
            'division' => 'Senior Black Belt · Men -68 kg',
            'stage' => 'Quarterfinal',
            'round' => 2,
            'chung' => ['name' => 'J. PARK', 'team' => 'BLUE DRAGON', 'quota' => 1],
            'hong' => ['name' => 'A. KIM', 'team' => 'TIGER TKD', 'quota' => 1],
        ],
        'timeline' => [
            'start' => max($recordingStart, $roundStart - 30),
            'end' => $now,
            'liveEdge' => $now,
            'recordingStart' => $recordingStart,
            'roundStart' => $roundStart,
            'pageOpened' => $now,
            'startSource' => '30s before round start',
        ],
        'cameras' => [
            ['id' => 1, 'streamId' => "ring{$ring}_cam1", 'name' => 'Wide (Center)', 'available' => true, 'status' => 'streaming', 'syncOffsetMs' => 0, 'gaps' => []],
            ['id' => 2, 'streamId' => "ring{$ring}_cam2", 'name' => 'Side (Chung)', 'available' => true, 'status' => 'streaming', 'syncOffsetMs' => 12, 'gaps' => [['start' => $now - 39, 'end' => $now - 36]]],
            ['id' => 3, 'streamId' => "ring{$ring}_cam3", 'name' => 'Side (Hong)', 'available' => true, 'status' => 'streaming', 'syncOffsetMs' => -8, 'gaps' => []],
        ],
        'operator' => ['reviewJury' => 'Prototype Operator'],
        'prototype' => true,
    ];
}

function ivr_mock_pssel(int $ring): array
{
    $now = microtime(true);
    return [
        ['id' => 'p1', 'type' => 'match_start', 'label' => 'Match start', 'time' => $now - 66, 'side' => null, 'score' => '0–0'],
        ['id' => 'p2', 'type' => 'score', 'label' => 'Chung +2', 'time' => $now - 49, 'side' => 'chung', 'score' => '2–0'],
        ['id' => 'p3', 'type' => 'penalty', 'label' => 'Hong Gam-jeom', 'time' => $now - 34, 'side' => 'hong', 'score' => '3–0'],
        ['id' => 'p4', 'type' => 'pause', 'label' => 'Kal-yeo', 'time' => $now - 23, 'side' => null, 'score' => '3–0'],
        ['id' => 'p5', 'type' => 'resume', 'label' => 'Kye-sok', 'time' => $now - 18, 'side' => null, 'score' => '3–0'],
        ['id' => 'p6', 'type' => 'score', 'label' => 'Hong +3', 'time' => $now - 9, 'side' => 'hong', 'score' => '3–3'],
    ];
}

function ivr_scenarios(): array
{
    return [
        ['id' => 'A', 'name' => 'Normal Coach Review', 'summary' => 'Hong request → Start Review → AUR → CAM 2 → Accepted'],
        ['id' => 'B', 'name' => 'Resolved Without Review', 'summary' => 'Chung request resolved before RST'],
        ['id' => 'C', 'name' => 'AUR Outside Review Window', 'summary' => 'Out-of-window marker warns but is preserved'],
        ['id' => 'D', 'name' => 'One Camera Gap', 'summary' => 'CAM 2 impaired; CAM 1 and CAM 3 remain usable'],
        ['id' => 'E', 'name' => 'Rejected: IVR Issue', 'summary' => 'All relevant views unavailable'],
        ['id' => 'F', 'name' => 'Referee-Origin Review', 'summary' => 'Ten-second referee window without coach quota impact'],
        ['id' => 'G', 'name' => 'Second Review', 'summary' => 'Opposing coach receives a linked, independent review'],
        ['id' => 'H', 'name' => 'Two-Action Request', 'summary' => 'One window and clock; two issue records'],
        ['id' => 'I', 'name' => 'PSSEL Navigation', 'summary' => 'Filtered match, score, penalty, pause, and resume events'],
        ['id' => 'J', 'name' => 'Concurrent Requests', 'summary' => 'Overlapping Chung and Hong requests await operator-selected order'],
    ];
}
