<?php
declare(strict_types=1);
require __DIR__ . '/../includes/api-common.php';
$ring = ivr_ring();

function ivr_saved_match(PDO $db, int $ring): ?array
{
    $statement = $db->prepare(<<<'SQL'
        SELECT m.*, r.ring_number,
               chung.display_name AS chung_name, chung.team_name AS chung_team,
               hong.display_name AS hong_name, hong.team_name AS hong_team
        FROM ivr_matches m
        JOIN ivr_rings r ON r.id = m.ring_id
        LEFT JOIN ivr_competitors chung ON chung.id = m.chung_competitor_id
        LEFT JOIN ivr_competitors hong ON hong.id = m.hong_competitor_id
        WHERE r.ring_number = :ring
        ORDER BY CASE m.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'scheduled' THEN 2 ELSE 3 END,
                 m.updated_at DESC, m.id DESC
        LIMIT 1
        SQL);
    $statement->execute(['ring' => $ring]);
    return $statement->fetch() ?: null;
}

function ivr_match_payload(array $row): array
{
    return [
        'id' => (int) $row['id'],
        'number' => $row['match_number'],
        'division' => $row['division'] ?? '',
        'stage' => $row['stage'] ?? '',
        'round' => $row['round_number'] === null ? null : (int) $row['round_number'],
        'chung' => ['name' => $row['chung_name'] ?? '', 'team' => $row['chung_team'] ?? '', 'quota' => (int) $row['chung_quota']],
        'hong' => ['name' => $row['hong_name'] ?? '', 'team' => $row['hong_team'] ?? '', 'quota' => (int) $row['hong_quota']],
    ];
}

function ivr_apply_saved_cameras(PDO $db, int $ring, array $cameras): array
{
    $statement = $db->prepare(<<<'SQL'
        SELECT COALESCE(c.camera, c.camera_no) AS camera_number, c.stream_id,
               rc.display_name, rc.sync_offset_ms
        FROM ivr_ring_cameras rc
        JOIN ivr_rings r ON r.id = rc.ring_id
        JOIN cameras c ON c.id = rc.camera_id
        WHERE r.ring_number = ? AND rc.active = 1
        SQL);
    $statement->execute([$ring]);
    $saved = [];
    foreach ($statement->fetchAll() as $row) $saved[(int) $row['camera_number']] = $row;
    foreach ($cameras as &$camera) {
        $configuration = $saved[(int) $camera['id']] ?? null;
        if ($configuration === null) continue;
        $camera['streamId'] = $configuration['stream_id'];
        $camera['name'] = $configuration['display_name'] ?: $camera['name'];
        $camera['syncOffsetMs'] = (int) $configuration['sync_offset_ms'];
    }
    unset($camera);
    return $cameras;
}

try {
    $db = ivr_db();
} catch (Throwable $error) {
    ivr_json(['ok' => false, 'error' => ['code' => 'database_unavailable', 'message' => 'The match database could not be initialized: ' . $error->getMessage()]], 500);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $model = ivr_mock_match($ring);
    $model['cameras'] = ivr_apply_saved_cameras($db, $ring, $model['cameras']);
    $saved = ivr_saved_match($db, $ring);
    if ($saved !== null) {
        $model['match'] = ivr_match_payload($saved);
        if ($saved['recording_start_epoch_us'] !== null) {
            $model['timeline']['start'] = (int) $saved['recording_start_epoch_us'] / 1000000;
            $model['timeline']['startSource'] = 'saved match start';
        }
        $model['prototype'] = false;
    }
    ivr_json(['ok' => true, 'data' => $model, 'scenarios' => ivr_scenarios()]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    ivr_json(['ok' => false, 'error' => ['code' => 'method_not_allowed', 'message' => 'Only GET and POST are supported.']], 405);
}

$body = ivr_body();
$matchNumber = trim((string) ($body['matchNumber'] ?? ''));
$chungName = trim((string) ($body['chungName'] ?? ''));
$hongName = trim((string) ($body['hongName'] ?? ''));
$start = filter_var($body['start'] ?? null, FILTER_VALIDATE_FLOAT);
$round = filter_var($body['round'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
$requestedRing = filter_var($body['ring'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 14]]);
if ($matchNumber === '' || $chungName === '' || $hongName === '' || $start === false || $start <= 0 || $round === false || $requestedRing === false) {
    ivr_json(['ok' => false, 'error' => ['code' => 'invalid_match', 'message' => 'Match number, round, both competitors, and a valid timeline start are required.']], 400);
}

$db->beginTransaction();
try {
    $db->prepare("INSERT INTO ivr_tournaments(external_id,name,status) VALUES ('freeplay-default','FreePlay Tournament','active') ON CONFLICT(external_id) DO UPDATE SET updated_at=CURRENT_TIMESTAMP")->execute();
    $tournamentId = (int) $db->query("SELECT id FROM ivr_tournaments WHERE external_id='freeplay-default'")->fetchColumn();
    $ringStatement = $db->prepare('INSERT INTO ivr_rings(tournament_id,ring_number) VALUES (?,?) ON CONFLICT(tournament_id,ring_number) DO UPDATE SET active=1,updated_at=CURRENT_TIMESTAMP');
    $ringStatement->execute([$tournamentId, $requestedRing]);
    $ringStatement = $db->prepare('SELECT id FROM ivr_rings WHERE tournament_id=? AND ring_number=?');
    $ringStatement->execute([$tournamentId, $requestedRing]);
    $ringId = (int) $ringStatement->fetchColumn();

    $matchId = filter_var($body['matchId'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    $existing = null;
    if ($matchId !== false) {
        $find = $db->prepare('SELECT * FROM ivr_matches WHERE id=?');
        $find->execute([$matchId]);
        $existing = $find->fetch() ?: null;
        if ($existing === null) throw new RuntimeException('The match to edit was not found.');
    }

    $saveCompetitor = function (?int $id, string $name, string $team) use ($db, $tournamentId): int {
        if ($id !== null) {
            $statement = $db->prepare('UPDATE ivr_competitors SET display_name=?,team_name=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tournament_id=?');
            $statement->execute([$name, $team ?: null, $id, $tournamentId]);
            return $id;
        }
        $statement = $db->prepare('INSERT INTO ivr_competitors(tournament_id,display_name,team_name) VALUES (?,?,?)');
        $statement->execute([$tournamentId, $name, $team ?: null]);
        return (int) $db->lastInsertId();
    };
    $chungId = $saveCompetitor($existing === null || $existing['chung_competitor_id'] === null ? null : (int) $existing['chung_competitor_id'], $chungName, trim((string) ($body['chungTeam'] ?? '')));
    $hongId = $saveCompetitor($existing === null || $existing['hong_competitor_id'] === null ? null : (int) $existing['hong_competitor_id'], $hongName, trim((string) ($body['hongTeam'] ?? '')));
    $values = [
        $matchNumber, trim((string) ($body['division'] ?? '')) ?: null, trim((string) ($body['stage'] ?? '')) ?: null, $round,
        $chungId, $hongId, max(0, (int) ($body['chungQuota'] ?? 0)), max(0, (int) ($body['hongQuota'] ?? 0)),
        (int) round($start * 1000000),
    ];
    if ($existing !== null) {
        $statement = $db->prepare('UPDATE ivr_matches SET ring_id=?,match_number=?,division=?,stage=?,round_number=?,chung_competitor_id=?,hong_competitor_id=?,chung_quota=?,hong_quota=?,recording_start_epoch_us=?,status=\'active\',updated_at=CURRENT_TIMESTAMP WHERE id=?');
        $statement->execute([$ringId, ...$values, (int) $existing['id']]);
    } else {
        $statement = $db->prepare('INSERT INTO ivr_matches(ring_id,match_number,division,stage,round_number,chung_competitor_id,hong_competitor_id,chung_quota,hong_quota,recording_start_epoch_us,status) VALUES (?,?,?,?,?,?,?,?,?,?,\'active\')');
        $statement->execute([$ringId, ...$values]);
    }
    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    $status = $error instanceof RuntimeException ? 404 : 409;
    ivr_json(['ok' => false, 'error' => ['code' => 'match_save_failed', 'message' => $error->getMessage()]], $status);
}

$saved = ivr_saved_match($db, $requestedRing);
ivr_json(['ok' => true, 'data' => ['match' => ivr_match_payload($saved), 'start' => (int) $saved['recording_start_epoch_us'] / 1000000]]);
