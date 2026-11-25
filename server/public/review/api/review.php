<?php
declare(strict_types=1);
require __DIR__ . '/../includes/api-common.php';
ivr_session_start();
$config = require __DIR__ . '/../config/prototype.php';

function &ivr_find_review(array &$reviews, string $id): array
{
    foreach ($reviews as &$review) {
        if (($review['id'] ?? '') === $id) return $review;
    }
    ivr_json(['ok' => false, 'error' => ['code' => 'review_not_found', 'message' => 'Selected review was not found.']], 404);
}

function ivr_review_response(array $reviews, ?array $review = null, ?array $serverTime = null): void
{
    $data = ['reviews' => array_values($reviews), 'workflow' => ivr_review_workflow($reviews)];
    if ($review !== null) $data['review'] = $review;
    if ($serverTime !== null) $data['serverTime'] = $serverTime;
    ivr_json(['ok' => true, 'data' => $data]);
}

function ivr_has_status(array $reviews, array $statuses): bool
{
    foreach ($reviews as $review) if (in_array($review['status'] ?? '', $statuses, true)) return true;
    return false;
}

function ivr_activate_review(array &$review, array $now): void
{
    $review['status'] = 'active';
    $review['rst'] = $now['epochSeconds'];
    $review['rstEpochUs'] = $now['epochUs'];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $ring = ivr_ring();
    $reviews =& ivr_ring_reviews($ring);
    ivr_review_response($reviews);
}

$body = ivr_body();
$action = (string) ($body['action'] ?? '');
$ring = max(1, min(14, (int) ($body['ring'] ?? 1)));
$reviews =& ivr_ring_reviews($ring);

if ($action === 'reset') {
    $reviews = [];
    unset($_SESSION['ivr_review_sequences'][$ring]);
    ivr_review_response($reviews);
}

if ($action === 'create-request') {
    $startImmediately = !empty($body['startImmediately']);
    if ($startImmediately && ivr_has_status($reviews, ['active'])) {
        ivr_json(['ok' => false, 'error' => ['code' => 'active_review_locked', 'message' => 'Finish or delete the active review before starting another.']], 409);
    }
    $side = in_array($body['side'] ?? '', ['chung', 'hong'], true) ? $body['side'] : 'chung';
    $origin = in_array($body['origin'] ?? '', ['coach', 'referee'], true) ? $body['origin'] : 'coach';
    $issueType = ($body['issueType'] ?? '') === 'technical' ? 'technical' : 'standard';
    $reason = trim((string) ($body['reason'] ?? '')) ?: 'Reason pending';
    $now = ivr_now();
    $isCoach = $origin === 'coach';
    $requestedTimestamp = isset($body['timestamp']) && is_numeric($body['timestamp']) ? (float) $body['timestamp'] : $now['epochSeconds'];
    if (!is_finite($requestedTimestamp) || $requestedTimestamp <= 0) {
        ivr_json(['ok' => false, 'error' => ['code' => 'invalid_timestamp', 'message' => 'Review request timestamp is invalid.']], 400);
    }
    $requestedEpochUs = sprintf('%.0f', $requestedTimestamp * 1000000);
    $sequence = (int) ($_SESSION['ivr_review_sequences'][$ring] ?? 0);
    foreach ($reviews as $existing) {
        if (preg_match('/^R(\d+)-/', (string) $existing['id'], $matches)) $sequence = max($sequence, (int) $matches[1]);
    }
    $_SESSION['ivr_review_sequences'][$ring] = ++$sequence;
    $id = 'R' . str_pad((string) $sequence, 3, '0', STR_PAD_LEFT) . '-' . substr($now['epochUs'], -6);
    $hasOpenRequest = ivr_has_status($reviews, ['selected', 'active']);
    $issues = array_values(array_slice(array_filter((array) ($body['issues'] ?? []), 'is_string'), 0, 2));
    $review = [
        'id' => $id, 'ring' => $ring, 'side' => $side, 'origin' => $origin, 'issueType' => $issueType, 'reason' => $reason,
        'matchNumber' => trim((string) ($body['matchNumber'] ?? '')), 'round' => max(1, (int) ($body['round'] ?? 1)),
        'isCoachRequest' => $isCoach, 'rm' => $requestedTimestamp, 'rmEpochUs' => $requestedEpochUs,
        'aur' => null, 'aurHistory' => [], 'rst' => null, 'decisionAt' => null, 'result' => null,
        'status' => ($hasOpenRequest || !empty($body['preserveSelection'])) ? 'pending' : 'selected', 'issues' => $issues ?: [$reason],
        'linkedReviewId' => $body['linkedReviewId'] ?? null, 'annotation' => [],
    ];
    if ($startImmediately) {
        foreach ($reviews as &$item) if (($item['status'] ?? '') === 'selected') $item['status'] = 'pending';
        unset($item);
        ivr_activate_review($review, $now);
    }
    $reviews[] = $review;
    ivr_review_response($reviews, $review, $now);
}

if( $action === 'delete-request' ) {
    $id = (string) ($body['reviewId'] ?? '');
    $found = false;
    foreach ($reviews as $index => $review) {
        if (($review['id'] ?? '') === $id) {
            unset($reviews[$index]);
            $found = true;
            break;
        }
    }
    if (!$found) ivr_json(['ok' => false, 'error' => ['code' => 'review_not_found', 'message' => 'The review request to delete was not found.']], 404);
    ivr_review_response($reviews);
}

if ($action === 'deselect') {
    if (ivr_has_status($reviews, ['active'])) ivr_json(['ok' => false, 'error' => ['code' => 'active_review_locked', 'message' => 'Complete the active review before deselecting it.']], 409);
    foreach ($reviews as &$item) if (($item['status'] ?? '') === 'selected') $item['status'] = 'pending';
    unset($item);
    ivr_review_response($reviews);
}

$id = (string) ($body['reviewId'] ?? '');
$review =& ivr_find_review($reviews, $id);
$now = ivr_now();

switch ($action) {
    case 'select':
        if (ivr_has_status($reviews, ['active'])) {
            ivr_json(['ok' => false, 'error' => ['code' => 'active_review_locked', 'message' => 'Complete the active review before selecting another request.']], 409);
        }
        if (!in_array($review['status'], ['pending', 'selected'], true)) {
            ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'Only a pending request can be selected.']], 409);
        }
        foreach ($reviews as &$item) if (($item['status'] ?? '') === 'selected') $item['status'] = 'pending';
        unset($item);
        if (!empty($body['startImmediately'])) {
            ivr_activate_review($review, $now);
        } else {
            $review['status'] = 'selected';
        }
        break;
    case 'start':
        if ($review['status'] !== 'selected') ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'Select this request before starting formal review.']], 409);
        if (ivr_has_status($reviews, ['active'])) ivr_json(['ok' => false, 'error' => ['code' => 'active_review_locked', 'message' => 'Another review is already active for this ring.']], 409);
        ivr_activate_review($review, $now);
        break;
    case 'mark-aur':
        if (!in_array($review['status'], ['active', 'completed'], true)) ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'Start review before marking AUR.']], 409);
        if (($review['aur'] ?? null) !== null) {
            $review['aurHistory'] ??= [];
            $review['aurHistory'][] = ['aur' => $review['aur'], 'replacedAt' => $now['epochSeconds'], 'replacedAtEpochUs' => $now['epochUs']];
        }
        $review['aur'] = (float) ($body['time'] ?? $now['epochSeconds']);
        break;
    case 'resolve-without-review':
        if (!in_array($review['status'], ['pending', 'selected'], true)) ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'This disposition is available only before Start Review.']], 409);
        $review['result'] = 'resolved_without_review'; $review['decisionAt'] = $now['epochSeconds']; $review['status'] = 'resolved_without_review';
        break;
    case 'set-result':
        $result = (string) ($body['result'] ?? '');
        if ($review['status'] !== 'active' || !in_array($result, ['accepted', 'rejected', 'ivr_issue'], true)) ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'A valid formal result requires an active review.']], 409);
        if (array_key_exists('details', $body)) {
            $details = $body['details'];
            if (!is_array($details)
                || !in_array($details['origin'] ?? null, ['coach', 'referee'], true)
                || !in_array($details['issueType'] ?? null, ['standard', 'technical'], true)
                || !is_string($details['reason'] ?? null)
                || trim($details['reason']) === '') {
                ivr_json(['ok' => false, 'error' => ['code' => 'invalid_details', 'message' => 'Choose an origin, issue type, and review reason.']], 400);
            }
            $review['origin'] = $details['origin'];
            $review['isCoachRequest'] = $details['origin'] === 'coach';
            $review['issueType'] = $details['issueType'];
            $review['reason'] = trim($details['reason']);
            $review['issues'][0] = $review['reason'];
        }
        $review['result'] = $result; $review['decisionAt'] = $now['epochSeconds']; $review['status'] = 'completed';
        $review['reviewDurationSeconds'] = max(0, $review['decisionAt'] - (float) $review['rst']);
        break;
    case 'annotate':
        if (!in_array($review['status'], ['completed', 'resolved_without_review'], true)) ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'Finalize or resolve the request before post-review annotation.']], 409);
        $review['annotation'] = array_merge($review['annotation'], (array) ($body['annotation'] ?? []), ['updatedAt' => $now['iso']]);
        break;
    default:
        ivr_json(['ok' => false, 'error' => ['code' => 'invalid_action', 'message' => 'Unsupported prototype review action.']], 400);
}

ivr_review_response($reviews, $review, $now);
