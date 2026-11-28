<?php
declare(strict_types=1);

function management_config(): array
{
    $configured = getenv('FREEPLAY_CONFIG');
    $candidates = $configured ? [$configured] : [dirname(__DIR__, 3) . '/src/config.json', '/usr/local/freeplay/config.json'];
    foreach ($candidates as $path) {
        if (!is_file($path)) continue;
        $config = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($config['fpConf'] ?? null)) throw new RuntimeException('Invalid fpConf configuration.');
        $conf = $config['fpConf'];
        $conf['_configDir'] = dirname(realpath($path));
        if (isset($conf['adminPass']) && !is_string($conf['adminPass'])) throw new RuntimeException('adminPass must be a password_hash string or blank.');
        $hash = $conf['adminPass'] ?? '';
        if ($hash !== '' && (password_get_info($hash)['algoName'] ?? 'unknown') === 'unknown') {
            throw new RuntimeException('adminPass is not a supported PHP password_hash value.');
        }
        $conf['managementDb'] ??= rtrim($conf['dataDir'] ?? '/data', '/') . '/management.sqlite';
        $conf['db'] ??= rtrim($conf['dataDir'] ?? '/data', '/') . '/freeplay.sqlite';
        if (!str_starts_with($conf['managementDb'], '/') || $conf['managementDb'] === $conf['db']) {
            throw new RuntimeException('A separate absolute managementDb path is required.');
        }
        return $conf;
    }
    throw new RuntimeException('FreePlay config.json is unavailable. Set FREEPLAY_CONFIG to its mounted path.');
}

function management_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    ini_set('session.use_strict_mode', '1');
    session_name('freeplay_management');
    session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'path' => '/admin/data/']);
    session_start();
    $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

function management_authorized(array $conf): bool
{
    $hash = $conf['adminPass'] ?? '';
    return $hash === '' || hash_equals(hash('sha256', $hash), (string) ($_SESSION['admin_hash'] ?? ''));
}

function management_csrf(): bool
{
    return hash_equals((string) $_SESSION['csrf'], (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf'] ?? ''));
}

function management_store(array $conf): PDO
{
    // Never create storage directories or open the tournament database from PHP.
    $directory = dirname($conf['managementDb']);
    if (!is_dir($directory) || !is_writable($directory) || is_link($conf['managementDb'])) {
        throw new RuntimeException('Management storage must exist, be writable, and not be a symlink.');
    }
    if (is_file($conf['managementDb']) && is_file($conf['db']) && realpath($conf['managementDb']) === realpath($conf['db'])) {
        throw new RuntimeException('Management storage cannot be the tournament database.');
    }
    if (is_file($conf['managementDb']) && is_file($conf['db'])) {
        $admin = stat($conf['managementDb']); $live = stat($conf['db']);
        if ($admin['dev'] === $live['dev'] && $admin['ino'] === $live['ino']) throw new RuntimeException('Management storage cannot alias tournament storage.');
    }
    $db = new PDO('sqlite:' . $conf['managementDb'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $db->exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    $override = getenv('FREEPLAY_MANAGEMENT_SCHEMA');
    $candidates = [];
    if ($override) {
        $candidates[] = $override;
    } else {
        if (!empty($conf['schemaDir'])) {
            $base = $conf['_configDir'] ?? dirname(__DIR__, 3) . '/src';
            $directory = str_starts_with($conf['schemaDir'], '/') ? $conf['schemaDir'] : $base . '/' . $conf['schemaDir'];
            $candidates[] = rtrim($directory, '/') . '/management.sql';
        }
        $candidates[] = dirname(__DIR__, 3) . '/deploy/db/management.sql';
        $candidates[] = '/usr/local/share/freeplay/db/management.sql';
        $candidates[] = '/usr/share/freeplay/db/management.sql';
        $candidates[] = '/opt/freeplay/db/management.sql';
    }
    $schema = false;
    foreach ($candidates as $candidate) {
        if (is_readable($candidate)) { $schema = file_get_contents($candidate); break; }
    }
    if ($schema === false) throw new RuntimeException('Administrative schema is unavailable. Check the schema path or Docker mount.');
    $db->exec($schema);
    return $db;
}

function management_video_dates(array $conf): array
{
    $root = $conf['videoDir'] ?? rtrim($conf['dataDir'] ?? '/data', '/') . '/video';
    if (!is_dir($root) || !is_readable($root) || is_link($root)) {
        throw new RuntimeException('The configured video directory is unavailable or unsafe.');
    }
    $dates = [];
    foreach (new DirectoryIterator($root) as $entry) {
        $name = $entry->getFilename();
        if ($entry->isDot() || $entry->isLink() || !$entry->isDir() || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $name)) continue;
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $name, new DateTimeZone('UTC'));
        if ($date && $date->format('Y-m-d') === $name) $dates[] = $name;
    }
    sort($dates, SORT_STRING);
    return ['root' => $root, 'dates' => $dates];
}

function management_interval(string $start, string $end, string $zone): array
{
    if (!in_array($zone, DateTimeZone::listIdentifiers(), true) && $zone !== 'UTC') throw new InvalidArgumentException('Choose a valid IANA timezone.');
    $tz = new DateTimeZone($zone);
    $parse = static function (string $day) use ($tz): DateTimeImmutable {
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $day, $tz);
        if (!$d || $d->format('Y-m-d') !== $day) throw new InvalidArgumentException('Dates must be valid YYYY-MM-DD calendar dates.');
        return $d;
    };
    $first = $parse($start); $last = $parse($end ?: $start);
    if ($last < $first) throw new InvalidArgumentException('End date must follow start date.');
    $next = $last->modify('+1 day');
    return ['startDate' => $start, 'endDate' => $last->format('Y-m-d'), 'timezone' => $zone,
        'localStart' => $first->format(DATE_ATOM), 'localEndExclusive' => $next->format(DATE_ATOM),
        'startUs' => $first->getTimestamp() * 1000000, 'endUs' => $next->getTimestamp() * 1000000,
        'utcStart' => $first->setTimezone(new DateTimeZone('UTC'))->format(DATE_ATOM),
        'utcEndExclusive' => $next->setTimezone(new DateTimeZone('UTC'))->format(DATE_ATOM)];
}

function management_escape(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
