# FreePlay IVR Prototype

This directory contains a working PHP 8 / Bootstrap 5 / jQuery prototype of the FreePlay Instant Video Replay operator interface. It validates workflow, information architecture, state transitions, keyboard interaction, and MCV/SCV behavior. SCV can now play retained H.264/fMP4 from the ingestion service in Chrome; the remaining workflow and match context are still prototype data. It does not adjudicate Taekwondo rules.

## Run

From the repository's `public` directory:

```bash
php -S localhost:8080
```

Open one of:

```text
http://localhost:8080/review.php?ring=1
http://localhost:8080/review/?ring=1
```

All browser dependencies are stored in `public/vendor`; internet access is not required.

The browser defaults to the replay service at `http(s)://SERVER_IP:9000/api/ivr/v1`. Set `replayApiBase` in `config/prototype.php` when a reverse proxy publishes it elsewhere. Start cameras and wait for codec configurations plus completed GOPs. In SCV and MCV, **Go Live** starts near each camera's newest completed GOP, polls for subsequent GOPs, appends them to bounded MSE buffers, and evicts media older than 30 seconds. MCV loads available cameras independently and corrects inter-camera playback drift without stopping healthy views. A descriptive per-camera overlay is shown if a range is not retained or Chrome rejects a codec.

## Architecture

- `review.php` is the dashboard-compatible entry point.
- `index.php` composes modular PHP views and shared includes.
- `config/prototype.php` contains prototype constants.
- `includes/mock-data.php` supplies match, camera, timeline, PSSEL, and scenario fixtures.
- `api/*.php` exposes consistent JSON mock endpoints. Review actions use a PHP session to simulate server-authoritative timestamps and persistence.
- `assets/js/state.js` owns the client session state and event notifications.
- Controller modules expose semantic actions independent of buttons and keyboard input.
- `timeline-controller.js` renders the shared three-camera timeline, review windows, RM, RST, AUR, cursor, live edge, gaps, and PSSEL events.
- CSS is split among application, timeline, and responsive concerns.

## Implemented workflow and use cases

The prototype review workflow distinguishes displayed, selected, and active reviews. Multiple Chung/Hong requests may remain pending concurrently, only one may be selected or active for a ring, and pending selection is locked until the active result is recorded. Review Window bounds are supplied by prototype ruleset configuration rather than calculated by the browser. Completing a formal review restores the live timeline and releases the pending queue.

- Three synchronized live camera players in a 2×2 MCV; request/review controls occupy the fourth quadrant and unavailable cameras degrade independently.
- SCV camera switching without changing the common playback cursor or review state.
- Chung Review Request and Hong Review Request with five-second coach Review Windows.
- Separate Request Mark and Start Review actions.
- RST-driven advisory response clock: blue 0–10 s, green 10–20 s, yellow 20–30 s, red after 30 s.
- Mutually exclusive disposition controls: Resolved without Review before Start Review; Accepted, Rejected, and Rejected: IVR Issue during formal review.
- AUR marking with a visible warning—but no prohibition—outside a coach window.
- Shared seek, frame-step, reverse 0.5×, forward 0.5×/1×/2×/5×, window/AUR jumps, and Go Live controls.
- SCV fit, zoom, focal-point click, camera navigation, and fullscreen controls.
- Previous/next pending-review navigation, locked while a formal review is active, with immutable finalized timestamps and results in the normal UI.
- Post-review IVR Sheet annotation after the timed decision.
- Camera unavailable/gap visualization without blocking healthy angles.
- Filtered advisory PSSEL event markers that seek the shared cursor.
- Keyboard commands calling the same semantic controllers as UI buttons.
- Scenario A: Normal Coach Review.
- Scenario B: Resolved Without Review.
- Scenario C: AUR Outside Review Window.
- Scenario D: One Camera Gap.
- Scenario E: Rejected: IVR Issue.
- Scenario F: Referee-Origin Review with a configured ten-second window.
- Scenario G: Second Review with independent RST/result and linkage.
- Scenario H: Two-Action Request with one window/AUR/clock and two issue records.
- Scenario I: PSSEL Navigation.
- Scenario J: Concurrent overlapping Chung and Hong requests.

Open **Settings** (gear icon) to load scenarios. Scenario loading resets the prototype session, performs the named interaction sequence, and leaves the resulting state visible for inspection.

## Keyboard map

| Key | Action |
|---|---|
| Space | Play/pause |
| Left / Right | Previous/next frame |
| Shift+Left | Seek back 1 second |
| Ctrl/Command+Left | Seek back 5 seconds |
| 1 / 2 / 3 | Show Camera 1 / 2 / 3 |
| M | Multi Camera View |
| C / H | Chung / Hong Review Request |
| S | Start selected review |
| A | Mark AUR |
| W / R | Jump to Review Window start / AUR |
| L | Go Live |

## Intentionally mocked or non-production

- CSS-rendered camera placeholders remain as fallback imagery when real H.264/fMP4 media has not loaded.
- Reverse playback remains a logical simulation; positive-rate SCV playback, seeking, and frame stepping use the HTML media element when retained media is loaded.
- Match, camera, sync, gaps, and PSSEL events are fixtures.
- PHP session storage is per-browser and is not an authoritative audit database.
- Server timestamps use PHP wall-clock time but do not create ingestion-server IVR records.
- Appeal quota is displayed in fixture data but is not mutated automatically.
- Rule eligibility and adjudication are never automated.
- Authentication, authorization, TLS, CSRF protection, retention, and production concurrency are deferred.
- Reverse playback is simulated as a negative cursor rate.
- Historical adjacent-range prefetch and automatic decoder recovery are not yet implemented. SCV Go Live performs forward GOP polling and bounded buffer eviction.

## Future server integration TODOs

1. Replace `mock-server.js` with a versioned IVR API client.
2. Extend the single-camera production replay slice to coordinated three-camera manifests and MCV playback.
3. Support automatic adjacent range retrieval and buffer eviction; gap metadata is already included in the manifest.
4. Make RM, RST, AUR, results, annotations, linkage, camera integrity, and reviewed media ranges server-authoritative and durable.
5. Add a filtered PSSEL ingestion/query service tied to match and server timeline.
6. Measure startup, seek, and camera-switch latency against production media.
7. Add browser-refresh recovery, multi-client concurrency, authentication/authorization, and future TLS.
8. Add automated controller tests and production replay integration tests.

See `docs/server-ivr-protocol-updates.md` for the remaining ingestion-server API work.
