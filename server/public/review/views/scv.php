<section id="scvView" class="view-panel d-none" aria-label="Single Camera View">
  <div class="scv-layout">
    <div class="scv-video-column">
      <article class="video-tile scv-video">
        <div id="scvScene" class="simulated-video camera-scene camera-scene-1">
          <div class="camera-label"><strong id="scvCameraLabel">CAM 1</strong><span id="scvCameraName">Wide (Center)</span></div>
          <span id="scvCameraState" class="camera-state badge">STREAMING</span>
          <button class="camera-nav camera-nav-prev" data-action="previous-camera" aria-label="Previous camera"><i class="fa-solid fa-chevron-left"></i></button>
          <button class="camera-nav camera-nav-next" data-action="next-camera" aria-label="Next camera"><i class="fa-solid fa-chevron-right"></i></button>
          <div class="camera-action"><span class="fighter fighter-hong"></span><span class="fighter fighter-chung"></span></div>
          <div id="scvUnavailable" class="unavailable-overlay"><i class="fa-solid fa-video-slash"></i><strong>No video available</strong><span>Choose another camera</span></div>
          <div id="scvTimecode" class="video-timecode">--:--:--.---</div>
        </div>
      </article>
    </div>
    <aside class="scv-side-panel">
      <div class="camera-switcher panel-section">
        <span class="panel-kicker">Camera</span>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary" data-action="previous-camera" aria-label="Previous camera"><i class="fa-solid fa-chevron-left"></i></button>
          <select id="cameraSelect" class="form-select" aria-label="Selected camera"></select>
          <button class="btn btn-outline-secondary" data-action="next-camera" aria-label="Next camera"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
      </div>
      <div id="scvReviewPanel"></div>
      <div class="panel-section scv-working-notes">
        <label class="panel-kicker" for="workingNotes">Working notes</label>
        <textarea id="workingNotes" class="form-control form-control-sm" rows="3" placeholder="Optional notes; formal result does not wait for this field."></textarea>
      </div>
    </aside>
  </div>
</section>
