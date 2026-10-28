<?php
declare(strict_types=1);

require_once __DIR__ . '/includes/api-common.php';

$config = require __DIR__ . '/config/prototype.php';
$pageTitle = 'Matches · ' . $config['name'];
$bodyClass = 'ivr-list-body';
$headerMode = 'matches';
$ring = null;
$ringParameterPresent = array_key_exists('ring', $_GET);
$ringValue = filter_input(INPUT_GET, 'ring', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 14]]);
$parameterError = null;
$databaseError = null;
$tournament = null;
$tournamentName = 'Current tournament';
$matches = [];

if ($ringParameterPresent) {
    if ($ringValue === false || $ringValue === null) {
        $parameterError = 'The ring parameter must be a number from 1 through 14.';
    } else {
        $ring = $ringValue;
    }
}
$headerContext = $ring === null ? 'All rings' : 'Ring ' . $ring;

try {
    $db = ivr_db();
    $tournament = $db->query(<<<'SQL'
        SELECT *
        FROM ivr_tournaments
        WHERE status = 'active'
        ORDER BY COALESCE(starts_at, updated_at) DESC,
                 id DESC
        LIMIT 1
        SQL)->fetch() ?: null;

    if ($tournament !== null) {
        $tournamentName = (string) $tournament['name'];
        $sql = <<<'SQL'
            SELECT m.id, m.match_number, m.division, m.stage, m.round_number,
                   m.status, m.scheduled_at, m.started_at_epoch_us,
                   m.ended_at_epoch_us, m.recording_start_epoch_us,
                   r.ring_number,
                   chung.display_name AS chung_name, chung.team_name AS chung_team,
                   hong.display_name AS hong_name, hong.team_name AS hong_team
            FROM ivr_matches m
            JOIN ivr_rings r ON r.id = m.ring_id
            LEFT JOIN ivr_competitors chung ON chung.id = m.chung_competitor_id
            LEFT JOIN ivr_competitors hong ON hong.id = m.hong_competitor_id
            WHERE r.tournament_id = :tournament_id
            SQL;
        $parameters = ['tournament_id' => (int) $tournament['id']];
        if ($ring !== null) {
            $sql .= ' AND r.ring_number = :ring_number';
            $parameters['ring_number'] = $ring;
        }
        $sql .= ' ORDER BY r.ring_number, COALESCE(m.scheduled_at, m.created_at), m.id';
        $statement = $db->prepare($sql);
        $statement->execute($parameters);
        $matches = $statement->fetchAll();
    }
} catch (Throwable $error) {
    $databaseError = 'The match database could not be loaded. Please check the server log and try again.';
}

function ivr_match_time(?int $epochUs): string
{
    if ($epochUs === null || $epochUs === '') return '—';
    $seconds = (int) $epochUs / 1000000;
    return gmdate('Y-m-d H:i:s', (int) $seconds) . ' UTC';
}

function ivr_status_class(string $status): string
{
    return match ($status) {
        'active' => 'text-bg-success',
        'paused' => 'text-bg-warning',
        'completed' => 'text-bg-primary',
        'cancelled' => 'text-bg-danger',
        default => 'text-bg-secondary',
    };
}

require __DIR__ . '/includes/header.php';
?>
<main id="ivrMain" class="matches-shell container">
  <div class="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
    <div>
      <h1 class="h3 mb-1">Matches</h1>
      <p class="text-secondary mb-0">
        <?= htmlspecialchars($tournamentName, ENT_QUOTES, 'UTF-8') ?> · <?= $ring === null ? 'All rings' : 'Ring ' . (int) $ring ?>
      </p>
    </div>
    <form class="d-flex align-items-end gap-2" method="get" action="/review/matches.php">
      <div>
        <label class="form-label small mb-1" for="matchesRing">Filter by ring</label>
        <input id="matchesRing" class="form-control form-control-sm" type="number" name="ring" min="1" max="14" value="<?= $ring === null ? '' : (int) $ring ?>" placeholder="All">
      </div>
      <button class="btn btn-sm btn-primary" type="submit">Apply</button>
      <?php if ($ring !== null): ?><a class="btn btn-sm btn-outline-secondary" href="/review/matches.php">Clear</a><?php endif; ?>
    </form>
  </div>

  <?php if ($parameterError !== null): ?>
    <div class="alert alert-warning" role="alert"><?= htmlspecialchars($parameterError, ENT_QUOTES, 'UTF-8') ?></div>
  <?php endif; ?>
  <?php if ($databaseError !== null): ?>
    <div class="alert alert-danger" role="alert"><?= htmlspecialchars($databaseError, ENT_QUOTES, 'UTF-8') ?></div>
  <?php elseif ($tournament === null): ?>
    <div class="alert alert-info" role="status">No current tournament was found.</div>
  <?php elseif ($matches === []): ?>
    <div class="alert alert-info" role="status">No matches were found<?= $ring === null ? '' : ' for Ring ' . (int) $ring ?>.</div>
  <?php else: ?>
    <?php foreach (array_chunk($matches, 50, true) as $matchGroup): ?>
    <section class="card match-list-card mb-4" aria-label="Tournament matches">
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr><th>Ring</th><th>Match</th><th>Round</th><th>Division / stage</th><th>Chung</th><th>Hong</th><th>Status</th><th>Recording</th><th><span class="visually-hidden">Action</span></th></tr>
          </thead>
          <tbody>
          <?php foreach ($matchGroup as $match):
              $round = $match['round_number'] === null ? 1 : max(1, (int) $match['round_number']);
              $reviewUrl = '/review/index.php?' . http_build_query(['ring' => (int) $match['ring_number'], 'match' => $match['match_number'], 'round' => $round]);
          ?>
            <tr>
              <td><strong><?= (int) $match['ring_number'] ?></strong></td>
              <td><strong><?= htmlspecialchars((string) $match['match_number'], ENT_QUOTES, 'UTF-8') ?></strong></td>
              <td><?= $round ?></td>
              <td><div><?= htmlspecialchars((string) ($match['division'] ?: '—'), ENT_QUOTES, 'UTF-8') ?></div><small class="text-secondary"><?= htmlspecialchars((string) ($match['stage'] ?: '—'), ENT_QUOTES, 'UTF-8') ?></small></td>
              <td><div><?= htmlspecialchars((string) ($match['chung_name'] ?: '—'), ENT_QUOTES, 'UTF-8') ?></div><small class="text-secondary"><?= htmlspecialchars((string) ($match['chung_team'] ?: ''), ENT_QUOTES, 'UTF-8') ?></small></td>
              <td><div><?= htmlspecialchars((string) ($match['hong_name'] ?: '—'), ENT_QUOTES, 'UTF-8') ?></div><small class="text-secondary"><?= htmlspecialchars((string) ($match['hong_team'] ?: ''), ENT_QUOTES, 'UTF-8') ?></small></td>
              <td><span class="badge <?= ivr_status_class((string) $match['status']) ?>"><?= htmlspecialchars(ucfirst((string) $match['status']), ENT_QUOTES, 'UTF-8') ?></span></td>
              <td class="small"><div><span class="text-secondary">Start:</span> <?= ivr_match_time($match['recording_start_epoch_us']) ?></div><div><span class="text-secondary">End:</span> <?= ivr_match_time($match['ended_at_epoch_us']) ?></div></td>
              <td class="text-end"><a class="btn btn-sm btn-outline-primary text-nowrap" href="<?= htmlspecialchars($reviewUrl, ENT_QUOTES, 'UTF-8') ?>"><i class="fa-solid fa-video"></i> Open IVR</a></td>
            </tr>
          <?php endforeach; ?>
          </tbody>
        </table>
      </div>
    </section>
    <?php endforeach; ?>
  <?php endif; ?>
</main>
<script src="/vendor/bootstrap/5.3.3/js/bootstrap.bundle.min.js"></script>
</body>
</html>
