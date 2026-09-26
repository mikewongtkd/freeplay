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
    ivr_review_response($reviews);
}

if ($action === 'create-request') {
    $side = in_array($body['side'] ?? '', ['chung', 'hong'], true) ? $body['side'] : 'chung';
    $origin = in_array($body['origin'] ?? '', ['coach', 'referee'], true) ? $body['origin'] : 'coach';
    $issueType = ($body['issueType'] ?? '') === 'technical' ? 'technical' : 'standard';
    $reason = trim((string) ($body['reason'] ?? '')) ?: 'Reason pending';
    $now = ivr_now();
    $id = 'R' . str_pad((string) (count($reviews) + 1), 3, '0', STR_PAD_LEFT) . '-' . substr($now['epochUs'], -6);
    $isCoach = $origin === 'coach';
    $duration = (float) ($config['reviewWindowSeconds'][$origin] ?? ($isCoach ? 5 : 10));
    $hasOpenRequest = ivr_has_status($reviews, ['pending', 'selected', 'active']);
    $issues = array_values(array_slice(array_filter((array) ($body['issues'] ?? []), 'is_string'), 0, 2));
    $review = [
        'id' => $id, 'ring' => $ring, 'side' => $side, 'origin' => $origin, 'issueType' => $issueType, 'reason' => $reason,
        'isCoachRequest' => $isCoach, 'rm' => $now['epochSeconds'], 'rmEpochUs' => $now['epochUs'],
        'windowStart' => $now['epochSeconds'] - $duration, 'windowEnd' => $now['epochSeconds'], 'windowDurationSeconds' => $duration,
        'aur' => null, 'aurHistory' => [], 'rst' => null, 'decisionAt' => null, 'result' => null,
        'status' => $hasOpenRequest ? 'pending' : 'selected', 'issues' => $issues ?: [$reason],
        'linkedReviewId' => $body['linkedReviewId'] ?? null, 'annotation' => [],
    ];
    $reviews[] = $review;
    ivr_review_response($reviews, $review, $now);
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
        $review['status'] = 'selected';
        break;
    case 'start':
        if ($review['status'] !== 'selected') ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'Select this request before starting formal review.']], 409);
        if (ivr_has_status($reviews, ['active'])) ivr_json(['ok' => false, 'error' => ['code' => 'active_review_locked', 'message' => 'Another review is already active for this ring.']], 409);
        $review['rst'] = $now['epochSeconds']; $review['rstEpochUs'] = $now['epochUs']; $review['status'] = 'active';
        break;
    case 'mark-aur':
        if (!in_array($review['status'], ['active', 'completed'], true)) ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'Start review before marking AUR.']], 409);
        if (($review['aur'] ?? null) !== null) {
            $review['aurHistory'] ??= [];
            $review['aurHistory'][] = ['aur' => $review['aur'], 'replacedAt' => $now['epochSeconds'], 'replacedAtEpochUs' => $now['epochUs']];
        }
        $review['aur'] = (float) ($body['time'] ?? $now['epochSeconds']);
        $review['aurOutsideWindow'] = $review['isCoachRequest'] && ($review['aur'] < $review['windowStart'] || $review['aur'] > $review['windowEnd']);
        break;
    case 'resolve-without-review':
        if (!in_array($review['status'], ['pending', 'selected'], true)) ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'This disposition is available only before Start Review.']], 409);
        $review['result'] = 'resolved_without_review'; $review['decisionAt'] = $now['epochSeconds']; $review['status'] = 'resolved_without_review';
        break;
    case 'set-result':
        $result = (string) ($body['result'] ?? '');
        if ($review['status'] !== 'active' || !in_array($result, ['accepted', 'rejected', 'ivr_issue'], true)) ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'A valid formal result requires an active review.']], 409);
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
