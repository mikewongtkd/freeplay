<?php
$config = $config ?? require dirname(__DIR__) . '/config/prototype.php';
$pageTitle = $pageTitle ?? $config['name'] . ' · Prototype';
$bodyClass = $bodyClass ?? 'ivr-body';
$headerMode = $headerMode ?? 'review';
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="stylesheet" href="/vendor/bootstrap/5.3.3/css/bootstrap.min.css">
  <link rel="stylesheet" href="/vendor/fontawesome-free/7.3.0/css/all.min.css">
  <link rel="stylesheet" href="/review/assets/css/app.css">
  <link rel="stylesheet" href="/review/assets/css/timeline.css">
  <link rel="stylesheet" href="/review/assets/css/responsive.css">
</head>
<body class="<?= htmlspecialchars($bodyClass, ENT_QUOTES, 'UTF-8') ?>">
<a class="visually-hidden-focusable skip-link" href="#ivrMain">Skip to main content</a>
<header class="ivr-header navbar navbar-dark px-3 py-2">
  <div class="d-flex align-items-center gap-3 min-w-0">
    <a class="navbar-brand fw-bold m-0" href="/index.php">FreePlay</a>
    <span class="header-divider" aria-hidden="true"></span>
    <span class="ivr-title text-truncate">Instant Video Replay (IVR)</span>
  </div>
  <?php if ($headerMode === 'matches'): ?>
    <div class="match-context d-none d-lg-flex align-items-center gap-2" aria-label="Tournament match list context">
      <strong><?= htmlspecialchars($tournamentName ?? 'Current tournament', ENT_QUOTES, 'UTF-8') ?></strong><span>·</span><span><?= $ring === null ? 'All rings' : 'Ring ' . (int) $ring ?></span>
    </div>
  <?php else: ?>
    <div class="match-context d-none d-lg-flex align-items-center gap-2" aria-label="Match context">
      <strong id="headerRing">Ring <?= (int) $ring ?></strong><span>·</span><span id="headerDivision">Loading match…</span><span>·</span><span id="headerStage"></span>
    </div>
  <?php endif; ?>
  <div class="d-flex align-items-center gap-2">
  <?php if ($headerMode === 'matches'): ?>
    <?php if ($ring !== null): ?><a class="btn btn-sm btn-header" href="/review/matches.php"><i class="fa-solid fa-layer-group"></i> All Rings</a><?php endif; ?>
    <a class="btn btn-sm btn-header" href="/index.php"><i class="fa-solid fa-table-cells-large"></i> Dashboard</a>
  <?php else: ?>
    <time id="headerClock" class="d-none d-md-inline small"></time>
    <span id="liveStatus" class="live-status"><span class="live-dot"></span><span id="liveStatusText">Live</span></span>
    <button class="btn btn-sm btn-header" type="button" data-bs-toggle="modal" data-bs-target="#matchModal"><i class="fa-solid fa-pen-to-square"></i> Match</button>
    <button class="btn btn-sm btn-header" type="button" data-bs-toggle="modal" data-bs-target="#cameraConfigModal"><i class="fa-solid fa-video"></i> Cameras</button>
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
    <button class="btn btn-sm btn-header" type="button" data-bs-toggle="offcanvas" data-bs-target="#developerPanel" aria-label="Open prototype settings"><i class="fa-solid fa-gear"></i></button>
  <?php endif; ?>
  </div>
</header>
