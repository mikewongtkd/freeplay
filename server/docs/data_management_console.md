# FreePlay Data Management Console

## Objective

Implement a production-safe administrative console in the existing FreePlay repository for data quality inspection, date-based tournament extraction, verified SSD archiving, temporary historical review, physical restoration, and return to live operation. Preserve the existing recording and replay behavior. The operator archives after each game day; most tournaments are single-day events. A tournament archive is selected primarily by inclusive local start and end calendar dates, not by an IVR tournament ID.

Implement the core proposal only. Do not begin the optional enhancements listed under exclusions below. Work incrementally, with tests and reviewable changes. Do not deploy, operate on real tournament data, or run destructive commands against the developer's machine.

## 1. Repository discovery and implementation plan

Before editing, inspect `deploy/db/schema.sql`, `src/freeplay.js`, `src/config.json`, `public/review/includes/api-common.php`, `public/review/api/review.php`, existing administration pages, service/container definitions, media storage and replay code, migrations, and test infrastructure. Paths are starting points; locate their current equivalents if changed.

Determine:

- Actual database and video roots (expected `/data/freeplay.sqlite` and `/data/video`), host/container mount mappings, and how paths in `files.path` are resolved.
- Whether video date directories and timestamps use UTC or local time; how epoch microseconds, PTS, legacy timestamp columns, and open sessions are interpreted.
- Every database writer, recording worker, background job, PHP connection and replay service; how to quiesce and restart them independently of the administrative worker.
- Current IVR persistence behavior, authentication/authorization, SQLite library and migration behavior, supported macOS/Linux deployment mechanisms, and available rsync versions.
- Existing conventions for PHP, Bootstrap 5, jQuery and Node.js. Reuse existing components rather than introduce a new framework.

Write a short implementation plan identifying actual files, service boundaries, risks and unresolved questions. If a safe service-control mechanism, timestamp interpretation, or media mapping cannot be established, stop that phase and ask for clarification. Do not invent APIs or silently assume paths. Implement in the phases below; report tests and changes at each phase. Keep unrelated UI/UX work untouched.

## 2. Scope and non-goals

In scope: read-only data quality checks, explicit repair previews and narrowly approved safe repairs, date-range extraction into a database copy, consistent SQLite snapshots, self-contained archive packages, rsync copy and verification, temporary historical review, return to live, physical restoration, and explicitly approved cleanup of verified source data. Include the minimum persistent administrative state, operation history, manifest discovery and compatibility checks required to execute these workflows safely.

Do **not** implement Section 9 optional enhancements: a standalone searchable archive catalog, general storage forecasting or capacity dashboard, enhanced tournament quality analytics/reporting, duplicate archive detection, selective ring/match export, multi-server archive consolidation, retention policies, historical annotation export, scheduled integrity checks, GOP reconstruction, or thumbnail cache regeneration. Do not implement TTP, synthetic camera load testing, or unrelated schema changes. Basic free-space preflight, operation-specific dry runs, verification, recovery journaling, physical restoration and compatibility checks remain mandatory because they are integral to the core workflows, even though they were also mentioned in Section 9. Use a simple archive-directory selector and manifest reader, not a catalog product. If scope is uncertain, defer the feature.

## 3. Architecture and safety contract

Use existing PHP/Bootstrap/jQuery administration UI and a restricted Node.js administrative worker (or an equivalent repository-native service if justified). The worker must remain available while ingestion and replay services are stopped. Do not grant the webserver unrestricted shell access, root privileges or Docker socket access. Use authenticated administrator-only endpoints, CSRF protection for mutations, allowlisted operations and configured storage roots. Invoke external programs with argument arrays, never interpolated shell strings. Validate paths, reject traversal and unexpected symlinks, and verify actual mounted volume identity, not merely directory existence. Account for host/container visibility of symlink targets. Fail closed when storage is missing or ambiguous.

Use a separate persistent administrative SQLite database, e.g. `/data/management.sqlite`, outside the database being swapped. Store operation IDs, type, state, step intent/completion, source/destination identities, exact owned paths, timestamps, findings, error details and recovery instructions. Do not store secrets. Enforce one exclusive maintenance operation across processes; prevent recording from starting during maintenance or historical review. Startup must honor persisted state even after reboot. Provide explicit states LIVE, MAINTENANCE, ARCHIVING, HISTORICAL, RESTORING and RECOVERY_REQUIRED (or equivalent). Never report LIVE until database, media and service health are verified.

Long-running jobs must be asynchronous, with status/progress, logs and safe cancellation boundaries. Persist intent before each filesystem mutation and completion after it; reconcile actual filesystem state on restart. Use unique backup/staging names, atomic same-filesystem renames where applicable, and durable journal updates. Never overwrite an existing backup or remove unknown paths. Never recursively follow archive symlinks. Preserve recoverable originals until verification and explicit approval. No automatic destructive repair or cleanup.

## 4. Date-based tournament selection and extraction

Provide start date, end date (defaults to start date), timezone (default configurable; America/Los_Angeles is a reasonable deployment default), and optional human-readable tournament name. Dates are inclusive local calendar days. Convert to a half-open UTC interval `[start of first day, start of day after last day)` using timezone-aware calendar arithmetic, including DST. Display both local and UTC boundaries. Do not infer tournament membership solely from directory names, camera ring numbers or IVR tournament IDs.

Use a consistent snapshot of the source database. Preview the selected sessions, files, GOPs, statistics, events and IVR records, counts and media size, plus excluded and ambiguous records. Include sessions/files overlapping the interval, not only those starting within it. Preserve complete media files and necessary codec configuration and GOP dependencies; do not trim binary files. Where a file/session crosses the boundary, explicitly show retained out-of-range dependency data and document the policy. Do not silently include unrelated full sessions' media. Require operator resolution for ambiguous timestamps, missing time bounds, same-day unrelated events, or uncertain IVR associations. Permit explicit inclusion/exclusion of ambiguous records with dependency validation, not a new ring/match export feature.

Respect the current 19-table schema and actual repository migrations. In particular:

- `cameras` are shared identities, not tournament-owned records. Retain required parents.
- `sessions` own connection metadata; `codec_configurations`, `statistics`, `files` and `gop_index` reference sessions/cameras. Preserve codec versions and required file references. A nullable GOP file reference is not automatically corruption.
- `events` may have no camera and require time-based selection.
- IVR hierarchy: `ivr_tournaments`, `ivr_rings`, `ivr_ring_cameras`, `ivr_competitors`, `ivr_matches`, `ivr_review_requests`, `ivr_review_decisions`, `ivr_review_annotations`, `ivr_review_audit_events`. Preserve referenced parents and children of selected reviews; handle self-linked reviews and nullable match references explicitly. Do not assume IVR records are populated or authoritative. Resolve ambiguous date associations rather than guessing.
- Retain configuration records needed for compatibility. Exclude unrelated `test_runs`/`test_results` by default; allow inclusion of relevant diagnostic test records only when explicitly selected.

Construct a filtered **copy**, preserving primary keys, schema, indexes and constraints. Use transactions and dependency-safe deletion/insertion ordering; do not disable foreign keys to hide violations. Do not modify the live source database during extraction. Validate integrity, foreign keys, retained counts, required media references and excluded data before accepting the result. Document any retained boundary dependencies. Do not add a tournament foreign key or change the existing tournament schema in this task.

## 5. Data quality inspection

Implement read-only checks with severity, affected table/row/path, evidence and recommended action:

- SQLite `integrity_check` and `foreign_key_check`; invalid timestamp ranges, duplicate logical ring/camera identities, unfinished sessions, incomplete files/GOPs, stale active matches/reviews, cross-tournament competitor assignments and review/match ring mismatches.
- Missing referenced files, unreferenced media, zero-byte files, actual/indexed size differences, invalid GOP offsets/lengths and out-of-bounds byte ranges. Flag overlapping byte ranges for investigation, not automatic deletion. Distinguish expected RAM-only or incomplete records from confirmed missing media.
- Optional operator-triggered deeper fMP4 validation using ffprobe if available; report unavailable dependencies. Do not run expensive scans during live recording unless proven safe; default to maintenance or snapshot inspection.

Provide inspect and repair-preview modes. Implement only narrowly defined, demonstrably safe repairs supported by repository semantics, with exact before/after changes, snapshot, transaction, explicit confirmation and post-validation. If no safe repair can be established, report findings without offering a mutation. Never discard incomplete footage automatically. No reconstruction or general analytics.

## 6. Archive workflow

1. Select a mounted, configured external SSD root; verify identity, permissions, free space, destination nonexistence and rsync availability.
2. Enter maintenance; stop new ingestion and drain/close recordings and all relevant writers. Verify quiescence. Keep the admin worker alive.
3. Create a consistent SQLite snapshot using the SQLite backup API or CLI `.backup`. WAL mode means copying only the active main file is unsafe. Checkpoint/close connections as appropriate; never blindly delete WAL/SHM files.
4. Preview and create the date-filtered archive database as above. Run quality checks and require explicit acknowledgement of nonfatal findings; block integrity failures or unresolved dependencies.
5. Copy the selected media using rsync into a unique staging directory on the destination SSD. Preserve required date-relative layout and file contents; use portable flags supported by the installed rsync. Do not use `--delete` or `--remove-source-files`. Copy only the approved media inventory; if a date directory contains unrelated files, do not blindly copy the entire directory. Support safe resume after interruption.
6. Verify source/destination inventory, byte sizes and SHA-256 hashes, database integrity and media resolution against the staged archive. Detect changes to source files during copy. Finalize only after verification; write manifest and checksum inventory, then rename staging to final on the same filesystem. Incomplete archives must not be selectable for review.
7. Offer a separate optional source-cleanup confirmation only after a verified archive exists. Show exact paths/records, recheck archive availability and hashes, and ensure no remaining live records require removed files. Use a validated replacement database or transaction as appropriate; preserve a recoverable pre-cleanup database. Never remove unrelated dates or directories, never follow symlinks, and journal each step. If cleanup cannot be safely reconciled, leave originals intact. Return to live only after validation.

Example layout (one archive per game day or selected range):

```text
<SSD>/FreePlay-Archives/2026-11-27-example-<unique-id>/
  manifest.json
  freeplay.sqlite
  video/2026-11-27/...
  reports/data-quality.json
  configuration/schema.sql
  checksums.sha256
```

Date directories may differ from local selection dates, including UTC midnight boundaries. Preserve the actual media mapping. Manifest must include archive format version, unique ID, optional name, selected dates/timezone and UTC interval, creation time, source server identity, FreePlay Git revision/schema hash when available, database path, original media root, exact relative media inventory/mapping, counts/bytes, boundary exceptions and verification status/time. Include sanitized configuration only if necessary; never copy credentials. Record checksum format and exclude self-referential checksum entries. Do not claim an archive is verified if verification is incomplete.

## 7. Historical review activation

Use symbolic links for archived video directories, but **copy the archived SQLite database to a temporary local working database** rather than symlinking the master database. This protects the archive from WAL writes, migrations and accidental changes. Historical review is read-only with respect to original competition data; do not implement annotation export or editable historical analysis in this phase.

- Select a completed archive by directory/manifest. Validate compatibility, mount identity, required files, local space and permissions. Reject unsupported schema versions; do not migrate the master archive.
- Enter maintenance and close all live database connections. Verify WAL state and preserve the live database under a unique backup name (e.g. `freeplay.sqlite.bak.<operation-id>`). Record the exact path and original configuration in the administrative journal. Never overwrite an existing `.bak`.
- Copy the archive database to the active location using a staged local file and safe rename. Create links such as `/data/video/2026-11-27` to the corresponding SSD directory. Check every collision before mutation. If an existing real directory occupies the path, either refuse activation or use a separately journaled reversible move after explicit approval; never delete it. If a whole-directory link would expose unrelated media, use a safe isolated mapping supported by the replay code or refuse activation.
- Ensure archive media is protected from writes (read-only mount or enforceable service permissions); a symlink alone is not read-only. Verify links resolve in the actual replay runtime, including containers. Do not allow camera ingestion, recording, cleanup, or background media writes while historical mode is active. Disable review mutations unless necessary for transient playback state; never alter master records.
- Start only required replay services; verify database identity and representative video playback/seek resolution. Show a persistent historical-mode banner, selected dates/name, SSD status and preserved live database status. Detect SSD removal and fail safely; do not silently switch to live or create replacement media directories.

## 8. Return to live and physical restoration

Return to live: stop historical replay and close database connections; reconcile WAL/SHM safely; remove only the temporary working database and links owned by this operation (verify link type and exact target, unlink rather than recursive removal); restore any displaced local directories; restore the exact preserved live database and original configuration. Verify database integrity, expected media paths and service health, then enable ingestion. If any step fails, remain in RECOVERY_REQUIRED with actionable instructions. Never delete the preserved live database or archived media. Repeating recovery must be safe.

Physical restoration is distinct from historical review: copy the verified archive database and media into local staging, verify checksums and path resolution, and activate only after explicit confirmation and maintenance/quiescence. Preserve existing live database and conflicting media under unique recoverable names or refuse collisions. Do not merge SQLite databases or overwrite unrelated files. After activation, validate replay and provide an explicit return-to-original-live operation using the same journal and ownership rules. Cleanup of restored working directories is permitted only for operation-owned paths after verification and confirmation; never remove the external archive. If the operator wants permanent activation of restored data, require a separate explicit confirmation and retain the previous environment for recovery. No automatic purge.

## 9. Administrative UI and API

Integrate with existing admin navigation. Provide Data Quality, Archive Game Day, Historical Review, Restore, Return to Live and Operation History views/actions. Show current mode, active database, selected date range, storage root, progress, findings, exact dry-run changes and recovery status. Use existing UI conventions and responsive layouts. Require explicit confirmation for mutations, especially cleanup, replacement and restoration; disable conflicting actions server-side as well as in the UI. Use structured API responses and stable operation IDs. Do not expose arbitrary filesystem browsing or shell execution. Keep operation history in the separate admin database, not the tournament database. Make this data management admin page available at the `admin/data/index.php` endpoint with all other necessary subcomponents in the `admin/data` directory.

## 10. Implementation sequence and tests

Implement in reviewable phases, with tests before destructive workflows:

1. Discovery, plan, test fixtures and read-only inspection.
2. Administrative state store, exclusive lock, service coordination and crash-recovery primitives.
3. Consistent snapshot, date selection, dependency-aware extraction and dry-run UI.
4. Archive staging, rsync, manifest, checksums and verification.
5. Historical activation/deactivation and restart recovery.
6. Physical restoration and optional verified source cleanup.
7. End-to-end UI integration, operator documentation and regression tests.

Use temporary directories, disposable SQLite fixtures derived from the actual schema, small representative fMP4 fixtures and mocked service control where appropriate. Never use production data or actual mounted archive drives in automated tests. Test at minimum:

- Single day, multi-day, UTC midnight, DST transition, sessions spanning boundaries, same-day ambiguous events, reused cameras, missing timestamps and misassigned ring identities.
- Foreign-key closure including self-linked reviews, nullable references, shared cameras, unrelated test data and codec dependencies; original database unchanged by extraction.
- WAL snapshot with committed uncheckpointed transactions; service quiescence failure; incompatible schema; missing/corrupt media; invalid offsets; incomplete but usable recordings.
- Interrupted rsync, insufficient space, checksum mismatch, unplugged SSD, wrong mount, path traversal, symlink escape, existing backup and directory collisions.
- Crash/restart before and after each database rename, link creation/removal, archive finalization and cleanup step; repeated recovery and concurrent operation rejection.
- Historical replay works without ingestion; archive database and media hashes unchanged after activation/deactivation; original live database and directory identities restored exactly.
- Physical restore verification and rollback; cleanup cannot remove unverified or shared media; authorization/CSRF and argument injection tests.
- Existing ingestion, replay and IVR tests remain passing; no added live-recording overhead from background scans.

## 11. Deliverables and completion criteria

Deliver repository-native code, automated tests, a concise operator guide covering archive/review/restore/recovery, configuration examples for supported Linux and macOS deployments, and a developer explanation of date selection and dependency rules. Document actual service-control requirements and any manual host setup. Update relevant schema documentation only for actual changes (the separate admin database may have its own schema). Do not modify the tournament schema merely to support this project.

At completion, report changed files, tests run and results, unresolved issues, assumptions, manual steps, and deferred optional features. Do not claim production readiness until tested on disposable data with actual deployment service/mount arrangements. If a phase cannot be implemented safely, leave it disabled and explain the blocker rather than weakening safeguards.
