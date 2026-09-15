<aside id="reviewPanel" class="review-panel" aria-label="Request and review controls">
  <div class="panel-section request-actions" data-visible-when="monitoring">
    <h2 class="panel-title">Review Request</h2>
    <div class="btn-group w-100 mb-2">
      <button class="btn btn-chung action-button" data-action="create-request" data-side="chung"><i class="fa-solid fa-flag"></i> Chung Review Request <kbd>C</kbd></button>
      <button class="btn btn-hong action-button" data-action="create-request" data-side="hong"><i class="fa-solid fa-flag"></i> Hong Review Request <kbd>H</kbd></button>
    </div>
    <div class="row w-100 mb-2">
      <div class="col-6">
        <fieldset class="request-option-group w-100">
          <legend>Origin</legend>
          <div class="btn-group w-100" role="radiogroup" aria-label="Request origin">
            <input class="btn-check" type="radio" name="requestOrigin" id="requestOriginCoach" value="coach" checked>
            <label class="btn btn-outline-primary" title="Coach requests IVR review" for="requestOriginCoach"><i class="fa-solid fa-user"></i> Coach</label>
            <input class="btn-check" type="radio" name="requestOrigin" id="requestOriginReferee" value="referee">
            <label class="btn btn-outline-primary" title="Referee requests IVR review" for="requestOriginReferee"><i class="fa-solid fa-user-shield"></i> Referee</label>
          </div>
        </fieldset>
      </div>
      <div class="col-6">
        <fieldset class="request-option-group w-100">
          <legend>Issue Type</legend>
          <div class="btn-group w-100" role="radiogroup" aria-label="Issue type">
            <input class="btn-check" type="radio" name="requestIssueType" id="requestStandard" value="standard" checked>
            <label class="btn btn-outline-primary" title="Blue or Red card" for="requestStandard">Standard</label>
            <input class="btn-check" type="radio" name="requestIssueType" id="requestTechnical" value="technical">
            <label class="btn btn-outline-success" title="Green card" for="requestTechnical">Technical</label>
          </div>
      </fieldset>
    </div>
  </div>
  <div class="btn-group w-100" role="group" aria-label="Review navigation">
    <button class="btn btn-outline-secondary flex-fill" data-action="first-review"><i class="fa-solid fa-backward-fast"></i> First Review</button>
    <button class="btn btn-outline-secondary flex-fill" data-action="last-review">Last Review <i class="fa-solid fa-forward-fast"></i></button>
  </div>
</aside>
