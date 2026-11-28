# Data management console: discovery and implementation plan

Status: discovery and the first inspection/authentication implementation are in
place. Docker is the first deployment target; UNIX (macOS/Raspbian) is second.
No archive, service-control, database-swap, restoration, or cleanup operations
have been implemented or run. The source specification remains
`docs/data_management_console.md`.

## Discovery baseline (before this implementation)

- `src/freeplay.js` reads `src/config.json`. The checked-in values select
  `/data/freeplay.sqlite` and `/data/video`; `fpConf.root` resolves relative to
  `src`. Its database fallback is `/data/freeplay.db`, which differs from PHP's
  default. The configured `schemaDir` is resolved against the process working
  directory, not `fpConf.root`. Startup applies migrations and the schema.
- `public/api/common.php` independently opens `/data/freeplay.sqlite` using PDO.
  `public/review/includes/api-common.php` uses `FREEPLAY_DB` or that same default,
  and can execute schema creation and migrations when opening the database.
  Configurable Node paths therefore do not establish the effective PHP paths.
- `src/recorder.js` creates UTC date directories and UTC time-based filenames.
  `src/freeplay.js` stores `files.path` relative to its resolved `ROOT`.
  `src/replay-service.js` resolves those paths against that root and enforces
  lexical containment under `videoDir`. Archive activation must preserve this
  mapping and separately validate real paths and symlink targets.
- Server-generated ISO timestamps use UTC. GOP epoch microseconds represent
  server receipt time; media PTS values are stream-relative and cannot establish
  calendar membership. Legacy SQL timestamp fields and records with missing
  bounds require explicit classification; an open session is not evidence of
  ongoing ingestion by itself.
- `deploy/db/schema.sql` defines the 19-table schema, including the nine IVR
  tables. Node and PHP contain additional idempotent migrations. Extraction must
  inspect the snapshot schema rather than assume only the SQL file is relevant.
- Ingestion, recording, statistics, test jobs, and replay share the Node process
  and database connection. Replay cannot currently run as an independently
  managed service. Shutdown closes sockets and eventually the database, with a
  five-second forced-exit timeout; a stop request alone does not prove completed
  recording drain or database quiescence.
- Other writers include PHP events/configuration endpoints, IVR camera and match
  endpoints, and connection-time migrations. The review request workflow in
  `public/review/api/review.php` currently stores reviews in PHP session state;
  the IVR tables must not be treated as a complete record of that workflow.
- `systemd/freeplay.service` manages the combined Node process with
  `Restart=on-failure`. `deploy/docker/Makefile` mounts `src` at
  `/usr/local/freeplay`, `public` at `/var/www/html`, and host `data` at `/data`.
  The Dockerfile uses PHP/Apache; the repository does not establish an independent
  admin worker, a host control broker, or a macOS launchd deployment. Host SSD
  paths will not automatically be visible to a container.
- There is no existing admin directory or authenticated administrator role in
  the inspected PHP entry points. PHP session initialization is not administrator
  authentication. Maintenance must gate direct PHP and Node mutations, not just
  hide buttons in the new console.
- Existing components are PHP, Bootstrap 5, jQuery, Node, `better-sqlite3`, and
  Node's test runner (`src/test/*.test.js`). The development host's `/usr/bin/rsync`
  reports openrsync, protocol 29, rsync 2.6.9 compatibility. Runtime deployment
  capabilities must be probed independently; GNU-only flags cannot be assumed.

## Confirmed configuration and remaining service-coordination gates

The operator confirmed Docker first, UNIX second, browser-entered SSD paths, and
PHP `password_verify` against a `password_hash` value at `fpConf.adminPass`. Missing
or blank `adminPass` intentionally disables password protection. These decisions
are implemented in `public/admin/data/`; the independent Node inspection worker
is in `src/management/`. Docker worker configuration is provided in
`deploy/docker/compose.management.yaml`. See `data-management-console.md` for
implemented scope, setup, tests and manual inspection recovery.

Browser storage paths refer to already mounted paths visible to the worker.
They do not grant Docker host mount access or establish physical SSD identity.
The worker probes candidate storage but does not authorize archive writes.

The remaining commissioning requirements are:

1. Implement and validate Docker service supervision that drains ingestion and
   blocks PHP writers while retaining the independent administrative worker.
   Provide a separately startable replay-only runtime.
2. Implement stable host volume identity verification and enforceable read-only
   access during historical playback, with matching host/container mount paths.
3. Verify effective Node/PHP database and media mappings and process identities
   on a disposable actual Docker deployment. The preview timezone defaults to
   America/Los_Angeles and remains editable.

The specification's discovery gate applies: do not invent service-control APIs,
grant the webserver privileged shell access, or claim quiescence based only on a
health endpoint. Do not start maintenance-dependent phases until this contract
is established. Actual service and mount verification must use disposable data.

## Planned changes and validation gates

1. **Read-only inspection and fixtures.** Add `src/management/` modules for schema
   discovery, explicit path mapping, timezone/date boundaries, and structured
   findings. Add disposable fixtures derived from `deploy/db/schema.sql` under
   `src/test/`; never open `/data` in tests. Separate integrity failures from
   warnings about incomplete/RAM-only records. Do not offer repairs without
   established safe semantics.
2. **State and coordination.** Add a separate administrative SQLite store,
   cross-process operation ownership, durable intent/completion journal, and
   recovery reconciliation. Build the worker separately from `freeplay.js`.
   Implement the deployment-specific restricted service adapter after the
   decisions above. Gate Node startup, Node mutation routes, PHP writers and
   migrations against persisted maintenance/historical state. Split out or
   introduce an explicit replay-only runtime before historical activation.
   Failures must remain blocked rather than report LIVE.
3. **Snapshot and extraction.** Use SQLite backup into an operation-owned copy.
   Select overlapping files/GOPs by established UTC bounds and retain complete
   files plus codec/parent dependencies. Derive the IVR foreign-key closure,
   including self-linked reviews and nullable references. Present ambiguous
   associations for resolution. Delete excluded rows transactionally in
   dependency order with foreign keys enabled; validate source immutability,
   integrity, counts, and exact media inventory. Exclude diagnostic test data
   unless explicitly selected.
4. **Archive.** Validate mounted volume identity and capacity, stage an exact
   approved inventory with portable rsync arguments, and verify hashes and
   unchanged sources. Journal resumable boundaries and finalize by same-volume
   rename only after verification. Write a versioned manifest, schema artifact,
   report and checksum inventory without secrets. Cancellation must preserve
   owned staging and recoverable state.
5. **Historical review.** Validate compatibility and archive checksums, preserve
   the exact live environment, stage a local database copy, and journal every
   rename/link. Reject collisions and unsafe mappings. Enforce archive media
   read-only permissions and historical mutation gates. Start replay alone and
   validate representative seek resolution before reporting HISTORICAL.
   Handle SSD removal as a blocked/recovery state.
6. **Restoration and cleanup.** Stage and verify physical copies before explicit
   activation. Preserve the previous environment and provide idempotent return
   to original live. Source cleanup is a distinct confirmed operation that
   re-verifies the archive and checks remaining references; never follow
   symlinks, delete unknown paths, or discard recoverable originals.
7. **UI and operator guide.** Place the PHP entry point and its web components
   under `public/admin/data/` (URL `/admin/data/index.php`). Add navigation using
   repository conventions, authenticated status/history and CSRF-protected
   asynchronous mutations, confirmations and exact previews. Worker code remains
   outside the document root. Provide deployment-specific setup and recovery
   instructions. Disabled actions must explain their unmet prerequisites.

Every mutation phase requires tests for injected failures before and after each
filesystem change, concurrent operations, restart recovery, path/symlink attacks,
wrong/unplugged mounts, WAL snapshots, compatibility, and rollback. Date tests
must cover DST, UTC midnight, missing bounds and crossing sessions. Run existing
ingestion/replay/IVR regression tests after integration. Test service/mount
arrangements on disposable environments before any production-readiness claim.

Optional catalog, forecasting, analytics, retention, scheduled checks,
reconstruction, thumbnail regeneration, historical annotation export, selective
ring/match export and other excluded enhancements remain out of scope. The
tournament schema remains unchanged.
