<div id="reviewSummary" class="review-summary" aria-label="Review request summary">
  <div class="panel-section review-summary">
    <h2 class="panel-title mb-0">Review Summary</h2>
    <span id="reviewStatusBadge" class="badge text-bg-secondary">NO REQUEST</span>
    <div id="reviewEmpty" class="empty-copy">Create or select a Request Mark to begin.</div>
    <dl id="reviewMetadata" class="review-metadata d-none">
      <div><dt>Origin</dt><dd id="metaOrigin">—</dd></div>
      <div><dt>Issue Type</dt><dd id="metaIssueType">—</dd></div>
      <div><dt>Reason</dt><dd id="metaReason">—</dd></div>
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
  <div id="annotationSection" class="panel-section annotation-section d-none">
    <div class="d-flex justify-content-between align-items-center"><h2 class="panel-title mb-0">Post-review annotation</h2><span class="badge text-bg-light">Not timed</span></div>
    <button class="btn btn-sm btn-outline-primary mt-2" data-bs-toggle="modal" data-bs-target="#annotationModal"><i class="fa-solid fa-pen-to-square"></i> Complete IVR Sheet</button>
  </div>
</div>
