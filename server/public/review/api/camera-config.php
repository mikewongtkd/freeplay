<?php
declare(strict_types=1);
require __DIR__ . '/../includes/api-common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    ivr_json(['ok' => false, 'error' => ['code' => 'method_not_allowed', 'message' => 'Only POST is supported.']], 405);
}

$body = ivr_body();
$ring = filter_var($body['ring'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 14]]);
$cameras = $body['cameras'] ?? null;
if ($ring === false || !is_array($cameras) || count($cameras) !== 3) {
    ivr_json(['ok' => false, 'error' => ['code' => 'invalid_camera_configuration', 'message' => 'A ring and exactly three camera configurations are required.']], 400);
}

$normalized = [];
$streamIds = [];
foreach ($cameras as $camera) {
    $number = filter_var($camera['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 3]]);
    $streamId = trim((string) ($camera['streamId'] ?? ''));
    $name = trim((string) ($camera['name'] ?? ''));
    $offset = filter_var($camera['syncOffsetMs'] ?? null, FILTER_VALIDATE_INT);
    if ($number === false || $streamId === '' || $name === '' || $offset === false || isset($normalized[$number]) || isset($streamIds[$streamId])) {
        ivr_json(['ok' => false, 'error' => ['code' => 'invalid_camera_configuration', 'message' => 'Each camera requires a unique number, stream ID, display name, and integer synchronization offset.']], 400);
    }
    $normalized[$number] = ['id' => $number, 'streamId' => $streamId, 'name' => $name, 'syncOffsetMs' => $offset];
    $streamIds[$streamId] = true;
}
ksort($normalized);

try {
    $db = ivr_db();
    $db->beginTransaction();
    $db->prepare("INSERT INTO ivr_tournaments(external_id,name,status) VALUES ('freeplay-default','FreePlay Tournament','active') ON CONFLICT(external_id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP")->execute();
    $tournamentId = (int) $db->query("SELECT id FROM ivr_tournaments WHERE external_id='freeplay-default'")->fetchColumn();
    $statement = $db->prepare('INSERT INTO ivr_rings(tournament_id,ring_number) VALUES (?,?) ON CONFLICT(tournament_id,ring_number) DO UPDATE SET active=1,updated_at=CURRENT_TIMESTAMP');
    $statement->execute([$tournamentId, $ring]);
    $statement = $db->prepare('SELECT id FROM ivr_rings WHERE tournament_id=? AND ring_number=?');
    $statement->execute([$tournamentId, $ring]);
    $ringId = (int) $statement->fetchColumn();

    $saveCamera = $db->prepare('INSERT INTO cameras(stream_id,ring_no,camera_no,ring,camera,created_at,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(stream_id) DO UPDATE SET ring_no=excluded.ring_no,camera_no=excluded.camera_no,ring=excluded.ring,camera=excluded.camera,updated_at=CURRENT_TIMESTAMP');
    $cameraId = $db->prepare('SELECT id FROM cameras WHERE stream_id=?');
    $saveAssignment = $db->prepare('INSERT INTO ivr_ring_cameras(ring_id,camera_id,display_name,sync_offset_ms,active) VALUES (?,?,?,?,1) ON CONFLICT(ring_id,camera_id) DO UPDATE SET display_name=excluded.display_name,sync_offset_ms=excluded.sync_offset_ms,active=1,updated_at=CURRENT_TIMESTAMP');
    $db->prepare('UPDATE ivr_ring_cameras SET active=0,updated_at=CURRENT_TIMESTAMP WHERE ring_id=?')->execute([$ringId]);
    foreach ($normalized as $camera) {
        $saveCamera->execute([$camera['streamId'], $ring, $camera['id'], $ring, $camera['id']]);
        $cameraId->execute([$camera['streamId']]);
        $saveAssignment->execute([$ringId, (int) $cameraId->fetchColumn(), $camera['name'], $camera['syncOffsetMs']]);
    }
    $db->commit();
} catch (Throwable $error) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    ivr_json(['ok' => false, 'error' => ['code' => 'camera_configuration_save_failed', 'message' => $error->getMessage()]], 409);
}

ivr_json(['ok' => true, 'data' => ['ring' => $ring, 'cameras' => array_values($normalized)]]);
