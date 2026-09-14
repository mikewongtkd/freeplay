<aside id="reviewPanel" class="review-panel" aria-label="Request and review controls">
  <div class="panel-section request-actions" data-visible-when="monitoring">
    <h2 class="panel-title">Request / Review</h2>
    <fieldset class="request-option-group">
      <legend>Origin</legend>
      <div class="btn-group w-100" role="radiogroup" aria-label="Request origin">
        <input class="btn-check" type="radio" name="requestOrigin" id="requestOriginCoach" value="coach" checked>
        <label class="btn btn-outline-primary" for="requestOriginCoach"><i class="fa-solid fa-user"></i> Coach</label>
        <input class="btn-check" type="radio" name="requestOrigin" id="requestOriginReferee" value="referee">
        <label class="btn btn-outline-primary" for="requestOriginReferee"><i class="fa-solid fa-user-shield"></i> Referee</label>
      </div>
    </fieldset>
    <fieldset class="request-option-group">
      <legend>Issue Type</legend>
      <div class="btn-group w-100" role="radiogroup" aria-label="Issue type">
        <input class="btn-check" type="radio" name="requestIssueType" id="requestNonTechnical" value="nontechnical" checked>
        <label class="btn btn-outline-secondary" for="requestNonTechnical">Non-Technical <small>Red or Blue Card</small></label>
        <input class="btn-check" type="radio" name="requestIssueType" id="requestTechnical" value="technical">
        <label class="btn btn-outline-success" for="requestTechnical">Technical <small>Green Card</small></label>
      </div>
    </fieldset>
    <button class="btn btn-chung w-100 action-button" data-action="create-request" data-side="chung"><i class="fa-solid fa-flag"></i> Chung Review Request <kbd>C</kbd></button>
    <button class="btn btn-hong w-100 action-button" data-action="create-request" data-side="hong"><i class="fa-solid fa-flag"></i> Hong Review Request <kbd>H</kbd></button>
  </div>
  <div class="panel-section review-summary">
    <div class="d-flex justify-content-between align-items-center gap-2">
      <h2 class="panel-title mb-0">Selected Request</h2>
      <span id="reviewStatusBadge" class="badge text-bg-secondary">NO REQUEST</span>
    </div>
    <div id="reviewEmpty" class="empty-copy">Create or select a Request Mark to begin.</div>
    <dl id="reviewMetadata" class="review-metadata d-none">
      <div><dt>Origin</dt><dd id="metaOrigin">—</dd></div>
      <div><dt>Issue Type</dt><dd id="metaIssueType">—</dd></div>
      <div><dt>Request Mark (RM)</dt><dd id="metaRm">—</dd></div>
      <div><dt>Review Window</dt><dd id="metaWindow">—</dd></div>
      <div><dt>Action (AUR)</dt><dd id="metaAur">Not marked</dd></div>
      <div><dt>Review Start (RST)</dt><dd id="metaRst">Not started</dd></div>
    </dl>
    <div id="aurWarning" class="alert alert-warning py-2 px-3 d-none" role="alert"><i class="fa-solid fa-triangle-exclamation"></i> AUR is outside the coach Review Window. Marker preserved for audit.</div>
    <div id="reviewClock" class="review-clock d-none"><span>Review Response Time</span><strong id="reviewClockValue">00:00.0</strong></div>
  </div>
  <div class="panel-section review-actions">
    <button id="startReviewButton" class="btn btn-success w-100 action-button" data-action="start-review" disabled><i class="fa-solid fa-play"></i> Start Review <kbd>S</kbd></button>
    <button id="resolveButton" class="btn btn-outline-secondary w-100 d-none" data-action="resolve-without-review">Resolved without Review</button>
    <div id="formalResults" class="result-grid d-none">
      <button class="btn btn-success" data-action="set-result" data-result="accepted"><i class="fa-solid fa-circle-check"></i><span>Accepted</span></button>
      <button class="btn btn-danger" data-action="set-result" data-result="rejected"><i class="fa-solid fa-circle-xmark"></i><span>Rejected</span></button>
      <button class="btn btn-warning" data-action="set-result" data-result="ivr_issue"><i class="fa-solid fa-triangle-exclamation"></i><span>Rejected:<br>IVR Issue</span></button>
    </div>
  </div>
  <div class="panel-section review-navigation">
    <div class="d-flex gap-2">
      <button class="btn btn-outline-secondary flex-fill" data-action="previous-review"><i class="fa-solid fa-backward-step"></i> Previous Review</button>
      <button class="btn btn-outline-secondary flex-fill" data-action="next-review">Next Review <i class="fa-solid fa-forward-step"></i></button>
    </div>
  </div>
  <div id="annotationSection" class="panel-section annotation-section d-none">
    <div class="d-flex justify-content-between align-items-center"><h2 class="panel-title mb-0">Post-review annotation</h2><span class="badge text-bg-light">Not timed</span></div>
    <button class="btn btn-sm btn-outline-primary mt-2" data-bs-toggle="modal" data-bs-target="#annotationModal"><i class="fa-solid fa-pen-to-square"></i> Complete IVR Sheet</button>
    <button id="secondReviewButton" class="btn btn-sm btn-outline-secondary mt-2 d-none" data-action="second-review"><i class="fa-solid fa-link"></i> Create linked second review</button>
  </div>
</aside>
