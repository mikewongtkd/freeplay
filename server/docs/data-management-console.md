# Data management console: implemented phase and operation

The console is at `/admin/data/index.php`. This first implementation provides
password protection, an independent asynchronous inspection worker, persistent
operation history/journaling, consistent SQLite snapshots, data-quality reports,
date-range dependency previews and a browser-entered storage probe. It does not
modify tournament records or recording media.

**Archive creation, filtered database extraction, repairs, historical activation,
restoration, source cleanup and Return to Live are not implemented.** The API
rejects those actions and the UI disables them. Mode is `INSPECTION_ONLY`, not
LIVE: no service coordination or runtime health verification has been performed.
Do not treat this phase as completion of `data_management_console.md` or as
production-ready archive/recovery tooling. Existing ingestion/replay behavior is
unchanged.

## Configuration and authentication

Both the PHP console and worker read the existing `src/config.json`; the Docker
path is `/usr/local/freeplay/config.json`. `FREEPLAY_CONFIG` can identify the same
file in another deployment. No form accepts a configuration-file path.

```json
{
  "fpConf": {
    "root": "..",
    "dataDir": "/data",
    "db": "/data/freeplay.sqlite",
    "videoDir": "/data/video",
    "managementDb": "/data/management.sqlite",
    "adminPass": "<output of PHP password_hash>"
  }
}
```

These are additions to the existing configuration, not a replacement for port
and schema settings. `managementDb` is optional and defaults to
`<dataDir>/management.sqlite`. It must be distinct from the tournament database.
The console never creates the data directory or initializes the tournament DB.

Generate a hash with PHP `password_hash($password, PASSWORD_DEFAULT)` on a trusted
machine and put that output in `fpConf.adminPass`; do not put plaintext there.
Login uses `password_verify`. An absent or empty `adminPass` intentionally permits
access without login, as requested. The page displays that state. A malformed
nonempty hash fails closed. Changing a hash invalidates existing authenticated
sessions. Mutations, including job submission/cancellation and logout, require a
session CSRF token. Use HTTPS or an enforcing trusted reverse proxy when sending
passwords over a network. The session cookie is scoped to `/admin/data/`.

Keep the configuration file outside the web root. The API returns paths and
operation results to authorized operators, never the password hash. A PHP session
login delay reduces repeated attempts in one session; this is not a global
rate-limit facility.

## Docker first

The existing PHP/Apache and ingestion deployment can continue running. Add the
worker as an independent container with
`deploy/docker/compose.management.yaml` and `Dockerfile.management`; it does not
share ingestion's process or require a Docker socket, privileged access, network
port or shell endpoint.

1. Use a **disposable data directory and SSD fixture** for commissioning. Finish
   the existing ingestion setup so that the database and media already exist.
2. Make that data directory available at `/data` to the existing PHP service and
   worker. Set the worker UID/GID to the PHP identity that owns the administrative
   database (Docker defaults here are www-data, 33:33). Grant access only to the
   required data directory; do not make the webserver root. Keep the active
   database and video mapping identical to the ingestion configuration.
3. Set `FREEPLAY_DATA_HOST` to that absolute host data directory and
   `FREEPLAY_SSD_HOST` to the actual mounted SSD root. Bind sources must exist;
   `create_host_path: false` prevents Compose from creating missing directories.
   This is not proof that a removable drive is present: validate the host mount
   before launch. The SSD is mounted read-only at `/archives` for this phase.
4. From the repository root, run
   `docker compose -f deploy/docker/compose.management.yaml up --build -d management`.
   The image installs a container-native better-sqlite3 binary, not the host's
   possibly incompatible `src/node_modules` binary. PHP uses the files already
   mounted under `/var/www/html`, including `public/admin/data/`. The administrative
   schema is outside the web root at `deploy/db/management.sql`; bind-mount the host
   `deploy/db` directory read-only at `/opt/freeplay/db` in the PHP container
   (included in `deploy/docker/Makefile`). Existing containers need that mount
   added when recreated. `FREEPLAY_MANAGEMENT_SCHEMA` can override its location.
   The console also honors `fpConf.schemaDir`, relative to the directory containing
   `config.json`. Existing deployments mounting `deploy` at
   `/usr/local/share/freeplay` can use `../share/freeplay/db`; no additional mount
   is required for that layout.
5. Open the console, log in if configured, and check worker availability. Enter
   `/archives` in the SSD form. A host macOS path such as `/Volumes/MySSD` will not
   work inside the container unless mounted there explicitly. The worker probes
   storage; Apache need not have a direct SSD mount during inspection.

The worker does not start/stop Apache or ingestion. Its `restart: "no"` is
intentional: an unclean worker exit leaves an exclusive persistent lock requiring
operator reconciliation. Shutdown with SIGTERM allows the current read-only job
to finish, then releases its lock. Allow enough stop time for large snapshots;
forced termination may require recovery.

Docker storage probes identify exact mount entries from `/proc/self/mountinfo`,
free bytes, device metadata and rsync availability. They never create, mount or
copy into the selected path. A bind mount may still expose an ordinary host
directory if the SSD was removed before launch. Probes therefore report
`verified: false` / `archiveEligible: false` until host volume identity and
historical read-only enforcement are commissioned. UNIX probes also fail closed
for activation eligibility; macOS volume identity is not yet implemented.

## UNIX second

With Node and a compatible `better-sqlite3` installation, PHP with PDO SQLite and
mbstring, and existing storage permissions, run `npm run management` from `src`.
Run it independently of the ingestion process and under the same restricted
identity as the PHP administrative store. `FREEPLAY_CONFIG` can supply an
absolute config path to both PHP and the worker. No systemd, launchd, sudo or
privileged service-control rules are installed by this phase. Native mount
verification, service isolation and activation require subsequent implementation.

## Inspection, dates and dependencies

- Inspect Snapshot displays a live stage message, stage progress bar, elapsed
  time, and file/page counts. The console polls every three seconds and restores
  the most recent inspection on reload. Remaining-time estimates use observed
  throughput within the current stage; they are approximate, not a prediction
  for the whole inspection. SQLite integrity and foreign-key checks have an
  indeterminate bar because they expose no reliable completion percentage.
  Stale updates are identified instead of counting down to a misleading zero.
  Progress is stored in the existing administrative progress column; no schema
  migration is required. Restart a running worker to load the updated code after
  its current inspection has finished, then refresh the browser.
- Inspection first uses the SQLite backup API with a read-only source connection.
  The consistent copy includes committed WAL transactions. It never copies only
  the active main database file or deletes WAL/SHM files.
- Snapshots are retained at
  `<management-db-directory>/management-work/<operation-id>/snapshot.sqlite`.
  This records exact ownership for diagnosis; snapshots may contain sensitive
  competition data. No automatic purge is performed. Snapshot preflight reserves
  the main database plus WAL size, 20% headroom and 64 MiB; archive/media capacity
  preflight is still required before archive implementation. Do not run repeated
  large snapshots during a tournament without
  validating the I/O impact on disposable representative data first.
- Archive Data lists valid `YYYY-MM-DD` subdirectories from the configured video
  root (`/data/video` by default), with a checkbox before each date. Files,
  symlinks and invalid calendar dates are excluded. Refresh dates reloads the
  list while preserving available selections. The recorder uses UTC directory
  dates, so the browser submits a separate UTC day interval for each selected
  checkbox; gaps between selected dates are not included. The button previews
  the selected dates, not an archive creation operation. The API still accepts
  explicit local date ranges for existing clients; timezone-aware calendar
  arithmetic handles 23/25-hour DST days. UTC boundaries appear in results.
- Media selection prefers indexed server-epoch GOP bounds; stream PTS and UTC
  directory names do not establish tournament membership. Selected boundary files
  retain all GOPs and report out-of-range dependencies. Unrelated media is not
  included merely because its session spans the dates. Missing/incomplete bounds
  and unzoned legacy timestamps are reported as ambiguous rather than guessed.
- Foreign-key closure retains selected parents, codec configurations, shared
  cameras, linked reviews and review children. Events may be camera-less. IVR
  tournament IDs are not used as the date selector. Test runs/results are excluded.
  Same-day unrelated events and uncertain IVR associations remain unresolved
  operator decisions; no filtered database is produced by this phase.
- Quality reports cover integrity/foreign keys, invalid ranges, duplicate camera
  identities, incomplete/RAM-only records, unclosed matches/reviews, ring and
  tournament mismatches, missing/unsafe referenced media, size mismatches and GOP
  bounds/overlaps. Media may change after the snapshot while recording continues;
  findings about open files are provisional. Reports cap rendered findings at
  1,000 and disclose truncation. No recursive unreferenced-media scan, ffprobe scan
  or repair is run during live operation.

## Jobs, cancellation and recovery

`management.sqlite` holds mode, operation IDs, queue states, parameters, results,
progress, errors, exact snapshot ownership, step intent/completion and an exclusive
worker lock. It is separate from the competition schema. Database constraints
reject competing queued/running/recovery operations. Only allowlisted read-only
jobs can be submitted. A queued job can be cancelled; a running snapshot is allowed
to finish so its backup handle closes safely.

An unexpected worker crash leaves its ownership lock and any running operation
intact. A second worker refuses to steal the lock, even if its heartbeat is old.
Do not infer LIVE or safe service operation from this state.

For this **inspection-only phase**, recover manually:

1. Verify the recorded worker container/process is stopped and no second worker
   can start. Preserve the administrative DB and its WAL through a consistent
   backup, and preserve any recorded operation-owned snapshot directory.
2. Inspect `operations`, `operation_steps` and `worker_lock` with a trusted SQLite
   tool. This phase never renames live databases, creates media links or deletes
   source media; confirm that this is the version that ran.
3. In a single administrative-store transaction, journal an explicit operator
   reconciliation for the affected operation, mark an interrupted `running` or
   `recovery_required` inspection `failed` with the reason and timestamp, then
   remove the **exact recorded owner** from `worker_lock`. Do not edit the live
   database and do not recursively delete paths. There is deliberately no public
   force-unlock endpoint.
4. Restart one worker and inspect the preserved snapshot/result. If the journal
   indicates any unimplemented operation type or filesystem changes beyond an
   inspection snapshot, stop and investigate rather than apply this procedure.

Automated service/rename recovery, cleanup confirmation and operator recovery UI
remain required before enabling archive/activation/restoration.

## Remaining implementation gates

See `data-management-implementation-plan.md`. Next: independent replay-only
runtime; persistent ingestion/PHP write gates; safe Docker process supervision;
full schema/ambiguity resolution and filtered-copy validation; free-space
preflight; stable host SSD identity; archive manifest/rsync/hash verification;
crash-tested reversible activation/restoration/cleanup; UNIX deployment adapters.
No archive/recovery production-readiness claim is made by the inspection phase.

## Validation for this phase

`node --test src/test/*.test.js`: 50 passed, zero failed, two existing tests skipped
because the development host's better-sqlite3 binary is incompatible with macOS.
Management SQLite tests use an injected Node SQLite adapter against disposable
databases; a container-native better-sqlite3 integration run is still required.
The tests include WAL snapshots, relationship closure and date-selection fixtures,
disk-space rejection, concurrency, path rejection, DST arithmetic, and a temporary
PHP HTTP server for authentication, CSRF, queue conflicts and unsupported actions.
PHP/JavaScript syntax and Compose configuration validation passed. No Docker image
was built or deployed, no actual SSD was used, and no tournament data was accessed.
