<section id="mcvView" class="view-panel" aria-label="Multi Camera View">
  <div class="mcv-grid">
    <?php for ($camera = 1; $camera <= 3; $camera++): ?>
      <article class="video-tile camera-tile" data-camera-tile="<?= $camera ?>" tabindex="0" role="button" aria-label="Open Camera <?= $camera ?> in Single Camera View">
        <div class="simulated-video camera-scene camera-scene-<?= $camera ?>">
          <div class="camera-label"><strong>CAM <?= $camera ?></strong><span data-camera-name="<?= $camera ?>">Camera <?= $camera ?></span></div>
          <span class="camera-state badge" data-camera-state="<?= $camera ?>">LOADING</span>
          <div class="camera-action"><span class="fighter fighter-hong"></span><span class="fighter fighter-chung"></span></div>
          <div class="unavailable-overlay" data-camera-unavailable="<?= $camera ?>"><i class="bi bi-camera-video-off"></i><strong>No video available</strong><span>Camera unavailable at this time</span></div>
          <div class="video-timecode" data-video-time="<?= $camera ?>">--:--:--.---</div>
        </div>
      </article>
    <?php endfor; ?>
    <?php require __DIR__ . '/review-panel.php'; ?>
  </div>
</section>
