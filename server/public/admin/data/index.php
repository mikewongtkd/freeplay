<?php
declare(strict_types=1);
require __DIR__ . '/common.php';
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
$error = ''; $conf = null;
try {
    $conf = management_config(); management_session();
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!management_csrf()) throw new RuntimeException('Invalid CSRF token. Reload this page.');
        if (isset($_POST['logout'])) {
            unset($_SESSION['admin_hash']); session_regenerate_id(true);
        } elseif (isset($_POST['password'])) {
            $now = time();
            if ($now < ($_SESSION['login_after'] ?? 0)) throw new RuntimeException('Please wait before trying again.');
            if (($conf['adminPass'] ?? '') !== '' && !password_verify((string) $_POST['password'], $conf['adminPass'])) {
                $_SESSION['login_after'] = $now + 3;
                throw new RuntimeException('Password did not match.');
            }
            session_regenerate_id(true);
            $_SESSION['admin_hash'] = hash('sha256', $conf['adminPass'] ?? '');
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
        }
    }
} catch (Throwable $e) { $error = $e->getMessage(); }
$authorized = $conf !== null && management_authorized($conf);
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>FreePlay Data Management</title><link rel="stylesheet" href="../../vendor/bootstrap/5.3.3/css/bootstrap.min.css"></head>
<body class="bg-body-tertiary"><nav class="navbar navbar-dark bg-dark"><div class="container-fluid"><a class="navbar-brand" href="../../index.php">FreePlay</a><span class="text-white">Data Management</span></div></nav>
<main class="container py-4"><h1 class="h3">Data Management</h1>
<?php if ($error): ?><div class="alert alert-danger"><?= management_escape($error) ?></div><?php endif; ?>
<?php if (!$authorized): ?>
<form method="post" class="card card-body"><input type="hidden" name="csrf" value="<?= management_escape($_SESSION['csrf'] ?? '') ?>"><label for="password" class="form-label">Administrator password</label><input id="password" type="password" name="password" class="form-control mb-3" autocomplete="current-password" required><button class="btn btn-primary">Sign in</button></form>
<?php else: ?>
<div id="console" data-csrf="<?= management_escape($_SESSION['csrf']) ?>">
<?php if (($conf['adminPass'] ?? '') === ''): ?><div class="alert alert-warning">Password protection is disabled in config.json. Anyone with access to this page can use the console.</div><?php else: ?><form method="post" class="mb-3"><input type="hidden" name="csrf" value="<?= management_escape($_SESSION['csrf']) ?>"><button name="logout" class="btn btn-outline-secondary btn-sm">Sign out</button></form><?php endif; ?>
<div id="status" class="alert alert-info" aria-live="polite">Loading worker status…</div>
<div class="alert alert-secondary">Inspection and previews are available. Archive creation, historical activation, restoration, cleanup and Return to Live are disabled until independent service coordination, write protection and runtime verification are implemented. A preview does not create an archive.</div>
<div id="error" class="alert alert-danger" role="alert" hidden></div>
<div class="row g-3">
<section class="col-lg-6"><div class="card card-body h-100"><h2 class="h5">Data Quality</h2><p>Inspect a consistent database snapshot. Reports include integrity, relationships, indexed files and GOP ranges. No repairs or source changes are performed.</p><button class="btn btn-primary" data-operation="inspect">Inspect snapshot</button></div></section>
<section class="col-lg-6"><form id="date-form" class="card card-body h-100"><h2 class="h5">Archive Game Day — preview</h2><label for="start" class="form-label">Start date</label><input class="form-control mb-2" id="start" name="startDate" type="date" required><label for="end" class="form-label">End date (defaults to start)</label><input class="form-control mb-2" id="end" name="endDate" type="date"><label for="zone" class="form-label">Timezone</label><input class="form-control mb-2" id="zone" name="timezone" value="America/Los_Angeles" required><label for="name" class="form-label">Tournament name (optional)</label><input class="form-control mb-3" id="name" name="name" maxlength="200"><button class="btn btn-primary">Preview date range</button></form></section>
<section class="col-lg-6"><form id="storage-form" class="card card-body h-100"><h2 class="h5">External SSD</h2><label for="storage" class="form-label">Mounted path visible inside this container</label><input class="form-control mb-2" id="storage" name="storagePath" placeholder="/archives" required><p class="small text-secondary">Docker must bind-mount the host SSD first. This form cannot mount host disks. The path is checked without creating directories.</p><button class="btn btn-primary">Check storage</button></form></section>
<section class="col-lg-6"><div class="card card-body h-100"><h2 class="h5">Historical Review / Restore / Return to Live</h2><p>These actions require verified service isolation and reversible activation. No environment changes are available in this phase.</p><button class="btn btn-secondary" disabled>Historical Review</button><button class="btn btn-secondary mt-2" disabled>Restore</button><button class="btn btn-secondary mt-2" disabled>Return to Live</button></div></section>
</div>
<section class="card card-body my-3"><h2 class="h5">Operation History</h2><div class="table-responsive"><table class="table"><thead><tr><th>Created</th><th>Operation</th><th>State</th><th>Progress</th><th>Actions</th></tr></thead><tbody id="history"></tbody></table></div></section>
<section class="card card-body"><h2 class="h5">Operation details</h2><p>Findings and date selection are diagnostic previews. Ambiguous records require resolution before extraction.</p><pre id="details" class="text-wrap" aria-live="polite">Select an operation to view its results and journal.</pre></section>
</div><script src="../../vendor/jquery/3.7.1/jquery.min.js"></script><script src="console.js"></script>
<?php endif; ?></main></body></html>
