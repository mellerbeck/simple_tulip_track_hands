(function () {
  "use strict";

  // Tulip widget API
  const setValue = window.setValue || function () {};
  const fireEvent = window.fireEvent || function () {};
  const onValueChange = window.onValueChange || function () {};

  const OUT_IS_CLOSED = "isClosed";
  const IN_THRESHOLD = "closedThreshold";

  // Elements
  const videoEl = document.getElementById("video");
  const canvasEl = document.getElementById("canvas");
  const statusEl = document.getElementById("status");
  let ctx = null;

  // State
  let model = null;
  let running = false;
  let rafId = null;
  let isClosedCurrent = false;
  let closedThreshold = 0.9;

  // Helpers
  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function normalizeThreshold(v) {
    if (typeof v !== "number") return null;
    return v > 1
      ? Math.max(0, Math.min(1, v / 100))
      : Math.max(0, Math.min(1, v));
  }

  function draw(preds) {
    if (!canvasEl || !videoEl || !model) return;
    if (!ctx) ctx = canvasEl.getContext("2d");

    const vw = videoEl.videoWidth || 640;
    const vh = videoEl.videoHeight || 480;
    canvasEl.width = vw;
    canvasEl.height = vh;

    ctx.clearRect(0, 0, vw, vh);
    model.renderPredictions(preds, canvasEl, ctx, videoEl);
  }

  function setClosedState(next, score) {
    if (next === isClosedCurrent) return;
    isClosedCurrent = next;
    setValue(OUT_IS_CLOSED, next);
    fireEvent("ClosedChanged", next ? "true" : "false");
  }

  function loop() {
    if (!running || !model) return;

    model
      .detect(videoEl)
      .then((preds) => {
        draw(preds);

        // Detect best closed hand score
        let best = 0;
        for (const p of preds) {
          if ((p.label || "").toLowerCase() === "closed") {
            const s =
              typeof p.score === "number" ? p.score : Number(p.score || 0);
            if (s > best) best = s;
          }
        }

        const crossed = best >= closedThreshold;
        setClosedState(crossed, best);

        setStatus(`closed=${crossed} (score=${best.toFixed(2)})`);
        rafId = requestAnimationFrame(loop);
      })
      .catch((err) => {
        setStatus("Detect error: " + (err?.message || err));
        rafId = requestAnimationFrame(loop);
      });
  }

  function start() {
    if (!window.handTrack || !model || running) return;
    window.handTrack
      .startVideo(videoEl)
      .then((ok) => {
        if (!ok) return setStatus("Camera blocked or not allowed");
        running = true;
        loop();
      })
      .catch((err) => {
        setStatus("Video error: " + (err?.message || err));
      });
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (window.handTrack?.stopVideo) window.handTrack.stopVideo(videoEl);
    setStatus("Stopped");
  }

  // Load model + auto start
  function boot() {
    setValue(OUT_IS_CLOSED, false);
    setStatus("Loading model...");

    const params = {
      flipHorizontal: true,
      imageScaleFactor: 0.75,
      maxNumBoxes: 5,
      iouThreshold: 0.5,
      scoreThreshold: 0.6,
    };

    window.handTrack
      .load(params)
      .then((m) => {
        model = m;
        setStatus("Model ready, starting...");
        start();
      })
      .catch((err) => {
        setStatus("Model load error: " + (err?.message || err));
      });
  }

  // Inject script + wait
  function init() {
    if (window.handTrack) return boot();

    const s = document.createElement("script");
    s.src =
      "https://cdn.jsdelivr.net/npm/handtrackjs@latest/dist/handtrack.min.js";
    s.onload = boot;
    s.onerror = () => setStatus("Failed to load handtrack.js");
    document.head.appendChild(s);
  }

  // Handle threshold from Tulip input
  onValueChange(IN_THRESHOLD, (v) => {
    const t = normalizeThreshold(v);
    if (t !== null) closedThreshold = t;
  });

  // Run once page is ready
  if (document.readyState === "complete") init();
  else window.addEventListener("load", init);
})();
