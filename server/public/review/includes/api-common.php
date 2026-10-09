<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/includes/mock-data.php';

function ivr_db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $path = getenv('FREEPLAY_DB') ?: '/data/freeplay.sqlite';
    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys=ON');
    $pdo->exec('PRAGMA busy_timeout=5000');
    $hasIvrSchema = $pdo->query("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ivr_tournaments'")->fetchColumn();
    if (!$hasIvrSchema) {
        $schemaPath = getenv('FREEPLAY_SCHEMA') ?: '/data/sql/schema.sql';
        $schema = @file_get_contents($schemaPath);
        if ($schema === false) throw new RuntimeException("IVR database schema not found at {$schemaPath}.");
        $pdo->exec($schema);
    }
    return $pdo;
}

function ivr_json(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

function ivr_body(): array
{
    $raw = file_get_contents('php://input');
    $body = json_decode($raw ?: '{}', true);
    if (!is_array($body)) {
        ivr_json(['ok' => false, 'error' => ['code' => 'invalid_json', 'message' => 'Request body must be JSON.']], 400);
    }
    return $body;
}

function ivr_ring(): int
{
    $ring = filter_input(INPUT_GET, 'ring', FILTER_VALIDATE_INT) ?: 1;
    return max(1, min(14, $ring));
}

function ivr_session_start(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_name('freeplay_ivr_prototype');
        session_start();
    }
    $_SESSION['ivr_reviews_by_ring'] ??= [];
}

function &ivr_ring_reviews(int $ring): array
{
    $_SESSION['ivr_reviews_by_ring'][$ring] ??= [];
    return $_SESSION['ivr_reviews_by_ring'][$ring];
}

function ivr_review_workflow(array $reviews): array
{
    $selected = null;
    $active = null;
    foreach ($reviews as $review) {
        if (($review['status'] ?? '') === 'selected') $selected = $review['id'];
        if (($review['status'] ?? '') === 'active') $active = $review['id'];
    }
    return ['selectedReviewId' => $selected, 'activeReviewId' => $active];
}

function ivr_now(): array
{
    $epoch = microtime(true);
    return ['epochSeconds' => $epoch, 'epochUs' => sprintf('%.0f', $epoch * 1000000), 'iso' => gmdate('c')];
}
