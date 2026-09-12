<?php
declare(strict_types=1);
$config = require __DIR__ . '/config/prototype.php';
$ringValue = filter_input(INPUT_GET, 'ring', FILTER_VALIDATE_INT);
$ring = $ringValue === false || $ringValue === null ? $config['defaultRing'] : max(1, min(14, $ringValue));
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
