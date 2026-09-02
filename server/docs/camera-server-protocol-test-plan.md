# FreePlay Ingestion Test Framework and Frontend Test Report

You are working in the existing **FreePlay instant replay server** project in Visual Studio. Please refer to the documents `docs/server-protocol.md` and `../camera/PROTOCOL.md` for the communication protocol specifications to test.

The current system already includes:

- `freeplay.js` Node.js ingestion server
- FPV1 WebSocket ingest protocol
- SQLite database at `data/freeplay.sqlite`
- PHP API/frontend
- Bootstrap/jQuery/Chart.js UI
- GOP-aware ingest
- RAM replay cache
- fMP4 recording and timeline indexing

The next task is to implement a structured **ingestion validation test framework** before the laptop-based instant replay/review protocol is designed.

The test framework must:

1. exercise and evaluate the existing ingest pipeline;
2. expose appropriate Node/PHP endpoints for test data and results;
3. persist useful test results where appropriate;
4. display a clear frontend **Test Results Report**;
5. keep all test-specific logic separate from core server logic;
6. load the test framework from `freeplay.js` via Node's `require()` mechanism.

Do not merge test logic into the ingestion implementation.

---

## 1. Architectural Requirement

Keep production ingest logic and validation/test logic clearly separated.

Preferred organization:

```text
server/
├── freeplay.js
├── test/
│   ├── test-manager.js
│   ├── protocol-tests.js
│   ├── stream-tests.js
│   ├── timing-tests.js
│   ├── recording-tests.js
│   ├── replay-tests.js
│   ├── resilience-tests.js
│   ├── load-tests.js
│   └── test-utils.js
├── data/
│   ├── freeplay.sqlite
│   └── sql/
│       └── schema.sql
└── public/
    ├── tests.php
    ├── api/
    │   ├── tests.php
    │   ├── test-run.php
    │   ├── test-results.php
    │   └── ...
    ├── js/
    │   └── tests.js
    └── css/
        └── app.css
```

A smaller set of test files is acceptable, but the key requirement is:

> **All test-specific logic must live outside `freeplay.js` and be imported using Node's `require()` functionality.**

Example:

```javascript
const { createTestManager } = require('./test/test-manager');

const testManager = createTestManager({
    db,
    liveStreams,
    replayService,
    recorder,
    protocol,
    config
});
```

Do not create circular dependencies.

---

## 2. Design Principle

The test system should observe and validate the real server as much as possible rather than duplicating server behavior.

Prefer:

```text
production server state
        ↓
test manager
        ↓
measure / validate / record
        ↓
frontend test report
```

over reimplementing server logic inside the test system.

The test framework may invoke existing APIs or inspect exposed internal services through clean interfaces.

Do not modify core production behavior merely to make tests pass.

---

## 3. Test Categories

Implement these categories:

```text
Protocol
Codec / GOP
Timing
Recording
Replay / Cache
Reconnect / Resilience
Backpressure
Endurance
Multi-Camera Synchronization
Load / Capacity
```

Each test should expose:

```text
id
category
name
description
status
severity
startedAt
completedAt
durationMs
observations
metrics
expected
actual
pass/fail criteria
recommendation
```

Suggested statuses:

```text
NOT_RUN
RUNNING
PASS
WARN
FAIL
SKIPPED
```

---

## 4. Test Result Model

Use a JSON-serializable structure similar to:

```javascript
{
    id: "protocol.fpv1-header",
    category: "Protocol",
    name: "FPV1 Header Parsing",
    description: "Verifies the server parses FPV1 headers correctly.",
    status: "PASS",
    startedAt: "...",
    completedAt: "...",
    durationMs: 25,
    expected: {
        headerSize: 32,
        magic: "FPV1",
        endianness: "big"
    },
    actual: {
        headerSize: 32,
        magic: "FPV1",
        parseErrors: 0
    },
    metrics: {
        messagesChecked: 1000,
        malformedRejected: 6
    },
    observations: [
        "All valid messages parsed correctly.",
        "Malformed payload length rejected."
    ],
    recommendation: null
}
```

---

## 5. Persistence

Add SQLite tables if useful.

Suggested:

```sql
CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT NOT NULL,
    config_snapshot_json TEXT,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS test_results (
    id INTEGER PRIMARY KEY,
    test_run_id INTEGER NOT NULL,
    test_id TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    severity TEXT,
    started_at TEXT,
    completed_at TEXT,
    duration_ms INTEGER,
    expected_json TEXT,
    actual_json TEXT,
    metrics_json TEXT,
    observations_json TEXT,
    recommendation TEXT,
    FOREIGN KEY(test_run_id) REFERENCES test_runs(id)
);
```

Create indexes on:

```text
test_run_id
test_id
category
status
```

Do not store large binary video payloads in SQLite.

---

## 6. Manual vs Automatic Tests

Support:

```text
automatic
observational
operator-assisted
long-running
load-test
```

For operator-assisted tests, the frontend should provide instructions and controls such as:

```text
Start Test
Mark Event
Stop Test
Evaluate
```

---

## 7. Test 1 — FPV1 Protocol Framing

Validate the formal 32-byte FPV1 binary header.

Test:

```text
magic = "FPV1"
header size = 32 bytes
PTS parses correctly
sequence parses correctly
flags parse correctly
payloadLength is exact
tabletMonotonicTimestampNs parses correctly
big-endian encoding
```

Also test malformed messages:

```text
wrong magic
short header
payload too short
payload too long
invalid payloadLength
binary message before hello
```

The server must reject malformed data without crashing.

Report:

```text
valid messages checked
invalid messages injected
invalid messages rejected
unexpected accepts
server errors
```

Use the production protocol parser imported into the test module.

Do not create a competing parser.

---

## 8. Test 2 — Codec Configuration

Verify H.264 codec configuration arrives correctly.

Check:

```text
BUFFER_FLAG_CODEC_CONFIG observed
SPS/PPS available
codec config associated with session
codec config precedes playable GOP
codec config version tracked
```

Report:

```text
codec config buffers
first codec config PTS
first keyframe PTS
config-before-keyframe true/false
```

FAIL if recording starts without decoder initialization metadata.

---

## 9. Test 3 — Keyframe / GOP Validation

Observe a live stream for a configurable period, e.g. 30 seconds.

Verify:

```text
keyframe approximately every 1 second
GOP boundaries recognized
GOP durations reasonable
frames/buffers per GOP reasonable
GOP byte sizes reasonable
```

Suggested tolerances:

```text
target GOP interval = 1.0 sec
WARN outside 0.8–1.2 sec
FAIL if sustained intervals exceed 2 sec
```

Make tolerance configurable.

Report:

```text
GOP count
min duration
max duration
average duration
keyframe count
incomplete GOPs
```

---

## 10. Test 4 — Sequence Continuity

Monitor sequence numbers.

Validate:

```text
monotonic sequence modulo 2^32
gap detection
wraparound handling
```

Provide optional synthetic test for:

```text
0xFFFFFFFE
0xFFFFFFFF
0x00000000
```

Live test should report:

```text
messages received
sequence gaps
estimated missing messages
largest gap
```

---

## 11. Test 5 — PTS Accuracy

Monitor `presentationTimeUs`.

At 30 fps, expected frame interval is approximately:

```text
33,333 µs
```

Check:

```text
PTS monotonic
no backward jumps
no unexpected duplicates
reasonable frame spacing
large discontinuities
```

Report:

```text
minimum delta
maximum delta
average delta
median delta
standard deviation if practical
backward jumps
duplicate PTS values
large discontinuities
```

Exclude codec-config buffers where appropriate.

---

## 12. Test 6 — Playable Recording

This is a critical gate.

Verify completed fMP4 files are playable or structurally valid.

At minimum validate:

```text
file exists
file size > 0
ftyp present
moov/init metadata present
moof/mdat fragments present as expected
duration plausible
starts from decodable configuration/keyframe
```

If a lightweight MP4 parser is available, use it.

If browser playback can be automatically exercised, expose a manual frontend playback check.

Report:

```text
files checked
valid files
invalid files
duration mismatches
missing metadata
```

Frontend should provide links/buttons to sample recordings.

---

## 13. Test 7 — File Rotation

Verify approximately 60-second physical file rotation.

Observe:

```text
current file
rotation timestamp
GOP boundary at rotation
file completion flag
next file opens correctly
```

Report:

```text
files rotated
average file duration
shortest file
longest file
rotation errors
```

Allow slightly more than 60 seconds because rotation should happen at a clean GOP boundary.

---

## 14. Test 8 — Random-Access Replay Lookup

Test server-side timeline lookup.

For selected timestamps, query windows such as:

```text
T - 8 seconds
through
T + 4 seconds
```

Verify:

```text
correct camera
correct time overlap
correct GOPs
correct files
decodable start point
coverage of requested range
```

Test several timestamps:

```text
middle of a file
near file boundary
near GOP boundary
near session start
near session end
```

Report:

```text
queries run
queries successful
average lookup latency
max lookup latency
coverage failures
```

---

## 15. Test 9 — RAM Replay Cache

Stream longer than the configured cache duration, default 60 seconds.

Then test recent windows:

```text
last 15 seconds
last 30 seconds
last 45 seconds
```

Verify they resolve from RAM.

Then request data older than RAM and verify fallback to disk/index.

Report:

```text
RAM cache seconds available
RAM cache bytes
recent query latency
disk query latency
source selected
```

FAIL if cache growth is unbounded.

---

## 16. Test 10 — Reconnect Recovery

Operator-assisted test.

Frontend instructions:

```text
1. Start reconnect test.
2. Confirm stream is healthy.
3. Disconnect Ethernet or terminate the tablet connection.
4. Wait several seconds.
5. Restore connection.
6. Allow server to observe reconnection.
```

Validate:

```text
old session closes
new hello accepted
new session created
sequence session resets
request_keyframe sent
new keyframe arrives
recording resumes
discontinuity indexed
server does not crash
```

Report timestamps for:

```text
disconnect detected
hello accepted
first keyframe
recording resumed
```

and calculate recovery duration.

---

## 17. Test 11 — Backpressure

Provide a controlled server-side test hook available only in test mode.

Possible approaches:

```text
temporarily delay ingest processing for a selected test stream
```

or:

```text
artificially throttle a test-only receive path
```

The goal is to verify Android-side bounded queue behavior.

Monitor tablet status fields:

```text
transportQueueBytes
droppedFrames
reconnectCount
measuredFps
```

Verify:

```text
queue does not grow indefinitely
stream becomes degraded
recovery occurs
fresh keyframe follows recovery
```

Test hooks must be disabled unless explicitly enabled.

---

## 18. Test 12 — Single-Camera Endurance

Support presets:

```text
10 minutes
1 hour
8 hours
12 hours
```

Track:

```text
FPS
bitrate
sequence gaps
reconnects
GOP duration
file rotation
RAM cache size
recording errors
DB errors
server memory
server CPU if available
tablet temperature from status
tablet dropped frames
```

Generate summary:

```text
min FPS
max FPS
average FPS
average bitrate
total bytes
total gaps
total reconnects
files written
recording failures
```

Long-running test state must survive frontend refresh.

---

## 19. Test 13 — Three-Camera Ring Synchronization

This is a critical pre-replay test.

Allow selecting a ring with three active cameras.

Provide operator-assisted instructions:

```text
Place a visible event in view of all three cameras:
- LED flash
- clapboard
- phone screen change
- other instantaneous visual marker

Press "Mark Sync Event" at approximately the event time.
```

Allow the operator to inspect nearby video from:

```text
CAM 1
CAM 2
CAM 3
```

and enter or adjust observed frame/timestamp positions for the event.

Calculate offsets.

Report:

```text
cam1 offset
cam2 offset
cam3 offset
maximum pairwise offset
```

At 30 fps:

```text
1 frame ≈ 33.33 ms
2 frames ≈ 66.67 ms
3 frames ≈ 100 ms
```

Suggested evaluation:

```text
PASS: <= 33 ms
WARN: >33 ms and <=100 ms
FAIL: >100 ms
```

Make thresholds configurable.

Do not use raw Android monotonic timestamps as if device clocks were synchronized.

Use the server-authoritative timeline.

---

## 20. Clock Mapping / Timing Diagnostics

Display:

```text
tablet PTS
tablet monotonic timestamp
server receive monotonic timestamp
server receive wall-clock
```

Do not claim tablet clocks are synchronized.

If clock-offset estimation exists, show:

```text
estimated offset
estimated RTT
estimated drift
```

If it does not exist, report:

```text
NOT IMPLEMENTED
```

rather than inventing values.

---

## 21. Test 14 — Full Load / Capacity

Provide a separate load-test module.

Prefer a simulator that creates valid logical FPV1 clients.

Target:

```text
42 concurrent streams
30 fps nominal
6 Mb/s nominal per stream
1-second keyframes
```

If valid encoded H.264 sample data is available, loop/sample it.

Measure:

```text
active streams
aggregate bytes/sec
aggregate bitrate
Node CPU
Node RSS memory
event loop lag
SQLite write latency
disk throughput
RAM replay cache bytes
open file count
protocol errors
dropped connections
```

Do not start a 42-stream test automatically.

Require explicit operator action.

---

## 22. Test Gates

Create summarized gates:

```text
GATE A — Protocol
GATE B — Recording
GATE C — Replay Index
GATE D — Resilience
GATE E — Multi-Camera Sync
GATE F — Capacity
```

Example:

```text
GATE A: PASS
  FPV1 parsing             PASS
  codec config             PASS
  sequence continuity      PASS
  PTS monotonic            PASS

GATE B: WARN
  playable fMP4            PASS
  60-sec rotation          WARN

GATE E: FAIL
  3-camera alignment       146 ms
```

Top-level recommendation:

```text
READY FOR LAPTOP REPLAY PROTOCOL DESIGN
```

or:

```text
NOT READY — resolve synchronization failures first
```

---

## 23. Readiness Criteria

Recommend READY only if at minimum:

```text
FPV1 protocol       PASS
codec config        PASS
GOP/keyframes       PASS
PTS continuity      PASS
playable recording  PASS
random access       PASS
RAM cache           PASS
reconnect           PASS
3-camera sync       PASS or explicitly accepted WARN
```

Capacity/load can remain WARN during early development only if acknowledged.

Do not hide failures.

---

## 24. Node Test Manager

Implement a central manager such as:

```javascript
class TestManager {
    listTests()
    listRuns()
    getRun(runId)
    startTest(testId, options)
    stopTest(testId)
    evaluateTest(testId)
    startSuite(suiteId, options)
    getStatus()
}
```

Receive production dependencies through dependency injection:

```javascript
createTestManager({
    db,
    liveStreams,
    protocolParser,
    recorder,
    replayCache,
    replayService,
    config
})
```

Do not have test modules `require('./freeplay.js')`.

---

## 25. Node Test HTTP Endpoints

Expose test endpoints such as:

```text
GET  /api/tests
GET  /api/tests/runs
GET  /api/tests/runs/:id
POST /api/tests/run
POST /api/tests/stop
POST /api/tests/action
GET  /api/tests/live
```

Example run request:

```json
{
  "testId": "stream.gop-interval",
  "streamId": "ring6_cam2",
  "durationSeconds": 30
}
```

Example operator action:

```json
{
  "testId": "sync.three-camera",
  "action": "mark_event",
  "ring": 6
}
```

Validate all inputs.

---

## 26. PHP API Integration

The frontend uses PHP.

Add PHP endpoints that:

```text
query SQLite for historical results
```

and/or:

```text
proxy Node's local test API for active/live test state
```

Suggested:

```text
GET  /api/tests.php
POST /api/test-run.php
GET  /api/test-results.php
```

Do not duplicate test logic in PHP.

---

## 27. Frontend Test Report

Create:

```text
public/tests.php
public/js/tests.js
```

Use Bootstrap.

The page should include:

```text
overall readiness
test gates
active test
test categories
test result table
metric details
observations
recommendations
historical test runs
```

---

## 28. Recommended Frontend Layout

Top:

```text
FREEPLAY INGESTION TEST REPORT

Overall Status:
READY / NOT READY / TESTING

Last Full Test Run:
timestamp

Active Streams:
37 / 42
```

Gate cards:

```text
Protocol       PASS
Recording      PASS
Replay         PASS
Resilience     WARN
Sync           FAIL
Capacity       NOT RUN
```

Test table:

```text
Test                     Status    Last Run     Summary
FPV1 Header              PASS      10:24:31     10,000 frames checked
Codec Config             PASS      10:24:31     SPS/PPS available
GOP Interval             PASS      10:25:02     avg 1.003 s
PTS Continuity           PASS      10:25:02     0 backward jumps
Playable fMP4            PASS      10:26:11     5/5 files valid
RAM Replay Cache         PASS      10:28:14     59.8 sec
Reconnect                PASS      10:31:42     recovery 2.2 sec
3-Camera Sync            WARN      10:42:18     max offset 67 ms
42-Stream Load           NOT RUN   —            —
```

Clicking a test should show details.

---

## 29. Test Detail Panel

Show:

```text
description
scope
expected result
actual result
metrics
observations
recommendation
raw diagnostic JSON toggle
```

Do not dump huge JSON by default.

---

## 30. Historical Test Runs

Allow browsing prior runs.

Show:

```text
run ID
start time
duration
overall status
pass count
warn count
fail count
notes
```

Do not delete prior results automatically.

---

## 31. Test Suite Presets

Support:

```text
Quick Validation
Single Camera
Ring Validation
Resilience
Full Pre-Replay Validation
Capacity
```

### Quick Validation

```text
protocol framing
codec config
keyframes/GOP
sequence
PTS
```

### Single Camera

```text
Quick Validation
recording
rotation
random access
RAM cache
```

### Ring Validation

```text
three selected cameras
single-camera checks
sync test
```

### Full Pre-Replay Validation

```text
all required readiness gates
```

---

## 32. Test Mode Safety

Fault-injection hooks must be disabled by default.

Enable only when:

```text
FREEPLAY_TEST_MODE=1
```

or equivalent.

Frontend should visibly show:

```text
TEST MODE ENABLED
```

when destructive/fault-injection hooks are available.

---

## 33. Protocol Fault Injection

When test mode is enabled, allow synthetic tests:

```text
invalid magic
short frame
incorrect payload length
sequence gap
sequence wrap
unexpected binary before hello
unsupported hello version
```

Exercise the same production validation functions.

Do not mutate real live stream data.

---

## 34. Stream Observation Hooks

Expose non-invasive events from production code where useful:

```javascript
events.emit('stream:hello', ...)
events.emit('stream:binary', metadata)
events.emit('stream:keyframe', ...)
events.emit('stream:gop-finalized', ...)
events.emit('stream:disconnect', ...)
events.emit('recording:file-open', ...)
events.emit('recording:file-close', ...)
```

The test manager can subscribe.

The production server must not depend on the test manager.

---

## 35. Efficient Metrics

Do not store every frame result.

Use counters, aggregates, and bounded samples.

Examples:

```text
PTS delta samples
GOP duration stats
sequence gap count
file rotation stats
lookup latency stats
```

Avoid unbounded arrays during endurance tests.

---

## 36. Server Resource Metrics

Capture where practical:

```javascript
process.memoryUsage()
process.uptime()
```

Also expose:

```text
event loop lag
disk free space
database health
active WebSockets
CPU if reliably available
```

Do not fabricate metrics.

---

## 37. Disk Validation

Report:

```text
database path
video directory
free disk space
recording files created
current disk write state
```

Flag:

```text
disk nearly full
writer failure
file rotation failure
SQLite error
```

---

## 38. Long-Running State

Long-running tests must survive browser refresh.

Authoritative state belongs in Node/test manager and persisted DB where appropriate.

Browser JavaScript must not own test execution.

---

## 39. Cancellation

Allow stopping:

```text
endurance tests
load tests
operator-assisted tests
```

Stopping should produce `SKIPPED` or `WARN` with reason:

```text
cancelled_by_operator
```

Do not leave tests stuck in `RUNNING`.

---

## 40. Test Concurrency

Prevent conflicting tests where appropriate.

Example:

```text
do not run artificial backpressure against a stream during recording integrity validation
```

Support resource locks such as:

```text
stream:ring6_cam2
ring:ring6
server:load
server:fault-injection
```

Return useful conflict errors.

---

## 41. Operator Notes

Allow notes per test run.

Example:

```text
Ring 4 cable intentionally unplugged at 10:31:12.
```

Persist notes.

---

## 42. Export

Provide export as JSON.

Optional CSV summary is acceptable.

Export should include:

```text
server version
protocol version
test run timestamp
configuration snapshot
results
metrics
overall readiness
```

PDF is not required.

---

## 43. Configuration Snapshot

At test-run start, capture:

```text
FPV1 protocol version
server version
max rings
camera count
RAM replay duration
file rotation duration
video directory
database path
baseline bitrate
baseline FPS
```

Persist it.

---

## 44. Acceptance Threshold Configuration

Place thresholds in one config object.

Example:

```javascript
{
    gopTargetMs: 1000,
    gopWarnMinMs: 800,
    gopWarnMaxMs: 1200,
    gopFailMaxMs: 2000,

    syncPassMs: 33.5,
    syncWarnMs: 100,

    replayLookupWarnMs: 250,
    replayLookupFailMs: 1000,

    reconnectWarnMs: 5000,
    reconnectFailMs: 15000
}
```

Do not scatter thresholds across files.

---

## 45. Readiness Summary Logic

Implement deterministic readiness logic.

Example:

```javascript
function calculateReadiness(results) {
    // FAIL if any required gate fails
    // WARN if no required failures but warnings exist
    // READY if all required tests pass
}
```

Frontend must explain blockers:

```text
NOT READY

Blocking:
- Three-Camera Sync: 142 ms maximum offset
- Random Access Replay: failed near file boundary
```

---

## 46. Logging

Use tags such as:

```text
FreePlay/Test
FreePlay/Test/Protocol
FreePlay/Test/Recording
FreePlay/Test/Replay
FreePlay/Test/Sync
FreePlay/Test/Load
```

Log:

```text
test started
test completed
test failed
test cancelled
suite started
suite completed
operator action
```

Do not log every frame.

---

## 47. Unit Tests for the Test Framework

Add tests for:

```text
result status calculation
threshold logic
readiness logic
sequence wrap
PTS aggregate calculation
GOP statistics
test run persistence
conflict/resource locking
```

---

## 48. No Laptop Replay Protocol Yet

Do not design the laptop communication protocol in this task.

Do not add:

```text
new laptop WebSocket protocol
new playback transport protocol
new replay-client application
```

except minimal browser replay validation already available in the server frontend.

---

## 49. Deliverables

At minimum create/update:

```text
test/test-manager.js
test/protocol-tests.js
test/stream-tests.js
test/timing-tests.js
test/recording-tests.js
test/replay-tests.js
test/resilience-tests.js
test/load-tests.js
test/test-utils.js

freeplay.js
data/sql/schema.sql

public/tests.php
public/api/tests.php
public/api/test-run.php
public/api/test-results.php
public/js/tests.js
public/css/app.css

README.md
```

A consolidated test module structure is acceptable if cleaner.

---

## 50. `freeplay.js` Integration

`freeplay.js` should perform only minimal integration.

Example:

```javascript
const { createTestManager } = require('./test/test-manager');

const testManager = createTestManager({
    db,
    liveStreams,
    services: {
        protocol,
        recorder,
        replayCache,
        replayService
    },
    config
});
```

Then route test API requests to the manager.

Do not place test implementations directly in `freeplay.js`.

---

## 51. Recommended Implementation Order

1. test result model;
2. test run persistence;
3. test manager;
4. production event observation hooks;
5. FPV1 parser tests;
6. live protocol observation;
7. sequence test;
8. PTS test;
9. codec-config test;
10. GOP test;
11. recording/file rotation tests;
12. replay lookup test;
13. RAM cache test;
14. frontend report;
15. reconnect test;
16. synchronization workflow;
17. endurance test;
18. load test;
19. readiness gates;
20. export.

---

## 52. Final Quality Goal

The frontend should ultimately be able to display something like:

```text
FREEPLAY INGESTION VALIDATION

Overall Readiness:
READY FOR REPLAY CLIENT DESIGN

Protocol                    PASS
Codec / GOP                 PASS
Timing                      PASS
Recording                   PASS
Replay Cache                PASS
Reconnect                   PASS
Three-Camera Sync           PASS
Capacity                    WARN

Selected Ring:
Ring 6

CAM 1                       Healthy
CAM 2                       Healthy
CAM 3                       Healthy

Max Camera Offset           31 ms
Average GOP Duration        1.002 s
Sequence Gaps               0
Replay Lookup               18 ms
RAM Replay Available        59.7 s
Reconnect Recovery          2.1 s
```

The central objective is:

> Build a cleanly separated, observable, repeatable validation framework that proves the FreePlay ingestion server correctly handles FPV1 video, timing, GOP construction, recording, replay lookup, RAM caching, reconnection, synchronization, endurance, and full-load behavior before the server-to-laptop instant replay protocol is designed.

The test framework must be a consumer of production server behavior, not a replacement for it, and all test-specific Node.js logic must remain in separate modules imported from `freeplay.js` with `require()`.
