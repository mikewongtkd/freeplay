<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/api-common.php';

$config = require __DIR__ . '/config/prototype.php';
$pageTitle = 'Review Report · ' . $config['name'];
$bodyClass = 'ivr-list-body';
$headerMode = 'report';
$ring = null;
$matchNumber = trim((string) ($_GET['match'] ?? ''));
$ringParameterPresent = array_key_exists('ring', $_GET);
$ringValue = filter_input(INPUT_GET, 'ring', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 14]]);
$parameterError = null;
$databaseError = null;
$tournament = null;
$tournamentName = 'Current tournament';
$reviews = [];

if ($ringParameterPresent) {
    if ($ringValue === false || $ringValue === null) {
        $parameterError = 'The ring parameter must be a number from 1 through 14.';
    } else {
        $ring = $ringValue;
    }
}

$contextParts = [];
if ($ring !== null) $contextParts[] = 'Ring ' . $ring;
if ($matchNumber !== '') $contextParts[] = 'Match ' . $matchNumber;
$headerContext = $contextParts === [] ? 'All reviews' : implode(' · ', $contextParts);

try {
    $db = ivr_db();
    $tournament = $db->query(<<<'SQL'
        SELECT *
        FROM ivr_tournaments
        WHERE status = 'active'
        ORDER BY COALESCE(starts_at, updated_at) DESC, id DESC
        LIMIT 1
        SQL)->fetch() ?: null;

    if ($tournament !== null) {
        $tournamentName = (string) $tournament['name'];
        $sql = <<<'SQL'
            SELECT rr.public_id, rr.side, rr.origin, rr.issue_type, rr.reason,
                   rr.issues_json, rr.status, rr.request_mark_epoch_us,
                   rr.window_start_epoch_us, rr.window_end_epoch_us,
                   rr.review_start_epoch_us, rr.aur_epoch_us,
                   rr.aur_outside_window, rr.cameras_available_json,
                   rr.cameras_reviewed_json, rr.operator_identity,
                   r.ring_number, m.match_number, m.round_number,
                   d.result, d.decided_at_epoch_us, d.review_duration_ms,
                   d.quota_outcome, d.recommendations,
                   a.review_jury, a.explanation, a.notes
            FROM ivr_review_requests rr
            JOIN ivr_rings r ON r.id = rr.ring_id
            LEFT JOIN ivr_matches m ON m.id = rr.match_id
            LEFT JOIN ivr_review_decisions d ON d.review_request_id = rr.id
            LEFT JOIN ivr_review_annotations a ON a.review_request_id = rr.id
            WHERE r.tournament_id = :tournament_id
            SQL;
        $parameters = ['tournament_id' => (int) $tournament['id']];
        if ($ring !== null) {
            $sql .= ' AND r.ring_number = :ring_number';
            $parameters['ring_number'] = $ring;
        }
        if ($matchNumber !== '') {
            $sql .= ' AND m.match_number = :match_number';
            $parameters['match_number'] = $matchNumber;
        }
        $sql .= ' ORDER BY rr.request_mark_epoch_us DESC, rr.id DESC';
        $statement = $db->prepare($sql);
        $statement->execute($parameters);
        $reviews = $statement->fetchAll();
    }
} catch (Throwable $error) {
    $databaseError = 'The review database could not be loaded. Please check the server log and try again.';
}

function ivr_report_time(mixed $epochUs): string
{
    if ($epochUs === null || $epochUs === '') return '—';
    return gmdate('Y-m-d H:i:s', (int) ((int) $epochUs / 1000000)) . ' UTC';
}

function ivr_report_status_class(string $status): string
{
    return match ($status) {
        'active' => 'text-bg-success',
        'selected' => 'text-bg-info',
        'completed', 'resolved_without_review' => 'text-bg-primary',
        'cancelled' => 'text-bg-danger',
        default => 'text-bg-secondary',
    };
}

function ivr_report_json_list(?string $json): string
{
    $values = json_decode($json ?: '[]', true);
    if (!is_array($values) || $values === []) return '—';
    return implode(', ', array_map(static fn (mixed $value): string => (string) $value, $values));
}

require __DIR__ . '/includes/header.php';
?>
<main id="ivrMain" class="matches-shell container">
  <div class="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
    <div>
      <h1 class="h3 mb-1">IVR Review Report</h1>
      <p class="text-secondary mb-0"><?= htmlspecialchars($tournamentName, ENT_QUOTES, 'UTF-8') ?> · <?= htmlspecialchars($headerContext, ENT_QUOTES, 'UTF-8') ?></p>
    </div>
    <form class="d-flex flex-wrap align-items-end gap-2" method="get" action="/review/report.php">
      <div>
        <label class="form-label small mb-1" for="reportRing">Ring</label>
        <input id="reportRing" class="form-control form-control-sm" type="number" name="ring" min="1" max="14" value="<?= $ring === null ? '' : (int) $ring ?>" placeholder="All">
      </div>
      <div>
        <label class="form-label small mb-1" for="reportMatch">Match</label>
        <input id="reportMatch" class="form-control form-control-sm" name="match" value="<?= htmlspecialchars($matchNumber, ENT_QUOTES, 'UTF-8') ?>" placeholder="All">
      </div>
      <button class="btn btn-sm btn-primary" type="submit">Apply</button>
      <?php if ($ring !== null || $matchNumber !== ''): ?><a class="btn btn-sm btn-outline-secondary" href="/review/report.php">Clear</a><?php endif; ?>
    </form>
  </div>

  <?php if ($parameterError !== null): ?>
    <div class="alert alert-warning" role="alert"><?= htmlspecialchars($parameterError, ENT_QUOTES, 'UTF-8') ?></div>
  <?php endif; ?>
  <?php if ($databaseError !== null): ?>
    <div class="alert alert-danger" role="alert"><?= htmlspecialchars($databaseError, ENT_QUOTES, 'UTF-8') ?></div>
  <?php elseif ($tournament === null): ?>
    <div class="alert alert-info" role="status">No current tournament was found.</div>
  <?php elseif ($reviews === []): ?>
    <div class="alert alert-info" role="status">No reviews were found for the selected filters.</div>
  <?php else: ?>
    <div class="d-grid gap-3">
    <?php foreach ($reviews as $review):
        $round = $review['round_number'] === null ? 1 : max(1, (int) $review['round_number']);
        $reviewUrl = $review['match_number'] === null ? null : '/review/index.php?' . http_build_query([
            'ring' => (int) $review['ring_number'],
            'match' => $review['match_number'],
            'round' => $round,
        ]);
    ?>
      <article class="card match-list-card">
        <div class="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <strong><?= htmlspecialchars((string) $review['public_id'], ENT_QUOTES, 'UTF-8') ?></strong>
            <span class="badge <?= $review['side'] === 'chung' ? 'text-bg-primary' : 'text-bg-danger' ?>"><?= htmlspecialchars(ucfirst((string) $review['side']), ENT_QUOTES, 'UTF-8') ?></span>
            <span class="badge <?= ivr_report_status_class((string) $review['status']) ?>"><?= htmlspecialchars(ucwords(str_replace('_', ' ', (string) $review['status'])), ENT_QUOTES, 'UTF-8') ?></span>
          </div>
          <div class="small text-secondary">Ring <?= (int) $review['ring_number'] ?> · Match <?= htmlspecialchars((string) ($review['match_number'] ?? '—'), ENT_QUOTES, 'UTF-8') ?> · Round <?= $round ?></div>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4"><div class="small text-secondary">Request</div><div><?= htmlspecialchars(ucfirst((string) $review['origin']), ENT_QUOTES, 'UTF-8') ?> · <?= htmlspecialchars(ucfirst((string) $review['issue_type']), ENT_QUOTES, 'UTF-8') ?></div><div><?= htmlspecialchars((string) ($review['reason'] ?: 'Reason not recorded'), ENT_QUOTES, 'UTF-8') ?></div></div>
            <div class="col-md-4"><div class="small text-secondary">Issues</div><div><?= htmlspecialchars(ivr_report_json_list($review['issues_json']), ENT_QUOTES, 'UTF-8') ?></div><div class="small text-secondary mt-2">Cameras reviewed</div><div><?= htmlspecialchars(ivr_report_json_list($review['cameras_reviewed_json']), ENT_QUOTES, 'UTF-8') ?></div></div>
            <div class="col-md-4"><div class="small text-secondary">Result</div><div><?= htmlspecialchars($review['result'] === null ? 'Pending' : ucwords(str_replace('_', ' ', (string) $review['result'])), ENT_QUOTES, 'UTF-8') ?></div><div class="small text-secondary mt-2">Quota outcome</div><div><?= htmlspecialchars($review['quota_outcome'] === null ? '—' : ucwords(str_replace('_', ' ', (string) $review['quota_outcome'])), ENT_QUOTES, 'UTF-8') ?></div></div>
          </div>
          <hr>
          <div class="row g-3 small">
            <div class="col-md-3"><span class="text-secondary">Requested:</span><br><?= ivr_report_time($review['request_mark_epoch_us']) ?></div>
            <div class="col-md-3"><span class="text-secondary">Review window:</span><br><?= ivr_report_time($review['window_start_epoch_us']) ?><br><?= ivr_report_time($review['window_end_epoch_us']) ?></div>
            <div class="col-md-3"><span class="text-secondary">AUR:</span><br><?= ivr_report_time($review['aur_epoch_us']) ?><?= (int) $review['aur_outside_window'] === 1 ? ' <span class="badge text-bg-warning">Outside window</span>' : '' ?></div>
            <div class="col-md-3"><span class="text-secondary">Decision:</span><br><?= ivr_report_time($review['decided_at_epoch_us']) ?><?= $review['review_duration_ms'] === null ? '' : '<br>' . number_format((int) $review['review_duration_ms'] / 1000, 3) . ' s' ?></div>
          </div>
          <?php if ($review['explanation'] || $review['notes'] || $review['recommendations']): ?>
          <div class="alert alert-light border mt-3 mb-0"><strong>Notes:</strong> <?= htmlspecialchars(implode(' · ', array_filter([$review['explanation'], $review['notes'], $review['recommendations']])), ENT_QUOTES, 'UTF-8') ?></div>
          <?php endif; ?>
        </div>
        <?php if ($reviewUrl !== null): ?><div class="card-footer text-end"><a class="btn btn-sm btn-outline-primary" href="<?= htmlspecialchars($reviewUrl, ENT_QUOTES, 'UTF-8') ?>"><i class="fa-solid fa-video"></i> Open match in IVR</a></div><?php endif; ?>
      </article>
    <?php endforeach; ?>
    </div>
  <?php endif; ?>
</main>
<script src="/vendor/bootstrap/5.3.3/js/bootstrap.bundle.min.js"></script>
</body>
</html>
