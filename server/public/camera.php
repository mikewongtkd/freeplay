<?php $streamId = $_GET['stream_id'] ?? ''; ?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Camera <?= htmlspecialchars($streamId) ?></title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><link href="css/app.css" rel="stylesheet"></head>
<body class="bg-body-tertiary"><nav class="navbar navbar-dark bg-dark"><div class="container-fluid"><a class="navbar-brand" href="index.php">← FreePlay</a></div></nav>
<main class="container py-4"><h1 class="h4 mb-3"><?= htmlspecialchars($streamId) ?></h1><div id="cameraMeta" class="row g-2 mb-3"></div><div class="card shadow-sm"><div class="card-body"><canvas id="statsChart" height="110"></canvas></div></div></main>
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script><script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script>window.FREEPLAY_STREAM_ID=<?= json_encode($streamId) ?>;</script><script src="js/camera.js"></script></body></html>
