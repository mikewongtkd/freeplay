<?php
declare(strict_types=1);
$config = require __DIR__ . '/config/prototype.php';
$ringValue = filter_input(INPUT_GET, 'ring', FILTER_VALIDATE_INT);
$ring = $ringValue === false || $ringValue === null ? $config['defaultRing'] : max(1, min(14, $ringValue));
$requestedMatchNumber = trim((string) ($_GET['match'] ?? ''));
$roundValue = filter_input(INPUT_GET, 'round', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
$requestedRound = $roundValue === false || $roundValue === null ? 1 : $roundValue;
$matchRequestError = null;

if ($requestedMatchNumber !== '') {
    require_once __DIR__ . '/includes/api-common.php';
    try {
        $statement = ivr_db()->prepare(<<<'SQL'
            SELECT m.id, r.ring_number
            FROM ivr_matches m
            JOIN ivr_rings r ON r.id = m.ring_id
            WHERE m.match_number = :match_number
            ORDER BY CASE WHEN r.ring_number = :ring_number THEN 0 ELSE 1 END,
                     m.updated_at DESC, m.id DESC
            SQL);
        $statement->execute(['match_number' => $requestedMatchNumber, 'ring_number' => $ring]);
        $matches = $statement->fetchAll();
        if ($matches === []) {
            $matchRequestError = [
                'title' => 'Match not found',
                'message' => "Match {$requestedMatchNumber} was not found in the database.",
            ];
        } else {
            $ringMatch = array_values(array_filter($matches, static fn (array $match): bool => (int) $match['ring_number'] === $ring));
            if ($ringMatch === []) {
                $actualRing = (int) $matches[0]['ring_number'];
                $matchRequestError = [
                    'title' => 'Match is assigned to another ring',
                    'message' => "Match {$requestedMatchNumber} is assigned to Ring {$actualRing}, not Ring {$ring}.",
                ];
            }
        }
    } catch (Throwable $error) {
        $matchRequestError = [
            'title' => 'Match lookup unavailable',
            'message' => 'The match database could not be queried. Please check the server log and try again.',
        ];
    }
}
require __DIR__ . '/includes/header.php';
?>
<main id="ivrMain" class="ivr-shell" tabindex="-1">
  <section id="statusStrip" class="status-strip" aria-live="polite"></section>
  <?php require __DIR__ . '/views/mcv.php'; ?>
  <?php require __DIR__ . '/views/scv.php'; ?>
  <?php require __DIR__ . '/views/timeline.php'; ?>
  <?php require __DIR__ . '/views/playback-controls.php'; ?>
</main>
<?php require __DIR__ . '/includes/modals.php'; ?>
<?php require __DIR__ . '/includes/footer.php'; ?>
