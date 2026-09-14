<?php
declare(strict_types=1);
require __DIR__ . '/../includes/api-common.php';
ivr_session_start();

foreach ($_SESSION['ivr_reviews'] as &$storedReview) {
    if (!isset($storedReview['side'])) {
        $legacyOrigin = (string) ($storedReview['origin'] ?? 'chung');
        $storedReview['side'] = in_array($legacyOrigin, ['chung', 'hong'], true) ? $legacyOrigin : 'chung';
        $storedReview['origin'] = $legacyOrigin === 'official' ? 'referee' : 'coach';
        $storedReview['issueType'] = $legacyOrigin === 'technical' ? 'technical' : 'nontechnical';
        $storedReview['isCoachRequest'] = $storedReview['origin'] === 'coach';
    }
}
unset($storedReview);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    ivr_json(['ok' => true, 'data' => ['reviews' => array_values($_SESSION['ivr_reviews'])]]);
}

$body = ivr_body();
$action = (string) ($body['action'] ?? '');
$ring = max(1, min(14, (int) ($body['ring'] ?? 1)));
$reviews =& $_SESSION['ivr_reviews'];

function &ivr_find_review(array &$reviews, string $id): array
{
    foreach ($reviews as &$review) {
        if (($review['id'] ?? '') === $id) return $review;
    }
    ivr_json(['ok' => false, 'error' => ['code' => 'review_not_found', 'message' => 'Selected review was not found.']], 404);
}

if ($action === 'reset') {
    $reviews = [];
    ivr_json(['ok' => true, 'data' => ['reviews' => []]]);
}

if ($action === 'create-request') {
    $side = in_array($body['side'] ?? '', ['chung', 'hong'], true) ? $body['side'] : 'chung';
    $origin = in_array($body['origin'] ?? '', ['coach', 'referee'], true) ? $body['origin'] : 'coach';
    $issueType = ($body['issueType'] ?? '') === 'technical' ? 'technical' : 'nontechnical';
    $now = ivr_now();
    $id = 'R' . str_pad((string) (count($reviews) + 1), 3, '0', STR_PAD_LEFT) . '-' . substr($now['epochUs'], -6);
    $isCoach = $origin === 'coach';
    $issues = array_values(array_slice(array_filter((array) ($body['issues'] ?? []), 'is_string'), 0, 2));
    $review = [
        'id' => $id, 'ring' => $ring, 'side' => $side, 'origin' => $origin, 'issueType' => $issueType, 'isCoachRequest' => $isCoach,
        'rm' => $now['epochSeconds'], 'rmEpochUs' => $now['epochUs'],
        'windowStart' => $now['epochSeconds'] - ($isCoach ? 5 : 10), 'windowEnd' => $now['epochSeconds'],
        'aur' => null, 'rst' => null, 'decisionAt' => null, 'result' => null,
        'status' => 'pending', 'issues' => $issues ?: ['Reason pending'],
        'linkedReviewId' => $body['linkedReviewId'] ?? null, 'annotation' => [],
    ];
    $reviews[] = $review;
    ivr_json(['ok' => true, 'data' => ['review' => $review, 'reviews' => array_values($reviews), 'serverTime' => $now]]);
}

$id = (string) ($body['reviewId'] ?? '');
$review =& ivr_find_review($reviews, $id);
$now = ivr_now();

switch ($action) {
    case 'start':
        if ($review['status'] !== 'pending') ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'Only a pending request can start formal review.']], 409);
        $review['rst'] = $now['epochSeconds']; $review['rstEpochUs'] = $now['epochUs']; $review['status'] = 'active';
        break;
    case 'mark-aur':
        if (!in_array($review['status'], ['active', 'completed'], true)) ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'Start review before marking AUR.']], 409);
        $review['aur'] = (float) ($body['time'] ?? $now['epochSeconds']);
        $review['aurOutsideWindow'] = $review['isCoachRequest'] && ($review['aur'] < $review['windowStart'] || $review['aur'] > $review['windowEnd']);
        break;
    case 'resolve-without-review':
        if ($review['status'] !== 'pending') ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'This disposition is available only before Start Review.']], 409);
        $review['result'] = 'resolved_without_review'; $review['decisionAt'] = $now['epochSeconds']; $review['status'] = 'resolved';
        break;
    case 'set-result':
        $result = (string) ($body['result'] ?? '');
        if ($review['status'] !== 'active' || !in_array($result, ['accepted', 'rejected', 'ivr_issue'], true)) ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'A valid formal result requires an active review.']], 409);
        $review['result'] = $result; $review['decisionAt'] = $now['epochSeconds']; $review['status'] = 'completed';
        $review['reviewDurationSeconds'] = max(0, $review['decisionAt'] - (float) $review['rst']);
        break;
    case 'annotate':
        if (!in_array($review['status'], ['completed', 'resolved'], true)) ivr_json(['ok' => false, 'error' => ['code' => 'invalid_state', 'message' => 'Finalize or resolve the request before post-review annotation.']], 409);
        $review['annotation'] = array_merge($review['annotation'], (array) ($body['annotation'] ?? []), ['updatedAt' => $now['iso']]);
        break;
    default:
        ivr_json(['ok' => false, 'error' => ['code' => 'invalid_action', 'message' => 'Unsupported prototype review action.']], 400);
}

ivr_json(['ok' => true, 'data' => ['review' => $review, 'reviews' => array_values($reviews), 'serverTime' => $now]]);
