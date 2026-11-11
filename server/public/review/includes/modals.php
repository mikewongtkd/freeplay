<div class="modal fade" id="requestModal" tabindex="-1" aria-labelledby="requestModalTitle" aria-hidden="true">
  <div class="modal-dialog"><form id="requestForm" class="modal-content">
    <div class="modal-header"><h2 id="requestModalTitle" class="modal-title fs-5">Review request</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cancel request"></button></div>
    <div class="modal-body">
      <p id="requestModalContext" class="small text-secondary"></p>
      <label class="form-label" for="requestOrigin">Origin</label>
      <select id="requestOrigin" name="origin" class="form-select mb-3" required><option value="coach">Coach</option><option value="referee">Referee</option></select>
      <label class="form-label" for="requestIssueType">Issue type</label>
      <select id="requestIssueType" name="issueType" class="form-select mb-3" required><option value="standard">Standard</option><option value="technical">Technical</option></select>
      <label class="form-label" for="requestReason">Reason</label>
      <select id="requestReason" name="reason" class="form-select" required><option>Reason pending</option></select>
      <div id="requestReasonOtherGroup" class="mt-3 d-none">
        <label class="form-label" for="requestReasonOther">Other reason details</label>
        <input id="requestReasonOther" name="reasonOther" class="form-control" disabled>
      </div>
      <div id="requestGamJeomGroup" class="mt-3 d-none">
        <label class="form-label" for="requestGamJeomReason">Opponent's <em>gam-jeom</em></label>
        <select id="requestGamJeomReason" name="gamJeomReason" class="form-select" disabled></select>
      </div>
    </div>
    <div class="modal-footer"><span class="small text-secondary me-auto"><kbd>Esc</kbd> cancel · <kbd>Enter</kbd> save</span><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">Create request</button></div>
  </form></div>
</div>

<div class="modal fade" id="legendModal" tabindex="-1" aria-labelledby="legendTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
    <div class="modal-header"><h2 class="modal-title fs-5" id="legendTitle">Timeline legend</h2><button class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
    <div class="modal-body legend-list">
      <p><strong>Chung RM</strong> — dark blue request marker.</p>
      <p><strong>Hong RM</strong> — dark red request marker.</p>
      <p><span class="legend-swatch"></span><strong>Official request</strong> — operational context; not a coach quota event.</p>
      <p><span class="legend-swatch aur"></span><strong>AUR</strong> — Action Under Review at the common cursor.</p>
      <p><span class="legend-swatch cursor"></span><strong>Playback Cursor</strong> — current logical time for every camera.</p>
      <p><span class="legend-swatch live"></span><strong>Live Edge</strong> — newest available server time.</p>
      <p class="mb-0"><strong>PSSEL markers</strong> are navigation context only and do not adjudicate a request.</p>
    </div>
  </div></div>
</div>

<div class="modal fade" id="shortcutsModal" tabindex="-1" aria-labelledby="shortcutsTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
    <div class="modal-header"><h2 class="modal-title fs-5" id="shortcutsTitle">Keyboard shortcuts</h2><button class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
    <div class="modal-body"><div class="shortcut-grid">
      <kbd>Space</kbd><span>Play / pause</span><kbd>← / →</kbd><span>Previous / next frame</span>
      <kbd>Shift+←</kbd><span>Seek −1 second</span><kbd>Ctrl+←</kbd><span>Seek −5 seconds</span>
      <kbd>1 / 2 / 3</kbd><span>Show camera</span><kbd>M</kbd><span>Multi Camera View</span>
      <kbd>C / H</kbd><span>Chung / Hong request</span><kbd>S</kbd><span>Start selected review</span>
      <kbd>A</kbd><span>Mark AUR</span><kbd>L</kbd><span>Go Live</span>
      <kbd>B</kbd><span>Return to AUR</span>
      <kbd>Alt+Arrows</kbd><span>Pan in SCV</span><kbd>+ / −</kbd><span>Zoom in / out in SCV</span>
    </div></div>
  </div></div>
</div>

<div class="modal fade" id="matchModal" tabindex="-1" aria-labelledby="matchModalTitle" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-scrollable"><form id="matchForm" class="modal-content">
    <div class="modal-header">
      <h2 class="modal-title fs-5" id="matchModalTitle">Match information</h2>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cancel match changes"></button>
    </div>
    <div class="modal-body">
      <input id="matchId" name="matchId" type="hidden">
      <input id="matchStart" name="start" type="hidden">
      <div class="row g-3">
        <div class="col-md-3"><label class="form-label" for="matchNumber">Match number</label><input id="matchNumber" name="matchNumber" class="form-control" required></div>
        <div class="col-md-3"><label class="form-label" for="matchRing">Ring</label><input id="matchRing" name="ring" class="form-control" type="number" min="1" max="14" required></div>
        <div class="col-md-3"><label class="form-label" for="matchRound">Round</label><input id="matchRound" name="round" class="form-control" type="number" min="1" required></div>
        <div class="col-md-3"><label class="form-label" for="matchStage">Stage</label><input id="matchStage" name="stage" class="form-control" placeholder="Quarterfinal"></div>
        <div class="col-12"><label class="form-label" for="matchDivision">Division</label><input id="matchDivision" name="division" class="form-control" placeholder="Senior Black Belt · Men -68 kg"></div>
        <div class="col-12"><h3 class="fs-6 text-secondary mb-0">IVR Officials</h3></div>
        <div class="col-md-6"><label class="form-label" for="matchReferee">Referee</label><input id="matchReferee" name="referee" class="form-control"></div>
        <div class="col-md-6"><label class="form-label" for="matchReviewJury">Review Jury</label><input id="matchReviewJury" name="reviewJury" class="form-control"></div>
        <div class="col-12"><h3 class="fs-6 text-primary mb-0">Chung</h3></div>
        <div class="col-md-5"><label class="form-label" for="matchChungName">Competitor name</label><input id="matchChungName" name="chungName" class="form-control" required></div>
        <div class="col-md-5"><label class="form-label" for="matchChungTeam">Team</label><input id="matchChungTeam" name="chungTeam" class="form-control"></div>
        <div class="col-md-2"><label class="form-label" for="matchChungQuota">Quota</label><input id="matchChungQuota" name="chungQuota" class="form-control" type="number" min="0" value="1"></div>
        <div class="col-12"><h3 class="fs-6 text-danger mb-0">Hong</h3></div>
        <div class="col-md-5"><label class="form-label" for="matchHongName">Competitor name</label><input id="matchHongName" name="hongName" class="form-control" required></div>
        <div class="col-md-5"><label class="form-label" for="matchHongTeam">Team</label><input id="matchHongTeam" name="hongTeam" class="form-control"></div>
        <div class="col-md-2"><label class="form-label" for="matchHongQuota">Quota</label><input id="matchHongQuota" name="hongQuota" class="form-control" type="number" min="0" value="1"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button id="matchReset" type="button" class="btn btn-outline-danger me-auto">Reset</button>
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Save</button>
    </div>
  </form></div>
</div>

<div class="modal fade" id="cameraConfigModal" tabindex="-1" aria-labelledby="cameraConfigTitle" aria-hidden="true">
  <div class="modal-dialog modal-xl modal-dialog-scrollable"><form id="cameraConfigForm" class="modal-content">
    <div class="modal-header">
      <h2 class="modal-title fs-5" id="cameraConfigTitle">Camera configuration</h2>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cancel camera configuration changes"></button>
    </div>
    <div class="modal-body">
      <input id="cameraConfigRing" name="ring" type="hidden">
      <div class="row g-3 fw-semibold small text-secondary d-none d-md-flex mb-1">
        <div class="col-md-1">Camera</div><div class="col-md-3">Stream ID</div><div class="col-md-3">Display name</div><div class="col-md-1">Offset (ms)</div><div class="col-md-2">Status</div><div class="col-md-2">Actions</div>
      </div>
      <?php for ($cameraNumber = 1; $cameraNumber <= 3; $cameraNumber++): ?>
      <fieldset class="row g-3 align-items-end border-top py-3 mb-0">
        <legend class="visually-hidden">Camera <?= $cameraNumber ?></legend>
        <div class="col-md-1"><label class="form-label d-md-none" for="cameraConfigNumber<?= $cameraNumber ?>">Camera</label><input id="cameraConfigNumber<?= $cameraNumber ?>" name="camera<?= $cameraNumber ?>Number" class="form-control" type="number" value="<?= $cameraNumber ?>" readonly></div>
        <div class="col-md-3"><label class="form-label d-md-none" for="cameraConfigStream<?= $cameraNumber ?>">Stream ID</label><input id="cameraConfigStream<?= $cameraNumber ?>" name="camera<?= $cameraNumber ?>StreamId" class="form-control" readonly></div>
        <div class="col-md-3"><label class="form-label d-md-none" for="cameraConfigName<?= $cameraNumber ?>">Display name</label><input id="cameraConfigName<?= $cameraNumber ?>" name="camera<?= $cameraNumber ?>Name" class="form-control" required></div>
        <div class="col-md-1"><label class="form-label d-md-none" for="cameraConfigOffset<?= $cameraNumber ?>">Sync offset (ms)</label><input id="cameraConfigOffset<?= $cameraNumber ?>" name="camera<?= $cameraNumber ?>SyncOffsetMs" class="form-control" type="number" step="1" required></div>
        <div class="col-md-2"><span id="cameraConfigStatus<?= $cameraNumber ?>" class="badge text-bg-secondary">Unavailable</span></div>
        <div class="col-md-2 dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false">Actions</button>
          <ul id="cameraConfigActions<?= $cameraNumber ?>" class="dropdown-menu"></ul>
        </div>
      </fieldset>
      <?php endfor; ?>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Save</button>
    </div>
  </form></div>
</div>

<div class="modal fade" id="annotationModal" tabindex="-1" aria-labelledby="annotationTitle" aria-hidden="true">
  <div class="modal-dialog modal-lg modal-dialog-scrollable"><form id="annotationForm" class="modal-content">
    <div class="modal-header"><div><h2 class="modal-title fs-5" id="annotationTitle">IVR Sheet annotation</h2><div class="small text-secondary">Post-review details are not part of the response clock.</div></div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
    <div class="modal-body">
      <div class="row g-3">
        <div class="col-md-4"><label class="form-label" for="annotationMatch">Match number</label><input id="annotationMatch" name="matchNumber" class="form-control"></div>
        <div class="col-md-4"><label class="form-label" for="annotationRound">Round</label><input id="annotationRound" name="round" class="form-control" type="number" min="1"></div>
        <div class="col-md-4"><label class="form-label" for="annotationActionTime">Action time</label><input id="annotationActionTime" name="actionTime" class="form-control" readonly></div>
        <div class="col-md-6"><label class="form-label" for="annotationIdentity">Request identity / origin</label><input id="annotationIdentity" name="identity" class="form-control" readonly></div>
        <div class="col-md-6"><label class="form-label" for="annotationJury">Review Jury</label><input id="annotationJury" name="reviewJury" class="form-control"></div>
        <div class="col-12"><label class="form-label" for="annotationReason">Request reason</label><select id="annotationReason" name="reason" class="form-select" required></select></div>
        <div id="annotationReasonOtherGroup" class="col-12 d-none">
          <label class="form-label" for="annotationReasonOther">Other reason details</label>
          <input id="annotationReasonOther" name="reasonOther" class="form-control" disabled>
        </div>
        <div id="annotationGamJeomGroup" class="col-12 d-none">
          <label class="form-label" for="annotationGamJeomReason">Opponent's <em>gam-jeom</em></label>
          <select id="annotationGamJeomReason" name="gamJeomReason" class="form-select" disabled></select>
        </div>
        <div class="col-md-6"><label class="form-label" for="annotationResult">Result</label><input id="annotationResult" name="result" class="form-control" readonly></div>
        <div class="col-12"><label class="form-label" for="annotationExplanation">Explanation</label><textarea id="annotationExplanation" name="explanation" class="form-control" rows="3"></textarea></div>
        <div class="col-12"><label class="form-label" for="annotationNotes">Notes</label><textarea id="annotationNotes" name="notes" class="form-control" rows="2"></textarea></div>
      </div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button><button class="btn btn-primary" type="submit">Save annotation</button></div>
  </form></div>
</div>

<div class="modal fade" id="replaceAurModal" tabindex="-1" aria-labelledby="replaceAurTitle" aria-describedby="replaceAurDescription" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered"><form id="replaceAurForm" class="modal-content">
    <div class="modal-header">
      <h2 class="modal-title fs-5" id="replaceAurTitle"><i class="fa-solid fa-triangle-exclamation text-warning me-2"></i>Replace existing AUR?</h2>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cancel AUR replacement"></button>
    </div>
    <div class="modal-body">
      <p id="replaceAurDescription">This review already has an Action Under Review marker. Confirm that you intend to replace it with the current playback position.</p>
      <dl class="row mb-0 small">
        <dt class="col-5">Existing AUR</dt><dd id="replaceAurExisting" class="col-7 text-end font-monospace">—</dd>
        <dt class="col-5">New AUR</dt><dd id="replaceAurNew" class="col-7 text-end font-monospace">—</dd>
      </dl>
    </div>
    <div class="modal-footer">
      <span class="small text-secondary me-auto"><kbd>Esc</kbd> cancel · <kbd>Enter</kbd> replace</span>
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button id="replaceAurConfirm" type="submit" class="btn btn-warning"><i class="fa-solid fa-thumbtack"></i> Replace AUR</button>
    </div>
  </form></div>
</div>

<div class="modal fade" id="startMatchRoundModal" tabindex="-1" aria-labelledby="startMatchRoundTitle" aria-describedby="startMatchRoundDescription" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered"><form id="startMatchRoundForm" class="modal-content">
    <div class="modal-header">
      <h2 class="modal-title fs-5" id="startMatchRoundTitle"><i class="fa-solid fa-flag-checkered text-primary me-2"></i>Start Round?</h2>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cancel match or round start"></button>
    </div>
    <div class="modal-body">
      <p id="startMatchRoundDescription">This will establish the current server time as the beginning of the timeline.</p>
      <dl class="row mb-0 small">
        <dt class="col-5">Timeline start</dt><dd id="startMatchRoundTime" class="col-7 text-end font-monospace">—</dd>
      </dl>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary"><i class="fa-solid fa-flag-checkered"></i> Confirm Start</button>
    </div>
  </form></div>
</div>

<div class="modal fade" id="deleteRequestModal" tabindex="-1" aria-labelledby="deleteRequestTitle" aria-describedby="deleteRequestDescription" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered"><form id="deleteRequestForm" class="modal-content">
    <div class="modal-header">
      <h2 class="modal-title fs-5" id="deleteRequestTitle"><i class="fa-solid fa-triangle-exclamation text-danger me-2"></i>Delete review request?</h2>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cancel request deletion"></button>
    </div>
    <div class="modal-body">
      <p id="deleteRequestDescription">This permanently removes the request and its markers from the timeline.</p>
      <dl class="row mb-0 small">
        <dt class="col-5">Request</dt><dd id="deleteRequestId" class="col-7 text-end">—</dd>
        <dt class="col-5">Request time</dt><dd id="deleteRequestRm" class="col-7 text-end font-monospace">—</dd>
      </dl>
    </div>
    <div class="modal-footer">
      <span class="small text-secondary me-auto"><kbd>Esc</kbd> cancel · <kbd>Enter</kbd> delete</span>
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
      <button id="deleteRequestConfirm" type="submit" class="btn btn-danger"><i class="fa-solid fa-trash"></i> Delete Request</button>
    </div>
  </form></div>
</div>

<?php if ($matchRequestError !== null): ?>
<div class="modal fade" id="matchRequestErrorModal" tabindex="-1" aria-labelledby="matchRequestErrorTitle" aria-describedby="matchRequestErrorDescription" aria-hidden="true" data-bs-backdrop="static" data-bs-keyboard="false">
  <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
    <div class="modal-header">
      <h2 class="modal-title fs-5" id="matchRequestErrorTitle"><i class="fa-solid fa-circle-exclamation text-danger me-2"></i><?= htmlspecialchars($matchRequestError['title'], ENT_QUOTES, 'UTF-8') ?></h2>
      <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Dismiss match error"></button>
    </div>
    <div class="modal-body">
      <p id="matchRequestErrorDescription" class="mb-0"><?= htmlspecialchars($matchRequestError['message'], ENT_QUOTES, 'UTF-8') ?></p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-primary" data-bs-dismiss="modal">OK</button>
    </div>
  </div></div>
</div>
<?php endif; ?>

<div class="offcanvas offcanvas-end" tabindex="-1" id="developerPanel" aria-labelledby="developerTitle">
  <div class="offcanvas-header"><div><h2 class="offcanvas-title fs-5" id="developerTitle">Prototype scenarios</h2><div class="small text-secondary">Mock data and workflow controls</div></div><button class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button></div>
  <div class="offcanvas-body">
    <div id="scenarioList" class="d-grid gap-2"></div>
    <hr>
    <button class="btn btn-outline-danger w-100" data-action="reset-prototype"><i class="fa-solid fa-rotate-left"></i> Reset prototype session</button>
    <div class="alert alert-info mt-3 small mb-0"><strong>Prototype only.</strong> Video, playback, PSSEL data, server timestamps, persistence, and result APIs are simulated. No adjudication is automated.</div>
  </div>
</div>

<div class="modal fade" id="advanceRoundModal" tabindex="-1" aria-labelledby="advanceRoundTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered"><form id="advanceRoundForm" class="modal-content">
    <div class="modal-header"><h2 class="modal-title fs-5" id="advanceRoundTitle">Advance to the Next Round?</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cancel"></button></div>
    <div class="modal-body">The timeline is frozen. Advance the round number and prepare to start the next round?</div>
    <div class="modal-footer"><span class="small text-secondary me-auto"><kbd>Esc</kbd> cancel · <kbd>Enter</kbd> advance</span><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button><button type="submit" class="btn btn-primary">Next Round</button></div>
  </form></div>
</div>
