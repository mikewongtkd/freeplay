<div id="toastRegion" class="toast-container position-fixed bottom-0 end-0 p-3" aria-live="polite"></div>
<script>window.FREEPLAY_IVR = <?= json_encode(['ring' => $ring, 'config' => $config], JSON_UNESCAPED_SLASHES) ?>;</script>
<script src="/vendor/jquery/3.7.1/jquery.min.js"></script>
<script src="/vendor/bootstrap/5.3.3/js/bootstrap.bundle.min.js"></script>
<script type="module" src="/review/assets/js/app.js"></script>
</body>
</html>
