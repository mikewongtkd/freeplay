<?php $config = $config ?? require dirname(__DIR__) . '/config/prototype.php'; ?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= htmlspecialchars($config['name']) ?> · Prototype</title>
  <link rel="stylesheet" href="/vendor/bootstrap/5.3.3/css/bootstrap.min.css">
  <link rel="stylesheet" href="/vendor/bootstrap-icons/1.11.3/font/bootstrap-icons.min.css">
  <link rel="stylesheet" href="/review/assets/css/app.css">
  <link rel="stylesheet" href="/review/assets/css/timeline.css">
  <link rel="stylesheet" href="/review/assets/css/responsive.css">
</head>
<body class="ivr-body">
<a class="visually-hidden-focusable skip-link" href="#ivrMain">Skip to replay controls</a>
<header class="ivr-header navbar navbar-dark px-3 py-2">
  <div class="d-flex align-items-center gap-3 min-w-0">
    <a class="navbar-brand fw-bold m-0" href="/index.php">FreePlay</a>
    <span class="header-divider" aria-hidden="true"></span>
    <span class="ivr-title text-truncate">Instant Video Replay (IVR)</span>
  </div>
  <div class="match-context d-none d-lg-flex align-items-center gap-2" aria-label="Match context">
    <strong id="headerRing">Ring <?= (int) $ring ?></strong><span>·</span><span id="headerDivision">Loading match…</span><span>·</span><span id="headerStage"></span>
  </div>
  <div class="d-flex align-items-center gap-2">
    <time id="headerClock" class="d-none d-md-inline small"></time>
    <span id="liveStatus" class="live-status"><span class="live-dot"></span> Live</span>
    <div class="dropdown">
      <button class="btn btn-sm btn-header dropdown-toggle" data-bs-toggle="dropdown" type="button">Views</button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li><button class="dropdown-item" data-action="show-mcv">Multi Camera View</button></li>
        <li><button class="dropdown-item" data-action="show-camera" data-camera="1">Camera 1</button></li>
        <li><button class="dropdown-item" data-action="show-camera" data-camera="2">Camera 2</button></li>
        <li><button class="dropdown-item" data-action="show-camera" data-camera="3">Camera 3</button></li>
      </ul>
    </div>
    <div class="dropdown">
      <button class="btn btn-sm btn-header dropdown-toggle" data-bs-toggle="dropdown" type="button">Help</button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li><button class="dropdown-item" data-bs-toggle="modal" data-bs-target="#legendModal">Legend</button></li>
        <li><button class="dropdown-item" data-bs-toggle="modal" data-bs-target="#shortcutsModal">Keyboard Shortcuts</button></li>
      </ul>
    </div>
    <button class="btn btn-sm btn-header" type="button" data-bs-toggle="offcanvas" data-bs-target="#developerPanel" aria-label="Open prototype settings"><i class="bi bi-gear-fill"></i></button>
  </div>
</header>
