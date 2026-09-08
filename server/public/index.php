<?php $title = 'FreePlay Video Server'; ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= htmlspecialchars($title) ?></title>
<link href="vendor/bootstrap/5.3.3/css/bootstrap.min.css" rel="stylesheet">
<link href="css/app.css" rel="stylesheet">
</head>
<body class="bg-body-tertiary">
<nav class="navbar navbar-dark bg-dark shadow-sm">
  <div class="container-fluid"><span class="navbar-brand mb-0 h1">FreePlay Video Server</span><div><a href="tests/" class="btn btn-sm btn-outline-light me-2">Test Suites</a><span id="liveCount" class="badge text-bg-secondary">0 LIVE</span></div></div>
</nav>
<main class="container-fluid py-3">
  <div class="d-flex justify-content-between align-items-center mb-3">
    <div><h1 class="h4 mb-1">Ring Dashboard</h1><div class="text-secondary small">Tournament IVR System status monitor</div></div>
    <div id="updatedAt" class="small text-secondary"></div>
  </div>
  <div class="row g-3 align-items-start">
    <section class="col-12 col-lg-8" aria-labelledby="ringsHeading">
      <div id="ringGrid" class="row g-3"></div>
    </section>
    <aside class="col-12 col-lg-4" aria-labelledby="cameraDetailsHeading">
      <div id="cameraDetails" class="camera-details-panel sticky-lg-top">
        <div class="card shadow-sm border-secondary">
          <div class="card-body">
            <h2 id="cameraDetailsHeading" class="h5">Camera details</h2>
            <p class="text-secondary mb-0">Select a camera status badge to view its live metrics and history link.</p>
          </div>
        </div>
      </div>
    </aside>
  </div>
</main>
<script src="vendor/jquery/3.7.1/jquery.min.js"></script>
<script src="vendor/bootstrap/5.3.3/js/bootstrap.bundle.min.js"></script>
<script src="vendor/chart.js/4.4.4/chart.umd.min.js"></script>
<script src="js/dashboard.js"></script>
</body>
</html>
