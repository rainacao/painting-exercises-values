// ── Elements ──────────────────────────────────────────────────────────────
const jsonInput           = document.getElementById('json-input');
const uploadArea          = document.getElementById('upload-area');
const mainEl              = document.getElementById('main');
const infoFile            = document.getElementById('info-file');
const infoDims            = document.getElementById('info-dims');
const infoDuration        = document.getElementById('info-duration');
const replayCanvas        = document.getElementById('replay-canvas');
const ctx                 = replayCanvas.getContext('2d');
const playBtn             = document.getElementById('play-btn');
const timeDisplay         = document.getElementById('time-display');
const scrubber            = document.getElementById('scrubber');
const statusColor         = document.getElementById('status-color');
const statusBrush         = document.getElementById('status-brush');
const statusBW            = document.getElementById('status-bw');
const annotationText      = document.getElementById('annotation-text');
const addAnnotationBtn    = document.getElementById('add-annotation-btn');
const annotationList      = document.getElementById('annotation-list');
const exportAnnotationsBtn = document.getElementById('export-annotations-btn');

// ── Session state ──────────────────────────────────────────────────────────
let sessionMeta = null;
let actions     = [];
let maxT        = 0;
let currentT    = 0;
let annotations = [];

// ── Playback state ─────────────────────────────────────────────────────────
let isPlaying         = false;
let playStartWall     = null;
let playStartSessionT = 0;
let rafId             = null;

// ── Incremental replay state ───────────────────────────────────────────────
// Tracks the canvas + brush state as actions are processed forward.
// Reset on every full rebuild (seekTo without fromIndex).
let rState = {
  color:       '0,0,0',
  brushSize:   16,
  bw:          false,
  blur:        0,
  lastX:       null,
  lastY:       null,
  actionIndex: 0,   // index of the NEXT unprocessed action
};

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function drawDot(x, y, size, color) {
  ctx.fillStyle = `rgb(${color})`;
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSegment(x0, y0, x1, y1, size, color) {
  ctx.strokeStyle = `rgb(${color})`;
  ctx.lineWidth   = size;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// ── Action processing ──────────────────────────────────────────────────────
function processAction(action) {
  switch (action.type) {
    case 'stroke_start':
      rState.color     = action.color;
      rState.brushSize = action.brushSize;
      rState.lastX     = action.x;
      rState.lastY     = action.y;
      drawDot(action.x, action.y, action.brushSize, action.color);
      break;

    case 'stroke_point':
      drawDot(action.x, action.y, rState.brushSize, rState.color);
      if (rState.lastX !== null) {
        drawSegment(rState.lastX, rState.lastY, action.x, action.y, rState.brushSize, rState.color);
      }
      rState.lastX = action.x;
      rState.lastY = action.y;
      break;

    case 'stroke_end':
      rState.lastX = null;
      rState.lastY = null;
      break;

    case 'clear':
      ctx.fillStyle = 'rgb(125, 125, 125)';
      ctx.fillRect(0, 0, replayCanvas.width, replayCanvas.height);
      break;

    case 'color_change':
      rState.color = action.color;
      break;

    case 'brush_resize':
      rState.brushSize = action.size;
      break;

    case 'bw_toggle':
      rState.bw = action.active;
      break;

    case 'blur_change':
      rState.blur = action.amount;
      break;
  }
}

// ── Seek ───────────────────────────────────────────────────────────────────
// If fromIndex is omitted (or 0), performs a full rebuild from the start.
// Otherwise processes only the new actions since fromIndex (incremental).
function seekTo(targetT, fromIndex) {
  targetT = Math.max(0, Math.min(targetT, maxT));

  if (!fromIndex) {
    ctx.fillStyle = 'rgb(125, 125, 125)';
    ctx.fillRect(0, 0, replayCanvas.width, replayCanvas.height);
    rState = { color: '0,0,0', brushSize: 16, bw: false, blur: 0, lastX: null, lastY: null, actionIndex: 0 };
    fromIndex = 0;
  }

  let i = fromIndex;
  while (i < actions.length && actions[i].t <= targetT) {
    processAction(actions[i]);
    i++;
  }
  rState.actionIndex = i;
  currentT = targetT;
  updateUI();
}

// ── UI updates ─────────────────────────────────────────────────────────────
function updateUI() {
  scrubber.value          = currentT;
  timeDisplay.textContent = `${formatTime(currentT)} / ${formatTime(maxT)}`;

  statusColor.style.background = `rgb(${rState.color})`;
  statusBrush.textContent      = `${rState.brushSize}px`;
  const bwLabel   = rState.bw          ? 'B&W'              : '';
  const blurLabel = rState.blur > 0    ? `blur ${rState.blur}px` : '';
  statusBW.textContent = [bwLabel, blurLabel].filter(Boolean).join(' · ');
}

// ── Playback ───────────────────────────────────────────────────────────────
function playFrame() {
  const targetT = playStartSessionT + (Date.now() - playStartWall);
  if (targetT >= maxT) {
    seekTo(maxT, rState.actionIndex);
    pause();
    return;
  }
  // Incremental: only process actions since the last frame
  seekTo(targetT, rState.actionIndex);
  rafId = requestAnimationFrame(playFrame);
}

function play() {
  if (currentT >= maxT) seekTo(0);  // restart from beginning if at end
  isPlaying         = true;
  playStartWall     = Date.now();
  playStartSessionT = currentT;
  playBtn.textContent = '⏸';
  rafId = requestAnimationFrame(playFrame);
}

function pause() {
  isPlaying = false;
  cancelAnimationFrame(rafId);
  rafId = null;
  playBtn.textContent = '▶';
}

playBtn.addEventListener('click', () => {
  isPlaying ? pause() : play();
});

// ── Scrubber ───────────────────────────────────────────────────────────────
scrubber.addEventListener('mousedown', () => {
  if (isPlaying) pause();
});
scrubber.addEventListener('input', () => {
  // Full rebuild required when jumping to an arbitrary position
  seekTo(parseInt(scrubber.value, 10));
});

// ── File loading ───────────────────────────────────────────────────────────
function loadSession(json) {
  if (json.version !== 1 || !json.meta || !Array.isArray(json.actions)) {
    alert('Unrecognised session file format.');
    return;
  }

  sessionMeta = json.meta;
  actions     = json.actions;
  maxT        = actions.length > 0 ? actions[actions.length - 1].t : 0;
  annotations = [];

  replayCanvas.width        = sessionMeta.canvasWidth;
  replayCanvas.height       = sessionMeta.canvasHeight;
  replayCanvas.style.width  = sessionMeta.canvasWidth  + 'px';
  replayCanvas.style.height = sessionMeta.canvasHeight + 'px';

  infoFile.textContent     = sessionMeta.referenceFile;
  infoDims.textContent     = `${sessionMeta.canvasWidth}×${sessionMeta.canvasHeight}`;
  infoDuration.textContent = formatTime(maxT);

  scrubber.max = maxT;

  seekTo(0);
  renderAnnotationList();

  uploadArea.style.display = 'none';
  mainEl.style.display     = 'flex';
}

jsonInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      loadSession(JSON.parse(ev.target.result));
    } catch {
      alert('Could not parse JSON file.');
    }
  };
  reader.readAsText(file);
});

// Drag-and-drop
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      loadSession(JSON.parse(ev.target.result));
    } catch {
      alert('Could not parse JSON file.');
    }
  };
  reader.readAsText(file);
});

// ── Annotations ────────────────────────────────────────────────────────────
function renderAnnotationList() {
  annotationList.innerHTML = '';
  const sorted = [...annotations].sort((a, b) => a.t - b.t);

  for (const ann of sorted) {
    const li = document.createElement('li');
    li.className = 'annotation-item';

    const timeBtn = document.createElement('button');
    timeBtn.className   = 'annotation-time';
    timeBtn.textContent = formatTime(ann.t);
    timeBtn.title       = 'Jump to this time';
    timeBtn.addEventListener('click', () => {
      if (isPlaying) pause();
      seekTo(ann.t);
    });

    const noteSpan = document.createElement('span');
    noteSpan.className   = 'annotation-note';
    noteSpan.textContent = ann.note;

    const delBtn = document.createElement('button');
    delBtn.className   = 'annotation-del';
    delBtn.textContent = '✕';
    delBtn.title       = 'Remove annotation';
    delBtn.addEventListener('click', () => {
      annotations = annotations.filter(a => a !== ann);
      renderAnnotationList();
    });

    li.append(timeBtn, noteSpan, delBtn);
    annotationList.appendChild(li);
  }
}

addAnnotationBtn.addEventListener('click', () => {
  const note = annotationText.value.trim();
  if (!note) return;
  annotations.push({ t: currentT, note });
  annotationText.value = '';
  renderAnnotationList();
});

annotationText.addEventListener('keydown', e => {
  if (e.key === 'Enter') addAnnotationBtn.click();
});

exportAnnotationsBtn.addEventListener('click', () => {
  if (!sessionMeta || annotations.length === 0) return;
  const sorted  = [...annotations].sort((a, b) => a.t - b.t);
  const payload = JSON.stringify({
    version:      1,
    sessionFile:  sessionMeta.referenceFile,
    sessionStart: sessionMeta.sessionStart,
    annotations:  sorted.map(a => ({
      t:             a.t,
      timeFormatted: formatTime(a.t),
      note:          a.note,
    })),
  }, null, 2);

  const blob = new Blob([payload], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const stem = sessionMeta.referenceFile
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]/gi, '_');
  a.href     = url;
  a.download = `annotations_${stem}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});
