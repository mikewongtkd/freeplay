<div id="toastRegion" class="toast-container position-fixed bottom-0 end-0 p-3" aria-live="polite"></div>
<script>window.FREEPLAY_IVR = <?= json_encode([
    'ring' => $ring,
    'match' => $matchRequestError === null && $requestedMatchNumber !== '' ? $requestedMatchNumber : null,
    'round' => $requestedRound ?? 1,
    'matchRequestError' => $matchRequestError,
    'config' => $config,
], JSON_UNESCAPED_SLASHES) ?>;</script>
<script src="/vendor/jquery/3.7.1/jquery.min.js"></script>
<script src="/vendor/bootstrap/5.3.3/js/bootstrap.bundle.min.js"></script>
<?php if ($matchRequestError !== null): ?>
<script>
document.addEventListener("DOMContentLoaded", () => {
  const element = document.getElementById("matchRequestErrorModal");
  if (!element) return;
  element.addEventListener("hidden.bs.modal", () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("match");
    window.location.replace(url.toString());
  }, { once: true });
  bootstrap.Modal.getOrCreateInstance(element).show();
});
</script>
<?php endif; ?>
<script type="module" src="/review/assets/js/app.js"></script>
</body>
</html>
