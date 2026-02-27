// ── Recorder ──────────────────────────────────────────────────────────────
// Logs all user actions in memory and exports them as a JSON session file.

const recorder = (() => {
  let sessionStart = null;
  let meta         = null;
  let actions      = [];
  let lastLoggedX  = null;
  let lastLoggedY  = null;
  let strokeOpen   = false;

  const MIN_DIST = 2; // px — minimum movement before logging a stroke_point

  function t() {
    return sessionStart ? Date.now() - sessionStart : 0;
  }

  function dist(x, y) {
    if (lastLoggedX === null) return Infinity;
    const dx = x - lastLoggedX;
    const dy = y - lastLoggedY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  return {
    /** Call when a new image is loaded. Resets the session. */
    start(referenceFile, canvasWidth, canvasHeight) {
      sessionStart = Date.now();
      meta = {
        referenceFile,
        canvasWidth,
        canvasHeight,
        sessionStart: new Date(sessionStart).toISOString(),
      };
      actions      = [];
      lastLoggedX  = null;
      lastLoggedY  = null;
      strokeOpen   = false;
    },

    /** Log the beginning of a stroke (mousedown / touchstart). */
    strokeStart(x, y, brushSize, color) {
      lastLoggedX = x;
      lastLoggedY = y;
      strokeOpen  = true;
      actions.push({ type: 'stroke_start', t: t(), x: Math.round(x), y: Math.round(y), brushSize, color });
    },

    /** Log a mid-stroke point (mousemove / touchmove). Throttled by MIN_DIST. */
    strokePoint(x, y) {
      if (dist(x, y) < MIN_DIST) return;
      lastLoggedX = x;
      lastLoggedY = y;
      actions.push({ type: 'stroke_point', t: t(), x: Math.round(x), y: Math.round(y) });
    },

    /** Log the end of a stroke (mouseup / touchend / mouseleave). */
    strokeEnd() {
      const ex = lastLoggedX;
      const ey = lastLoggedY;
      lastLoggedX = null;
      lastLoggedY = null;
      strokeOpen  = false;
      actions.push({ type: 'stroke_end', t: t(), x: Math.round(ex), y: Math.round(ey) });
    },

    /** Log a B&W filter toggle. */
    bwToggle(active) {
      actions.push({ type: 'bw_toggle', t: t(), active });
    },

    /** Log a blur amount change. */
    blurChange(amount) {
      actions.push({ type: 'blur_change', t: t(), amount });
    },

    /** Log a color swatch selection. */
    colorChange(color) {
      actions.push({ type: 'color_change', t: t(), color });
    },

    /** Log a brush size change. */
    brushResize(size) {
      actions.push({ type: 'brush_resize', t: t(), size });
    },

    /** Log the canvas being cleared. */
    clear() {
      actions.push({ type: 'clear', t: t() });
    },

    /** Download the session as a JSON file. */
    exportJSON() {
      if (!meta) return;
      // Close any stroke that was still open when the user clicked Export
      if (strokeOpen) this.strokeEnd();
      const payload = JSON.stringify({ version: 1, meta, actions }, null, 2);
      const blob    = new Blob([payload], { type: 'application/json' });
      const url     = URL.createObjectURL(blob);
      const a       = document.createElement('a');
      // Filename: referenceFile stem + timestamp
      const stem    = meta.referenceFile.replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]/gi, '_');
      a.href        = url;
      a.download    = `session_${stem}_${new Date(meta.sessionStart).toISOString().replace(/[:.]/g, '-')}.json`;
      a.click();
      // Defer revoke so the browser has time to initiate the download
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },

    /** Returns true if a session is active (image has been loaded). */
    isActive() {
      return sessionStart !== null;
    },

    /** Returns the reference file name for the current session. */
    currentFileName() {
      return meta ? meta.referenceFile : '';
    },
  };
})();
