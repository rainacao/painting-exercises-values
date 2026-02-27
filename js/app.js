// ── Elements ──────────────────────────────────────────────────────────────
const fileInput      = document.getElementById('file-input');
const hint           = document.getElementById('hint');
const stage          = document.getElementById('stage');
const refContainer   = document.getElementById('ref-container');
const canvasContainer = document.getElementById('canvas-container');
const refImg         = document.getElementById('ref-img');
const canvas         = document.getElementById('drawing-canvas');
const ctx            = canvas.getContext('2d');
const swatches       = document.querySelectorAll('.swatch');
const slider         = document.getElementById('brush-size-slider');
const brushDot       = document.getElementById('brush-dot');
const clearBtn       = document.getElementById('clear-btn');
const exportBtn      = document.getElementById('export-btn');
const savePngBtn     = document.getElementById('save-png-btn');
const bwBtn          = document.getElementById('bw-btn');
const blurSlider     = document.getElementById('blur-slider');
const blurValue      = document.getElementById('blur-value');
const refToolbar     = document.getElementById('ref-toolbar');
const cursorRing     = document.getElementById('cursor-ring');

// ── State ─────────────────────────────────────────────────────────────────
let currentColor = '0,0,0';
let brushSize    = parseInt(slider.value, 10);
let isDrawing    = false;
let lastX        = null;
let lastY        = null;
let bwActive     = false;
let blurAmount   = 0;

// ── Helpers ───────────────────────────────────────────────────────────────
function updateBrushPreview() {
  const capped = Math.min(brushSize, 100);
  brushDot.style.width  = capped + 'px';
  brushDot.style.height = capped + 'px';
}

function updateCursorRing(x, y) {
  cursorRing.style.width  = brushSize + 'px';
  cursorRing.style.height = brushSize + 'px';
  cursorRing.style.left   = x + 'px';
  cursorRing.style.top    = y + 'px';
}

function updateRefFilter() {
  const parts = [];
  if (bwActive)       parts.push('grayscale(100%)');
  if (blurAmount > 0) parts.push(`blur(${blurAmount}px)`);
  refImg.style.filter = parts.join(' ');
}

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  // Scale from display size to actual canvas pixel size
  const scaleX = canvas.width  / rect.width;
  const scaleY = canvas.height / rect.height;
  return [
    (clientX - rect.left) * scaleX,
    (clientY - rect.top)  * scaleY,
  ];
}

function drawStroke(x, y) {
  ctx.fillStyle = `rgb(${currentColor})`;
  ctx.beginPath();
  ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
  ctx.fill();

  // Connect to last point to avoid gaps
  if (lastX !== null) {
    ctx.strokeStyle = `rgb(${currentColor})`;
    ctx.lineWidth   = brushSize;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  lastX = x;
  lastY = y;
}

const CANVAS_BG = 'rgb(125, 125, 125)';

function clearCanvas() {
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  recorder.clear();
}

// ── Image loading ─────────────────────────────────────────────────────────
const MAX_SIDE = 500; // max px for the longer side of both images

// Persisted across resize events
let currentDispW  = 0;
let imageIsLandscape = true;

function updateStageLayout() {
  // Body has 16px padding on each side; stage has a 16px gap between panels
  const availableW      = window.innerWidth - 32;
  const sideBySideW     = currentDispW * 2 + 16;
  const windowTooNarrow = sideBySideW > availableW;
  const useSideBySide   = !imageIsLandscape && !windowTooNarrow;

  // Side-by-side only when the image is portrait AND the window is wide enough
  stage.style.flexDirection = useSideBySide ? 'row' : 'column';

  // Row layout: toolbar sits below the image (natural DOM order)
  // Column layout: toolbar floats above the image (order: -1)
  refToolbar.style.order = useSideBySide ? '0' : '-1';
}

function setupStage(imgElement) {
  const naturalW = imgElement.naturalWidth;
  const naturalH = imgElement.naturalHeight;
  const scale    = Math.min(1, MAX_SIDE / Math.max(naturalW, naturalH));
  const dispW    = Math.round(naturalW * scale);
  const dispH    = Math.round(naturalH * scale);

  // Reference image display size
  refImg.style.width  = dispW + 'px';
  refImg.style.height = dispH + 'px';

  // Pin container widths so sub-toolbars match image/canvas exactly
  refContainer.style.width    = dispW + 'px';
  canvasContainer.style.width = dispW + 'px';

  // Canvas = same display size and same internal resolution
  canvas.width  = dispW;
  canvas.height = dispH;
  canvas.style.width  = dispW + 'px';
  canvas.style.height = dispH + 'px';

  // Store for resize handler, then compute initial layout
  currentDispW     = dispW;
  imageIsLandscape = naturalW >= naturalH;
  updateStageLayout();

  clearCanvas();
  stage.style.display = 'flex';
  hint.style.display  = 'none';
}

function loadImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  refImg.onload = () => {
    setupStage(refImg);
    recorder.start(file.name, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
  };
  refImg.src = url;
}

fileInput.addEventListener('change', e => {
  loadImageFile(e.target.files[0]);
});

// Re-evaluate side-by-side vs stacked when the window is resized
window.addEventListener('resize', updateStageLayout);

// Drag-and-drop on the whole page
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  loadImageFile(e.dataTransfer.files[0]);
});

// ── B&W toggle ────────────────────────────────────────────────────────────
bwBtn.addEventListener('click', () => {
  bwActive = !bwActive;
  bwBtn.classList.toggle('active', bwActive);
  bwBtn.textContent = bwActive ? 'Color' : 'B&W';
  updateRefFilter();
  recorder.bwToggle(bwActive);
});

// ── Blur ──────────────────────────────────────────────────────────────────
blurSlider.addEventListener('input', () => {
  blurAmount = parseInt(blurSlider.value, 10);
  blurValue.textContent = blurAmount === 0 ? 'Off' : `${blurAmount}px`;
  updateRefFilter();
  recorder.blurChange(blurAmount);
});

// ── Color selection ───────────────────────────────────────────────────────
swatches.forEach(swatch => {
  swatch.addEventListener('click', () => {
    swatches.forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    currentColor = swatch.dataset.color;
    recorder.colorChange(currentColor);
    // Update cursor ring color to give feedback on dark vs light
    cursorRing.style.borderColor = `rgb(${currentColor === '0,0,0' ? '180,180,180' : '80,80,80'})`;
  });
});

// ── Brush size ────────────────────────────────────────────────────────────
slider.addEventListener('input', () => {
  brushSize = parseInt(slider.value, 10);
  updateBrushPreview();
  cursorRing.style.width  = brushSize + 'px';
  cursorRing.style.height = brushSize + 'px';
  recorder.brushResize(brushSize);
});
updateBrushPreview();

// ── Clear ─────────────────────────────────────────────────────────────────
clearBtn?.addEventListener('click', clearCanvas);

// ── Save PNG ──────────────────────────────────────────────────────────────
savePngBtn.addEventListener('click', () => {
  const a    = document.createElement('a');
  const stem = (recorder.isActive() ? recorder.currentFileName() : 'canvas')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]/gi, '_');
  a.href     = canvas.toDataURL('image/png');
  a.download = `${stem}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  a.click();
});

// ── Export JSON ───────────────────────────────────────────────────────────
exportBtn.addEventListener('click', () => recorder.exportJSON());

// ── Drawing events (mouse) ────────────────────────────────────────────────
canvas.addEventListener('mouseenter', () => {
  cursorRing.style.display = 'block';
});
canvas.addEventListener('mouseleave', () => {
  cursorRing.style.display = 'none';
  if (isDrawing) recorder.strokeEnd();
  isDrawing = false;
  lastX = lastY = null;
});
canvas.addEventListener('mousemove', e => {
  updateCursorRing(e.clientX, e.clientY);
  if (!isDrawing) return;
  const [x, y] = canvasPos(e);
  drawStroke(x, y);
  recorder.strokePoint(x, y);
});
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  isDrawing = true;
  lastX = lastY = null;
  const [x, y] = canvasPos(e);
  drawStroke(x, y);
  recorder.strokeStart(x, y, brushSize, currentColor);
});
canvas.addEventListener('mouseup', () => {
  if (isDrawing) recorder.strokeEnd();
  isDrawing = false;
  lastX = lastY = null;
});

// Prevent accidental drag of the canvas element
canvas.addEventListener('dragstart', e => e.preventDefault());

// ── Drawing events (touch) ────────────────────────────────────────────────
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  isDrawing = true;
  lastX = lastY = null;
  const [x, y] = canvasPos(e);
  drawStroke(x, y);
  recorder.strokeStart(x, y, brushSize, currentColor);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (!isDrawing) return;
  const [x, y] = canvasPos(e);
  drawStroke(x, y);
  recorder.strokePoint(x, y);
}, { passive: false });
canvas.addEventListener('touchend', () => {
  if (isDrawing) recorder.strokeEnd();
  isDrawing = false;
  lastX = lastY = null;
});
