<?php
declare(strict_types=1);
require __DIR__ . '/common.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
function management_json(array $value, int $status = 200): never {
    http_response_code($status); echo json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES); exit;
}
try {
    $conf = management_config(); management_session();
    if (!management_authorized($conf)) management_json(['ok' => false, 'error' => ['code' => 'unauthorized', 'message' => 'Administrator login required.']], 401);
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $db = management_store($conf);
        $id = (string) ($_GET['id'] ?? '');
        if ($id !== '') {
            $q = $db->prepare('SELECT * FROM operations WHERE id=?'); $q->execute([$id]);
            $operation = $q->fetch();
            if (!$operation) management_json(['ok' => false, 'error' => ['code' => 'not_found', 'message' => 'Operation not found.']], 404);
            $steps = $db->prepare('SELECT step,phase,detail,created_at FROM operation_steps WHERE operation_id=? ORDER BY id'); $steps->execute([$id]);
            management_json(['ok' => true, 'data' => ['operation' => $operation, 'steps' => $steps->fetchAll()]]);
        }
        management_json(['ok' => true, 'data' => ['mode' => $db->query('SELECT * FROM management_state WHERE singleton=1')->fetch(),
            'worker' => $db->query('SELECT pid,hostname,heartbeat FROM worker_lock WHERE singleton=1')->fetch(),
            'operations' => $db->query('SELECT id,type,state,progress,error,created_at,updated_at FROM operations ORDER BY created_at DESC LIMIT 50')->fetchAll(),
            'activeDatabase' => $conf['db'], 'mediaRoot' => $conf['videoDir'] ?? '/data/video']]);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') management_json(['ok' => false, 'error' => ['code' => 'method', 'message' => 'Use GET or POST.']], 405);
    if (!management_csrf()) management_json(['ok' => false, 'error' => ['code' => 'csrf', 'message' => 'Invalid CSRF token.']], 403);
    $raw = file_get_contents('php://input', false, null, 0, 16385);
    if (strlen($raw) > 16384) throw new InvalidArgumentException('Request is too large.');
    $body = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($body)) throw new InvalidArgumentException('Expected a JSON object.');
    $action = $body['action'] ?? '';
    if (!in_array($action, ['inspect', 'date-preview', 'storage-probe', 'cancel'], true)) {
        management_json(['ok' => false, 'error' => ['code' => 'unsupported_operation', 'message' => 'Archive, historical activation, restore, cleanup and service changes are disabled until service coordination is commissioned.']], 409);
    }
    $db = management_store($conf);
    $mode = $db->query('SELECT mode FROM management_state WHERE singleton=1')->fetchColumn();
    if ($mode !== 'INSPECTION_ONLY') {
        management_json(['ok' => false, 'error' => ['code' => 'mode_conflict', 'message' => 'Administrative state requires recovery; no jobs may be submitted or cancelled.']], 409);
    }
    if ($action === 'cancel') {
        $q = $db->prepare("UPDATE operations SET state='cancelled',progress='Cancelled before execution',updated_at=? WHERE id=? AND state='queued'");
        $q->execute([gmdate('c'), (string) ($body['id'] ?? '')]);
        if ($q->rowCount() !== 1) throw new InvalidArgumentException('Only a queued operation can be cancelled safely. Running inspections must finish.');
        management_json(['ok' => true]);
    }
    $params = [];
    if ($action === 'date-preview') {
        $params['interval'] = management_interval((string) ($body['startDate'] ?? ''), (string) ($body['endDate'] ?? ''), (string) ($body['timezone'] ?? 'America/Los_Angeles'));
        $params['name'] = mb_substr((string) ($body['name'] ?? ''), 0, 200);
    }
    if ($action === 'storage-probe') {
        $path = (string) ($body['storagePath'] ?? '');
        if (!str_starts_with($path, '/') || str_contains($path, "\0") || in_array('..', explode('/', $path), true) || strlen($path) > 4096) throw new InvalidArgumentException('Use an absolute mounted SSD path inside the container, without traversal.');
        $params['storagePath'] = $path;
    }
    $id = bin2hex(random_bytes(16)); $now = gmdate('c');
    $q = $db->prepare("INSERT INTO operations(id,type,state,parameters,created_at,updated_at) VALUES (?,?,'queued',?,?,?)");
    try { $q->execute([$id, $action, json_encode($params, JSON_THROW_ON_ERROR), $now, $now]); }
    catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'UNIQUE')) management_json(['ok' => false, 'error' => ['code' => 'operation_busy', 'message' => 'Another operation is queued, running, or requires recovery.']], 409);
        throw $e;
    }
    management_json(['ok' => true, 'data' => ['id' => $id]], 202);
} catch (InvalidArgumentException | JsonException $e) {
    management_json(['ok' => false, 'error' => ['code' => 'invalid_request', 'message' => $e->getMessage()]], 400);
} catch (Throwable $e) {
    error_log('FreePlay management: ' . $e->getMessage());
    management_json(['ok' => false, 'error' => ['code' => 'management_unavailable', 'message' => 'Management configuration or storage unavailable. Check the server log.']], 503);
}
