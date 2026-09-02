<?php $title = 'FreePlay Video Server'; ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= htmlspecialchars($title) ?></title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<link href="css/app.css" rel="stylesheet">
</head>
<body class="bg-body-tertiary">
<nav class="navbar navbar-dark bg-dark shadow-sm">
  <div class="container-fluid"><span class="navbar-brand mb-0 h1">FreePlay Video Server</span><div><a href="tests.php" class="btn btn-sm btn-outline-light me-2">Test Report</a><span id="liveCount" class="badge text-bg-secondary">0 LIVE</span></div></div>
</nav>
<main class="container-fluid py-3">
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div><h1 class="h4 mb-1">Camera Dashboard</h1><div class="text-secondary small">Node.js ingest + PHP/Bootstrap dashboard + SQLite history</div></div>
    <div id="updatedAt" class="small text-secondary"></div>
  </div>
  <div id="cameraGrid" class="row g-3"></div>
</main>
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
<script src="js/dashboard.js"></script>
</body>
</html>
