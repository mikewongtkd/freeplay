<aside id="reviewPanel" class="review-panel" aria-label="Request and review controls">
  <div class="panel-section request-actions" data-visible-when="monitoring">
    <h2 class="panel-title">Review Request</h2>
    <div class="request-match-controls mb-2">
     <button class="btn btn-sm btn-outline-primary" type="button" data-bs-toggle="modal" data-bs-target="#matchModal"><i class="fa-solid fa-pen-to-square"></i> Match</button>
     <span class="badge bg-secondary" id="requestMatchNum">Loading Match Data...</span>
    </div>
    <div class="panel-kicker" id="requestDivInfo">Loading Match Data...</div>
    <div class="btn-group w-100 mb-2">
      <button class="btn btn-chung action-button" data-action="create-request" data-side="chung"><i class="fa-solid fa-flag"></i> Chung <kbd>C</kbd></button>
      <button class="btn btn-hong action-button" data-action="create-request" data-side="hong"><i class="fa-solid fa-flag"></i> Hong <kbd>H</kbd></button>
    </div>
  </div>
</aside>
