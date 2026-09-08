<?php $title = 'FreePlay Test Suites'; ?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title><?= htmlspecialchars($title) ?></title>
  <link href="../vendor/bootstrap/5.3.3/css/bootstrap.min.css" rel="stylesheet">
  <link href="../css/app.css" rel="stylesheet">
</head>
<body class="bg-body-tertiary">
  <nav class="navbar navbar-dark bg-dark"><div class="container-fluid"><a class="navbar-brand" href="../index.php">← FreePlay</a></div></nav>
  <main class="container py-4">
    <div class="mb-4"><h1 class="h3 mb-1">Test Suites</h1><div class="text-secondary">Validation and readiness reports for the FreePlay system</div></div>
    <div class="row g-3">
      <div class="col-12 col-md-6 col-xl-4">
        <div class="card h-100 shadow-sm border-primary">
          <div class="card-body d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start"><h2 class="h5">Ingestion Tests</h2><span class="badge text-bg-primary">FPV1</span></div>
            <p class="text-secondary">Validate camera-to-server protocol framing, codec/GOP behavior, timing, recording, replay lookup, resilience, synchronization, and capacity.</p>
            <a class="btn btn-primary mt-auto" href="ingestion.php">Open ingestion test report</a>
          </div>
        </div>
      </div>
    </div>
  </main>
</body>
</html>
