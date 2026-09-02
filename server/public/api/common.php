<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function fp_root(): string { return dirname(__DIR__, 2); }
function fp_data_dir(): string { return '/data'; }
function fp_db(): PDO {
    static $pdo = null;
    if ($pdo instanceof PDO) return $pdo;
    $pdo = new PDO('sqlite:' . fp_data_dir() . DIRECTORY_SEPARATOR . 'freeplay.sqlite');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    return $pdo;
}
function fp_json($data, int $status=200): void {
    http_response_code($status);
    echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}
function fp_error(string $code, string $message, int $status=400): void {
    fp_json(['ok'=>false,'error'=>['code'=>$code,'message'=>$message]], $status);
}
function fp_body(): array {
    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) fp_error('invalid_json', 'Request body must be JSON');
    return $body;
}
function fp_node_request(string $path, string $method='GET', ?array $body=null): array {
    $base = rtrim(getenv('FREEPLAY_NODE_URL') ?: 'http://127.0.0.1:9000', '/');
    $options=['http'=>['method'=>$method,'timeout'=>5,'ignore_errors'=>true,'header'=>"Content-Type: application/json\r\n"]];
    if ($body !== null) $options['http']['content']=json_encode($body);
    $raw=@file_get_contents($base.$path,false,stream_context_create($options));
    if ($raw===false) fp_error('ingest_unavailable','Ingestion test service unavailable',503);
    $decoded=json_decode($raw,true);
    if (!is_array($decoded)) fp_error('invalid_upstream','Invalid ingestion test response',502);
    return $decoded;
}
