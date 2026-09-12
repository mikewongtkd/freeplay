<div class="modal fade" id="legendModal" tabindex="-1" aria-labelledby="legendTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered"><div class="modal-content">
    <div class="modal-header"><h2 class="modal-title fs-5" id="legendTitle">Timeline legend</h2><button class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
    <div class="modal-body legend-list">
      <p><span class="legend-swatch review-window-chung"></span><strong>Chung Review Window</strong> — five seconds before RM through RM.</p>
      <p><span class="legend-swatch review-window-hong"></span><strong>Hong Review Window</strong> — five seconds before RM through RM.</p>
      <p><span class="legend-swatch review-window-official"></span><strong>Official request</strong> — operational context; not a coach quota event.</p>
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
      <kbd>W</kbd><span>Review Window start</span><kbd>R</kbd><span>Return to AUR</span>
      <kbd>Alt+Arrows</kbd><span>Pan in SCV</span><kbd>+ / −</kbd><span>Zoom in / out in SCV</span>
    </div></div>
  </div></div>
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
        <div class="col-12"><label class="form-label" for="annotationReason">Request reason</label><select id="annotationReason" name="reason" class="form-select"><option>Falling Down</option><option>Crossing the Boundary Line</option><option>Attacking After Kal-yeo</option><option>Attacking the Fallen Opponent</option><option>Technical Points</option><option>Invalidation of points following a Gam-jeom</option><option>Gam-jeom given to the wrong player</option><option>Punch Misidentification</option><option>Head kick (Head PSS not in use)</option><option>Pretending Injury</option><option>Technical Issue</option><option>Other / official correction</option></select></div>
        <div class="col-md-6"><label class="form-label" for="annotationGamjeom">Gam-jeom type, if applicable</label><input id="annotationGamjeom" name="gamJeomType" class="form-control"></div>
        <div class="col-md-6"><label class="form-label" for="annotationResult">Result</label><input id="annotationResult" name="result" class="form-control" readonly></div>
        <div class="col-12"><label class="form-label" for="annotationExplanation">Explanation</label><textarea id="annotationExplanation" name="explanation" class="form-control" rows="3"></textarea></div>
        <div class="col-12"><label class="form-label" for="annotationNotes">Notes</label><textarea id="annotationNotes" name="notes" class="form-control" rows="2"></textarea></div>
      </div>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button><button class="btn btn-primary" type="submit">Save annotation</button></div>
  </form></div>
</div>

<div class="offcanvas offcanvas-end" tabindex="-1" id="developerPanel" aria-labelledby="developerTitle">
  <div class="offcanvas-header"><div><h2 class="offcanvas-title fs-5" id="developerTitle">Prototype scenarios</h2><div class="small text-secondary">Mock data and workflow controls</div></div><button class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button></div>
  <div class="offcanvas-body">
    <div id="scenarioList" class="d-grid gap-2"></div>
    <hr>
    <button class="btn btn-outline-danger w-100" data-action="reset-prototype"><i class="bi bi-arrow-counterclockwise"></i> Reset prototype session</button>
    <div class="alert alert-info mt-3 small mb-0"><strong>Prototype only.</strong> Video, playback, PSSEL data, server timestamps, persistence, and result APIs are simulated. No adjudication is automated.</div>
  </div>
</div>
