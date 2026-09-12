<section class="playback-toolbar" aria-label="Playback and navigation controls">
  <div class="toolbar-group seek-group" role="group" aria-label="Seek backward">
    <button class="btn btn-control" data-action="seek" data-seconds="-5"><i class="bi bi-rewind-fill"></i> −5s</button>
    <button class="btn btn-control" data-action="seek" data-seconds="-2">−2s</button>
    <button class="btn btn-control" data-action="seek" data-seconds="-1">−1s</button>
  </div>
  <div class="toolbar-group" role="group" aria-label="Frame and play controls">
    <button class="btn btn-control" data-action="step-frame" data-direction="-1" title="Previous frame"><i class="bi bi-skip-backward"></i> Frame</button>
    <button id="playPauseButton" class="btn btn-primary btn-control primary-control" data-action="play-pause"><i class="bi bi-play-fill"></i> Play</button>
    <button class="btn btn-control" data-action="step-frame" data-direction="1" title="Next frame">Frame <i class="bi bi-skip-forward"></i></button>
  </div>
  <div class="toolbar-group rate-group" role="group" aria-label="Playback speed">
    <button class="btn btn-control" data-action="set-rate" data-rate="-0.5">0.5× <i class="bi bi-rewind"></i></button>
    <button class="btn btn-control" data-action="set-rate" data-rate="0.5">0.5×</button>
    <button class="btn btn-control active" data-action="set-rate" data-rate="1">1×</button>
    <button class="btn btn-control" data-action="set-rate" data-rate="2">2×</button>
    <button class="btn btn-control" data-action="set-rate" data-rate="5">5×</button>
  </div>
  <div class="toolbar-group review-nav-group" role="group" aria-label="Review navigation">
    <button class="btn btn-control" data-action="jump-window" title="Go to beginning of Review Window"><i class="bi bi-box-arrow-in-left"></i> Window</button>
    <button class="btn btn-control" data-action="jump-aur" title="Go to Action Under Review"><i class="bi bi-crosshair"></i> AUR</button>
    <button class="btn btn-aur btn-control" data-action="mark-aur"><i class="bi bi-pin-angle-fill"></i> Mark AUR <kbd>A</kbd></button>
    <button class="btn btn-live btn-control" data-action="go-live"><i class="bi bi-broadcast"></i> Go Live <kbd>L</kbd></button>
  </div>
  <div id="scvTools" class="toolbar-group scv-tools d-none" role="group" aria-label="Single camera fit and zoom">
    <button class="btn btn-control" data-action="fit"><i class="bi bi-aspect-ratio"></i> Fit</button>
    <button class="btn btn-control" data-action="zoom" data-delta="0.25"><i class="bi bi-zoom-in"></i></button>
    <button class="btn btn-control" data-action="zoom" data-delta="-0.25"><i class="bi bi-zoom-out"></i></button>
    <button class="btn btn-control" data-action="pan" data-x="-10" data-y="0" title="Pan left"><i class="bi bi-arrow-left"></i></button>
    <button class="btn btn-control" data-action="pan" data-x="10" data-y="0" title="Pan right"><i class="bi bi-arrow-right"></i></button>
    <button class="btn btn-control" data-action="pan" data-x="0" data-y="-10" title="Pan up"><i class="bi bi-arrow-up"></i></button>
    <button class="btn btn-control" data-action="pan" data-x="0" data-y="10" title="Pan down"><i class="bi bi-arrow-down"></i></button>
    <button class="btn btn-control" data-action="fullscreen" title="Full screen"><i class="bi bi-arrows-fullscreen"></i></button>
  </div>
  <div class="playback-readout"><span id="playbackState">LIVE</span><strong id="cursorReadout">--:--:--.---</strong></div>
</section>
