# FreePlay IVR Prototype

This directory contains a working PHP 8 / Bootstrap 5 / jQuery prototype of the FreePlay Instant Video Replay operator interface. It validates workflow, information architecture, state transitions, keyboard interaction, and MCV/SCV behavior. It does not play production replay media or adjudicate Taekwondo rules.

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

- Exactly three synchronized camera placeholders in a 2×2 MCV; request/review controls occupy the fourth quadrant.
- SCV camera switching without changing the common playback cursor or review state.
- Chung Review Request and Hong Review Request with five-second coach Review Windows.
- Separate Request Mark and Start Review actions.
- RST-driven advisory response clock: blue 0–10 s, green 10–20 s, yellow 20–30 s, red after 30 s.
- Mutually exclusive disposition controls: Resolved without Review before Start Review; Accepted, Rejected, and Rejected: IVR Issue during formal review.
- AUR marking with a visible warning—but no prohibition—outside a coach window.
- Shared seek, frame-step, reverse 0.5×, forward 0.5×/1×/2×/5×, window/AUR jumps, and Go Live controls.
- SCV fit, zoom, focal-point click, camera navigation, and fullscreen controls.
- Previous/next review navigation with immutable finalized timestamps and results in the normal UI.
- Post-review IVR Sheet annotation after the timed decision.
- Camera unavailable/gap visualization without blocking healthy angles.
- Filtered advisory PSSEL event markers that seek the shared cursor.
- Keyboard commands calling the same semantic controllers as UI buttons.
- Scenario A: Normal Coach Review.
- Scenario B: Resolved Without Review.
- Scenario C: AUR Outside Review Window.
- Scenario D: One Camera Gap.
- Scenario E: Rejected: IVR Issue.
- Scenario F: Referee Last-Five-Seconds Review.
- Scenario G: Second Review with independent RST/result and linkage.
- Scenario H: Two-Action Request with one window/AUR/clock and two issue records.
- Scenario I: PSSEL Navigation.

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

- Camera imagery is a CSS-rendered placeholder; no real H.264/fMP4 decoding occurs.
- The common cursor and playback rates are logical simulations.
- Match, camera, sync, gaps, and PSSEL events are fixtures.
- PHP session storage is per-browser and is not an authoritative audit database.
- Server timestamps use PHP wall-clock time but do not create ingestion-server IVR records.
- Appeal quota is displayed in fixture data but is not mutated automatically.
- Rule eligibility and adjudication are never automated.
- Authentication, authorization, TLS, CSRF protection, retention, and production concurrency are deferred.
- Reverse playback is simulated as a negative cursor rate.
- Media buffering, adjacent range retrieval, decoder state, and failure recovery are not implemented.

## Future server integration TODOs

1. Replace `mock-server.js` with a versioned IVR API client.
2. Deliver browser-consumable fMP4 initialization/media fragments without exposing file paths or SQLite rows.
3. Support adjacent range retrieval and clear per-camera availability/gap metadata.
4. Make RM, RST, AUR, results, annotations, linkage, camera integrity, and reviewed media ranges server-authoritative and durable.
5. Add a filtered PSSEL ingestion/query service tied to match and server timeline.
6. Measure startup, seek, and camera-switch latency against production media.
7. Add browser-refresh recovery, multi-client concurrency, authentication/authorization, and future TLS.
8. Add automated controller tests and production replay integration tests.

See `docs/server-ivr-protocol-updates.md` for the proposed ingestion-server API work. No files under `src/` were changed for this prototype.
