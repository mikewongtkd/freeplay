<div id="reviewDecisions" class="review-decisions" aria-labelledby="reviewDecisionsHeading">
  <div class="panel-section review-decisions">
    <h2 id="reviewDecisionsHeading" class="panel-title mb-0">Review Decisions</h2>
    <div id="reviewClock" class="review-clock d-none"><span>Review Response Time</span><strong id="reviewClockValue">00:00.0</strong></div>
  </div>
  <div class="panel-section review-actions">
    <button id="deleteButton" class="btn btn-danger w-100 mt-2" data-action="delete-request"><i class="fa-solid fa-trash"></i> Delete Request</button>
    <div id="formalResults" class="result-grid mt-2 d-none">
      <button class="btn btn-success" data-action="set-result" data-result="accepted"><i class="fa-solid fa-circle-check"></i><span>Accept</span></button>
      <button class="btn btn-danger" data-action="set-result" data-result="rejected"><i class="fa-solid fa-circle-xmark"></i><span>Reject</span></button>
      <button class="btn btn-warning" data-action="set-result" data-result="ivr_issue"><i class="fa-solid fa-triangle-exclamation"></i><span>Reject:<br>IVR Issue</span></button>
    </div>
  </div>
  <div id="annotationSection" class="panel-section annotation-section d-none">
    <div class="d-flex justify-content-between align-items-center"><h2 class="panel-title mb-0">Post-review annotation</h2><span class="badge text-bg-light">Not timed</span></div>
    <button class="btn btn-sm btn-outline-primary mt-2" data-bs-toggle="modal" data-bs-target="#annotationModal"><i class="fa-solid fa-pen-to-square"></i> Complete IVR Sheet</button>
  </div>
</div>
