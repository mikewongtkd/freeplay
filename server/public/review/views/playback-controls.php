<section class="playback-toolbar" aria-label="Playback and navigation controls">
  <div class="toolbar-group seek-group" role="group" aria-label="Seek backward">
    <button class="btn btn-control" data-action="seek" data-seconds="-5"><i class="fa-solid fa-backward-fast"></i> −5s</button>
    <button class="btn btn-control" data-action="seek" data-seconds="-2">−2s</button>
    <button class="btn btn-control" data-action="seek" data-seconds="-1">−1s</button>
  </div>
  <div class="toolbar-group" role="group" aria-label="Frame and play controls">
    <button class="btn btn-control" data-action="step-frame" data-direction="-1" title="Previous frame"><i class="fa-solid fa-backward-step"></i> Frame</button>
    <button id="playPauseButton" class="btn btn-primary btn-control primary-control" data-action="play-pause"><i id="playPauseIcon" class="fa-solid fa-play"></i><span id="playPauseLabel">Play</span></button>
    <button class="btn btn-control" data-action="step-frame" data-direction="1" title="Next frame">Frame <i class="fa-solid fa-forward-step"></i></button>
  </div>
  <div class="toolbar-group rate-group" role="group" aria-label="Playback speed">
    <button class="btn btn-control" data-action="set-rate" data-rate="-0.5">0.5× <i class="fa-solid fa-backward"></i></button>
    <button class="btn btn-control" data-action="set-rate" data-rate="0.5">0.5×</button>
    <button class="btn btn-control active" data-action="set-rate" data-rate="1">1×</button>
    <button class="btn btn-control" data-action="set-rate" data-rate="2">2×</button>
    <button class="btn btn-control" data-action="set-rate" data-rate="5">5×</button>
  </div>
  <div class="toolbar-group review-nav-group" role="group" aria-label="Review navigation">
    <button class="btn btn-control" data-action="jump-window" title="Go to beginning of Review Window"><i class="fa-solid fa-backward-step"></i> Window</button>
    <button class="btn btn-control" data-action="jump-aur" title="Go to Action Under Review"><i class="fa-solid fa-crosshairs"></i> AUR <kbd>B</kbd></button>
    <button class="btn btn-aur btn-control" data-action="mark-aur"><i class="fa-solid fa-thumbtack"></i> Mark AUR <kbd>A</kbd></button>
    <button class="btn btn-live btn-control" data-action="go-live"><i class="fa-solid fa-tower-broadcast"></i> Go Live <kbd>L</kbd></button>
  </div>
  <div id="scvTools" class="toolbar-group scv-tools d-none" role="group" aria-label="Single camera fit and zoom">
    <button class="btn btn-control" data-action="fit"><i class="fa-solid fa-expand"></i> Fit</button>
    <button class="btn btn-control" data-action="zoom" data-delta="0.25"><i class="fa-solid fa-magnifying-glass-plus"></i></button>
    <button class="btn btn-control" data-action="zoom" data-delta="-0.25"><i class="fa-solid fa-magnifying-glass-minus"></i></button>
    <button class="btn btn-control" data-action="pan" data-x="-10" data-y="0" title="Pan left"><i class="fa-solid fa-arrow-left"></i></button>
    <button class="btn btn-control" data-action="pan" data-x="10" data-y="0" title="Pan right"><i class="fa-solid fa-arrow-right"></i></button>
    <button class="btn btn-control" data-action="pan" data-x="0" data-y="-10" title="Pan up"><i class="fa-solid fa-arrow-up"></i></button>
    <button class="btn btn-control" data-action="pan" data-x="0" data-y="10" title="Pan down"><i class="fa-solid fa-arrow-down"></i></button>
    <button class="btn btn-control" data-action="fullscreen" title="Full screen"><i class="fa-solid fa-expand"></i></button>
  </div>
  <div class="playback-readout"><span id="playbackState">LIVE</span><strong id="cursorReadout">--:--:--.---</strong></div>
</section>
