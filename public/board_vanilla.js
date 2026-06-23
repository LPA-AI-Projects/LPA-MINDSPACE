
'use strict';
// ═══════════════════════════════════════════════════
// CORE STATE
// ═══════════════════════════════════════════════════
const state = {
  tool: 'hand',
  zoom: 1,
  panX: 0,
  panY: 0,
  gridVisible: true,
  objects: [],       // all canvas objects
  history: [],
  historyIdx: -1,
  isPanning: false,
  isSpaceDown: false,
  prevTool: 'hand',
  mouseX: 0,
  mouseY: 0,
  boardName: 'Untitled Board',
};

const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;
const ZOOM_STEP = 0.12;
const GRID_BASE = 28; // px at zoom=1

// ═══════════════════════════════════════════════════
// DOM REFS (refreshed when React remounts board HTML)
// ═══════════════════════════════════════════════════
let canvasRoot = null;
let canvasWorld = null;

function bindBoardDom() {
  const mount = document.querySelector('.board-shell');
  const root = mount?.querySelector('#canvas-root') || document.getElementById('canvas-root');
  const world = mount?.querySelector('#canvas-world') || document.getElementById('canvas-world');
  canvasRoot = root;
  canvasWorld = world;
  return !!(root && world && root.isConnected && world.isConnected);
}

/** Keep the full-screen canvas on document.body so fixed positioning is reliable. */
function ensureCanvasMountedOnBody() {
  if (!bindBoardDom()) return false;
  document.querySelectorAll('#canvas-root').forEach((node) => {
    if (node !== canvasRoot) node.remove();
  });
  if (canvasRoot.parentElement !== document.body) {
    document.body.appendChild(canvasRoot);
  }
  return bindBoardDom();
}

function appendToCanvasWorld(el) {
  if (!el) return null;
  ensureCanvasMountedOnBody();
  if (!canvasWorld) return null;
  canvasWorld.appendChild(el);
  return el;
}

function isEventOnCanvas(e) {
  if (!bindBoardDom()) return false;
  const t = e.target;
  if (t === canvasRoot || canvasRoot.contains(t)) return true;
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  return !!(hit && (hit === canvasRoot || canvasRoot.contains(hit)));
}

let zoomLabel = null;
let sbX = null;
let sbY = null;
let sbTool = null;
let sbObjects = null;
let ctxHint = null;
let eraserCursor = null;
let selRect = null;

function bindUiDom() {
  zoomLabel = document.getElementById('zoomLabel');
  sbX = document.getElementById('sb-x');
  sbY = document.getElementById('sb-y');
  sbTool = document.getElementById('sb-tool');
  sbObjects = document.getElementById('sb-objects');
  ctxHint = document.getElementById('ctx-hint');
  eraserCursor = document.getElementById('eraser-cursor');
  selRect = document.getElementById('sel-rect');
}

/** Paint state.objects onto the live canvas; retries until #canvas-world is mounted. */
function scheduleBoardRedraw(maxAttempts = 300) {
  let finished = false;
  const attempt = (tries = 0) => {
    if (finished) return;
    if (!ensureCanvasMountedOnBody()) {
      if (tries < maxAttempts) requestAnimationFrame(() => attempt(tries + 1));
      else console.warn('[board] canvas not ready after retries');
      return;
    }
    try {
      redrawAll();
      updateObjectCount();
      finished = true;
      console.info('[board] painted', state.objects.length, 'objects,', canvasWorld?.childElementCount, 'dom nodes');
    } catch (err) {
      console.error('[board] redraw failed', err);
      if (tries < maxAttempts) requestAnimationFrame(() => attempt(tries + 1));
    }
  };
  attempt();
  // Fallback for slow mounts / production cold starts
  setTimeout(() => {
    if (finished || !state.objects.length) return;
    if (!ensureCanvasMountedOnBody()) return;
    try {
      redrawAll();
      updateObjectCount();
      finished = true;
      console.info('[board] painted (fallback)', state.objects.length, 'objects');
    } catch (err) {
      console.error('[board] redraw fallback failed', err);
    }
  }, 2500);
}

function normalizeObjectsList(objects) {
  if (Array.isArray(objects)) return objects;
  if (objects && typeof objects === 'object') return Object.values(objects);
  return [];
}

function normalizeBoardStateData(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.state && typeof data.state === 'object' && !Array.isArray(data.objects)) {
    const inner = data.state;
    return {
      boardName: inner.boardName || data.boardName,
      panX: inner.panX ?? data.panX,
      panY: inner.panY ?? data.panY,
      zoom: inner.zoom ?? data.zoom,
      objects: inner.objects ?? data.objects,
      sharing: inner.sharing ?? data.sharing,
    };
  }
  return data;
}

function parseBoardStateRaw(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return normalizeBoardStateData(raw);
  let data = JSON.parse(raw);
  if (typeof data === 'string') data = JSON.parse(data);
  return normalizeBoardStateData(data);
}

let lastPinchDist = null;
let canvasEventsReady = false;

function ensureCanvasEvents() {
  if (canvasEventsReady) return;
  canvasEventsReady = true;

  document.addEventListener('mousedown', (e) => {
    if (!isEventOnCanvas(e)) return;
    handleCanvasPointerDown(e);
  }, true);

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    if (!isEventOnCanvas(e)) return;
    handleCanvasPointerDown(e);
  }, true);

  document.addEventListener('contextmenu', (e) => {
    if (!isEventOnCanvas(e)) return;
    e.preventDefault();
    showContextMenu(e);
  }, true);

  document.addEventListener('wheel', (e) => {
    if (!isEventOnCanvas(e)) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1 / (1 + ZOOM_STEP) : (1 + ZOOM_STEP);
    zoomTo(state.zoom * factor, e.clientX, e.clientY);
  }, { capture: true, passive: false });

  document.addEventListener('touchmove', (e) => {
    if (!isEventOnCanvas(e)) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist) {
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        zoomTo(state.zoom * dist / lastPinchDist, cx, cy);
      }
      lastPinchDist = dist;
    }
  }, { capture: true, passive: false });

  document.addEventListener('touchend', () => { lastPinchDist = null; }, true);
}

bindBoardDom();
bindUiDom();
const boardAccess = window.boardAccess || {};
let realtimeClientId = `${boardAccess.userId || 'anon'}:${Math.random().toString(36).slice(2, 10)}`;
let presenceChannel = null;
let presenceUsers = [];
let boardSyncChannel = null;
let boardSyncChannelReady = false;
let lastPublishedBoardState = null;
const remoteCollabClients = new Map();
let collabPresenceHeartbeat = null;
let sessionRoster = [];
let activityPanelOpen = false;
let followClientId = null;
let activityHeartbeatTimer = null;
let activityPanelRefreshTimer = null;
let activityRosterChannel = null;
let lastPresenceCursorX = null;
let lastPresenceCursorY = null;
let viewportPresenceTimer = null;

function canEditBoardNow() {
  return getLiveBoardAccess().canEdit !== false;
}

/** This script loads dynamically after login; DOMContentLoaded may have already fired. */
function whenDomReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    try {
      fn();
    } catch (e) {
      console.error('whenDomReady', e);
    }
  }
}

function isReadOnlyMode() {
  return !canEditBoardNow();
}

function getLiveBoardAccess() {
  return window.boardAccess || boardAccess;
}

function isFacilitator() {
  const access = getLiveBoardAccess();
  if (!access.sessionId) return true;
  return access.role === 'facilitator';
}

function isParticipant() {
  const access = getLiveBoardAccess();
  return !!access.sessionId && access.role === 'participant';
}

function objectOwnerId(obj) {
  return obj?.ownerId || null;
}

function isUnownedObject(obj) {
  return !objectOwnerId(obj);
}

function canEditObject(obj) {
  if (!obj || isReadOnlyMode()) return false;
  if (isFacilitator()) return true;
  if (isUnownedObject(obj)) return false;
  return objectOwnerId(obj) === getLiveBoardAccess().userId;
}

function canSelectObjectForEdit(obj) {
  return canEditObject(obj);
}

function stampOwner(obj) {
  if (!obj || obj.ownerId) return obj;
  const userId = getLiveBoardAccess().userId;
  if (userId) obj.ownerId = userId;
  return obj;
}

function notifyNotYourWork() {
  showToast('Not your work');
}

function guardEditObject(obj) {
  if (canEditObject(obj)) return true;
  notifyNotYourWork();
  return false;
}

let objectCopyClipboard = [];

function cloneObjectWithNewOwner(obj, offsetX = 20, offsetY = 20) {
  const copy = { ...obj, id: uid(), ownerId: getLiveBoardAccess().userId };
  if (obj.x != null) copy.x = (obj.x || 0) + offsetX;
  if (obj.y != null) copy.y = (obj.y || 0) + offsetY;
  if (obj.x2 !== undefined) {
    copy.x2 = (obj.x2 || 0) + offsetX;
    copy.y2 = (obj.y2 || 0) + offsetY;
  }
  if (obj.type === 'stroke' && obj.points) {
    copy.points = obj.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));
  }
  if (copy.zIndex == null && typeof nextZIndex === 'function') copy.zIndex = nextZIndex();
  return copy;
}

function copyObjectsToClipboard(ids) {
  objectCopyClipboard = ids
    .map((id) => state.objects.find((o) => o.id === id))
    .filter(Boolean)
    .map((obj) => JSON.parse(JSON.stringify(obj)));
}

function renderObjectFromData(obj) {
  if (obj.type === 'sticky') return renderStickyFromObj(obj);
  if (obj.type === 'text') return addTextToCanvas(obj);
  if (obj.type === 'shape') return renderShapeObj(obj);
  if (obj.type === 'image') return renderImageObj(obj);
  if (obj.type === 'stroke') return addStrokeToSvg(getDrawingSvg(), obj);
  return null;
}

function pasteObjectsFromClipboard(offsetX = 24, offsetY = 24) {
  if (!objectCopyClipboard.length) {
    showToast('Nothing to paste');
    return [];
  }
  const pasted = [];
  objectCopyClipboard.forEach((template, index) => {
    const copy = cloneObjectWithNewOwner(template, offsetX + index * 12, offsetY + index * 12);
    state.objects.push(copy);
    renderObjectFromData(copy);
    pasted.push(copy);
  });
  updateObjectCount();
  History.push();
  saveToStorage();
  return pasted;
}

function isBoardAdmin() {
  return isFacilitator();
}

// ═══════════════════════════════════════════════════
// TRANSFORM
// ═══════════════════════════════════════════════════
function applyTransform() {
  bindBoardDom();
  if (!canvasWorld) return;
  const zoom = Number.isFinite(state.zoom) && state.zoom > 0 ? state.zoom : 1;
  state.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
  canvasWorld.style.transform =
    `translate(${state.panX}px,${state.panY}px) scale(${state.zoom})`;
  updateGrid();
  updateZoomLabel();
}

function updateGrid() {
  bindBoardDom();
  if (!canvasRoot) return;
  const gs = GRID_BASE * state.zoom;
  const ox = ((state.panX % gs) + gs) % gs;
  const oy = ((state.panY % gs) + gs) % gs;
  canvasRoot.style.setProperty('--dot-ox', ox + 'px');
  canvasRoot.style.setProperty('--dot-oy', oy + 'px');
  // scale dot size slightly with zoom for clarity
  const dotSize = Math.max(0.8, Math.min(1.8, state.zoom * 1.2));
  canvasRoot.style.backgroundSize = gs + 'px ' + gs + 'px';
  // fade grid at very low zoom
  const opacity = state.zoom < 0.25 ? 0 : state.zoom < 0.5 ? (state.zoom - 0.25) * 4 : 1;
  canvasRoot.style.setProperty('--dot-opacity', opacity);
}

function updateZoomLabel() {
  if (zoomLabel) zoomLabel.textContent = Math.round(state.zoom * 100) + '%';
}

// ── Floating panel placement (avoid topbar, AI bar, and other toolbars)
const FLOAT_UI_MARGIN = 8;
const FLOAT_UI_GAP = 10;
const TOPBAR_CLEARANCE = 58;

function isFloatingPanelVisible(el, id) {
  if (!el) return false;
  if (id === 'sel-ai-popup') return el.style.display === 'block';
  if (id === 'sel-toolbar') return el.classList.contains('visible');
  if (['shape-toolbar', 'text-toolbar', 'image-toolbar'].includes(id)) {
    return el.classList.contains('visible');
  }
  return true;
}

function getFloatingUiObstacleRects(excludeIds = []) {
  const rects = [];
  const topbar = document.getElementById('topbar');
  if (topbar) rects.push(topbar.getBoundingClientRect());

  ['ai-bar', 'sel-toolbar', 'shape-toolbar', 'text-toolbar', 'image-toolbar', 'sel-ai-popup'].forEach((id) => {
    if (excludeIds.includes(id)) return;
    const el = document.getElementById(id);
    if (!el || !isFloatingPanelVisible(el, id)) return;
    rects.push(el.getBoundingClientRect());
  });
  return rects;
}

function floatingRectsOverlap(a, b, pad = 8) {
  return a.left - pad < b.right + pad
    && a.right + pad > b.left - pad
    && a.top - pad < b.bottom + pad
    && a.bottom + pad > b.top - pad;
}

function clampFloatingPanelPos(top, left, width, height) {
  return {
    top: Math.max(TOPBAR_CLEARANCE, Math.min(top, window.innerHeight - height - FLOAT_UI_MARGIN)),
    left: Math.max(FLOAT_UI_MARGIN, Math.min(left, window.innerWidth - width - FLOAT_UI_MARGIN)),
  };
}

function positionFloatingPanel(el, { anchorRect, excludeIds = [] }) {
  if (!el || !anchorRect) return;
  const width = el.offsetWidth || 200;
  const height = el.offsetHeight || 40;
  const centerLeft = anchorRect.left + anchorRect.width / 2 - width / 2;
  const candidates = [
    { top: anchorRect.bottom + FLOAT_UI_GAP, left: centerLeft },
    { top: anchorRect.top - height - FLOAT_UI_GAP, left: centerLeft },
    { top: anchorRect.bottom + FLOAT_UI_GAP, left: anchorRect.left },
    { top: anchorRect.top - height - FLOAT_UI_GAP, left: anchorRect.right - width },
  ];
  const obstacles = getFloatingUiObstacleRects(excludeIds);

  for (const candidate of candidates) {
    const pos = clampFloatingPanelPos(candidate.top, candidate.left, width, height);
    const rect = {
      top: pos.top,
      left: pos.left,
      right: pos.left + width,
      bottom: pos.top + height,
    };
    if (!obstacles.some((o) => floatingRectsOverlap(rect, o))) {
      el.style.top = `${Math.round(pos.top)}px`;
      el.style.left = `${Math.round(pos.left)}px`;
      return;
    }
  }

  const fallback = clampFloatingPanelPos(anchorRect.bottom + FLOAT_UI_GAP, centerLeft, width, height);
  el.style.top = `${Math.round(fallback.top)}px`;
  el.style.left = `${Math.round(fallback.left)}px`;
}

function getActiveSelectionToolbarEl() {
  for (const id of ['text-toolbar', 'shape-toolbar', 'image-toolbar', 'sel-toolbar']) {
    const el = document.getElementById(id);
    if (!el || !isFloatingPanelVisible(el, id)) continue;
    return el;
  }
  return null;
}

function shouldHideSelToolbarForTypeToolbar() {
  if (selectedIds.size !== 1) return false;
  const obj = state.objects.find((o) => o.id === [...selectedIds][0]);
  return !!obj && ['text', 'shape', 'image'].includes(obj.type);
}

function repositionSelectionAiPopup() {
  const popup = document.getElementById('sel-ai-popup');
  const anchorEl = getActiveSelectionToolbarEl();
  if (!popup || popup.style.display !== 'block' || !anchorEl) return;
  positionFloatingPanel(popup, {
    anchorRect: anchorEl.getBoundingClientRect(),
    excludeIds: ['sel-ai-popup'],
  });
}

// ═══════════════════════════════════════════════════
// ZOOM
// ═══════════════════════════════════════════════════
function zoomTo(newZoom, cx, cy) {
  // cx, cy = screen pivot point (defaults to center)
  if (cx === undefined) {
    cx = window.innerWidth / 2;
    cy = window.innerHeight / 2;
  }
  newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, newZoom));
  const ratio = newZoom / state.zoom;
  state.panX = cx - ratio * (cx - state.panX);
  state.panY = cy - ratio * (cy - state.panY);
  state.zoom = newZoom;
  applyTransform();
  breakFollowOnUserViewportChange();
  scheduleViewportPresencePublish();
}

function zoomIn()  { zoomTo(state.zoom * (1 + ZOOM_STEP)); }
function zoomOut() { zoomTo(state.zoom / (1 + ZOOM_STEP)); }
function resetZoom() { zoomTo(1); }

function fitAll() {
  fitObjectsInView(null); // null = fit all objects
}

function fitObjectsInView(ids) {
  // ids = array of object ids to fit, null = all objects
  const targets = ids
    ? state.objects.filter(o => ids.includes(o.id))
    : state.objects;

  if (targets.length === 0) {
    state.panX = 0; state.panY = 0; state.zoom = 1;
    applyTransform();
    showToast('Nothing to fit');
    return;
  }

  // compute bounding box
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
  targets.forEach(obj => {
    if (obj.type === 'stroke') {
      obj.points.forEach(p => {
        minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
        maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
      });
    } else if (obj.type === 'shape' && (obj.shapeType==='arrow'||obj.shapeType==='line')) {
      minX=Math.min(minX,obj.x,obj.x2||0); minY=Math.min(minY,obj.y,obj.y2||0);
      maxX=Math.max(maxX,obj.x,obj.x2||0); maxY=Math.max(maxY,obj.y,obj.y2||0);
    } else {
      // use DOM element size if available
      const sel = obj.type==='sticky' ? `.sticky-note[data-obj-id="${obj.id}"]`
                : obj.type==='text'   ? `.canvas-text[data-obj-id="${obj.id}"]`
                : obj.type==='image'  ? `.image-obj[data-obj-id="${obj.id}"]`
                : obj.type==='shape'  ? `.shape-obj[data-obj-id="${obj.id}"]`
                : null;
      const el = sel ? canvasWorld.querySelector(sel) : null;
      const w = el ? el.offsetWidth  / state.zoom : (obj.w||200);
      const h = el ? el.offsetHeight / state.zoom : (obj.h||100);
      minX=Math.min(minX,obj.x); minY=Math.min(minY,obj.y);
      maxX=Math.max(maxX,obj.x+w); maxY=Math.max(maxY,obj.y+h);
    }
  });

  if (!isFinite(minX)) { state.panX=0; state.panY=0; state.zoom=1; applyTransform(); return; }

  const PAD   = 60;
  const bw    = maxX - minX + PAD*2;
  const bh    = maxY - minY + PAD*2;
  const vw    = window.innerWidth;
  const vh    = window.innerHeight;
  const zoom  = Math.min(1.5, Math.min(vw/bw, vh/bh)); // cap at 150%

  state.zoom  = zoom;
  state.panX  = (vw - bw*zoom)/2 - (minX-PAD)*zoom;
  state.panY  = (vh - bh*zoom)/2 - (minY-PAD)*zoom;
  applyTransform();
}

// ═══════════════════════════════════════════════════
// PAN
// ═══════════════════════════════════════════════════
let panStart = null;
let nudgeTimer = null;

function startPan(e) {
  breakFollowOnUserViewportChange();
  state.isPanning = true;
  document.body.classList.add('panning');
  panStart = { x: e.clientX - state.panX, y: e.clientY - state.panY };
}

function doPan(e) {
  if (!state.isPanning || !panStart) return;
  state.panX = e.clientX - panStart.x;
  state.panY = e.clientY - panStart.y;
  applyTransform();
}

function endPan() {
  state.isPanning = false;
  document.body.classList.remove('panning');
  panStart = null;
  breakFollowOnUserViewportChange();
  scheduleViewportPresencePublish();
}

// ═══════════════════════════════════════════════════
// COORDINATE UTILS
// ═══════════════════════════════════════════════════
function screenToWorld(sx, sy) {
  return {
    x: (sx - state.panX) / state.zoom,
    y: (sy - state.panY) / state.zoom,
  };
}

function worldToScreen(wx, wy) {
  return {
    x: wx * state.zoom + state.panX,
    y: wy * state.zoom + state.panY,
  };
}

// ═══════════════════════════════════════════════════
// TOOL SYSTEM
// ═══════════════════════════════════════════════════
const TOOL_HINTS = {
  hand:   'Drag to pan · Scroll to zoom',
  select: 'Click to select · Drag to box-select',
  pen:    'Click and drag to draw freely',
  text:   'Click anywhere to add text',
  eraser: 'Drag over strokes to erase',
  sticky: 'Click to place a sticky note · right-click for options',
  shape:  'Click and drag to draw a shape · hold Shift to constrain',
  image:  'Click to pick a file · drag & drop an image · or press Ctrl+V to paste',
};

function setTool(tool) {
  if (isReadOnlyMode() && tool !== 'hand') {
    showToast('View-only link: editing disabled');
    tool = 'hand';
  }
  // deactivate old
  const prev = document.querySelector('.tool-btn.active');
  if (prev) prev.classList.remove('active');

  state.prevTool = state.tool;
  state.tool = tool;

  // activate new
  const btn = document.getElementById('tool-' + tool);
  if (btn) btn.classList.add('active');

  // show/hide shape picker
  const shapePicker = document.getElementById('shape-picker');
  if (shapePicker) shapePicker.classList.toggle('visible', tool === 'shape');

  // show/hide pen toolbar
  const penToolbar = document.getElementById('pen-toolbar');
  if (penToolbar) penToolbar.classList.toggle('visible', tool === 'pen');

  // image tool: open file picker immediately on tool activation (clean user gesture)
  if (tool === 'image') {
    setTimeout(() => triggerImageFilePicker(), 0);
    return; // don't change tool yet — picker callback will switch to select
  }

  // cursor class on body
  document.body.className = 'tool-' + tool;

  // update status bar
  if (sbTool) sbTool.textContent = tool;

  // context hint
  showHint(TOOL_HINTS[tool] || '');
}

function showHint(msg) {
  if (!ctxHint) return;
  ctxHint.textContent = msg;
  ctxHint.classList.add('show');
  clearTimeout(ctxHint._timer);
  ctxHint._timer = setTimeout(() => ctxHint.classList.remove('show'), 3000);
}

// ═══════════════════════════════════════════════════
// CANVAS MOUSE EVENTS
// ═══════════════════════════════════════════════════
function handleCanvasPointerDown(e) {
  if (e.button !== 0) return;
  if (typeof e.isPrimary === 'boolean' && !e.isPrimary) return;
  e.preventDefault();

  const tool = state.tool;

  if (tool === 'hand' || state.isSpaceDown) {
    startPan(e);
    return;
  }

  if (tool === 'select') {
    handleSelectMousedown(e);
    return;
  }

  if (tool === 'pen') {
    startStroke(e);
    return;
  }

  if (tool === 'text') {
    const el = e.target instanceof Element ? e.target : null;
    if (el?.closest('.canvas-text')) return;
    placeText(e);
    return;
  }

  if (tool === 'eraser') {
    startErase(e);
    return;
  }

  if (tool === 'sticky') {
    placeSticky(e);
    return;
  }

  if (tool === 'shape') {
    startShapeDraw(e);
    return;
  }
  if (tool === 'image') {
    // file picker already triggered by setTool — clicking canvas is a no-op
    return;
  }
}

function updateEraserCursor(clientX, clientY) {
  if (!eraserCursor) return;
  eraserCursor.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) translate(-50%, -50%)`;
}

// document-level so fast mouse movement outside canvas still works
document.addEventListener('mousemove', e => {
  if (state.tool === 'eraser') updateEraserCursor(e.clientX, e.clientY);

  const wp = screenToWorld(e.clientX, e.clientY);
  state.mouseX = Math.round(wp.x);
  state.mouseY = Math.round(wp.y);
  if (sbX) sbX.textContent = state.mouseX;
  if (sbY) sbY.textContent = state.mouseY;

  if (state.isPanning) { doPan(e); return; }
  if (state.isDrawing) { continueStroke(e); return; }
  if (state.isErasing) { continueErase(e); return; }
  if (state.isShaping) { continueShapeDraw(e); return; }
});

document.addEventListener('pointermove', e => {
  if (state.tool === 'eraser') updateEraserCursor(e.clientX, e.clientY);
  if (e.pointerType === 'mouse') return;
  if (state.isDrawing) { continueStroke(e); return; }
  if (state.isErasing) { continueErase(e); return; }
}, { passive: true });

// document-level so mouseup is caught even if released outside canvas
document.addEventListener('mouseup', e => {
  if (state.isPanning) { endPan(); return; }
  if (state.isDrawing) { endStroke(e); return; }
  if (state.isErasing) { endErase(e); return; }
  if (state.isShaping) { endShapeDraw(e); return; }
});

document.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse') return;
  if (state.isPanning) { endPan(); return; }
  if (state.isDrawing) { endStroke(e); return; }
  if (state.isErasing) { endErase(e); return; }
  if (state.isShaping) { endShapeDraw(e); return; }
});

// ═══════════════════════════════════════════════════
// PEN STATE (must be before stroke drawing — used by startStroke)
// ═══════════════════════════════════════════════════
const PEN_COLORS = [
  { name:'black',   hex:'#141414' },
  { name:'white',   hex:'#fbfbfb' },
  { name:'teal',    hex:'#2e9d91' },
  { name:'orange',  hex:'#f2541d' },
  { name:'blue',    hex:'#4f71f2' },
];

const penState = {
  color:   '#141414',
  width:   2.5,
  opacity: 1,
};

function configureStrokePath(pathEl, props) {
  pathEl.setAttribute('fill', 'none');
  pathEl.setAttribute('stroke', props.color || '#141414');
  pathEl.setAttribute('stroke-width', props.width ?? 2.5);
  pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
  pathEl.setAttribute('stroke-linecap', 'round');
  pathEl.setAttribute('stroke-linejoin', 'round');
  pathEl.setAttribute('opacity', props.opacity !== undefined ? props.opacity : 1);
}

// ═══════════════════════════════════════════════════
// FREEHAND DRAWING (Pen tool)
// ═══════════════════════════════════════════════════
let currentPath = null;
let currentSvg  = null;
let currentPoints = [];
let strokeSvgEl = null;

state.isDrawing = false;
state.isErasing = false;

function getDrawingSvg() {
  ensureCanvasMountedOnBody();
  if (!canvasWorld) return null;
  let svg = document.getElementById('drawing-layer');
  if (svg && !svg.isConnected) {
    svg.remove();
    svg = null;
  }
  if (svg && svg.parentElement !== canvasWorld) {
    svg.remove();
    svg = null;
  }
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'drawing-layer';
    svg.style.cssText = 'position:absolute;top:0;left:0;width:200vw;height:200vh;overflow:visible;z-index:5;pointer-events:none;';
    appendToCanvasWorld(svg);
  }
  return svg;
}

function startStroke(e) {
  e.preventDefault();
  state.isDrawing = true;
  currentPoints = [];
  const wp = screenToWorld(e.clientX, e.clientY);
  currentPoints.push(wp);

  const svg = getDrawingSvg();
  if (!svg) return;
  strokeSvgEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  configureStrokePath(strokeSvgEl, penState);
  strokeSvgEl.setAttribute('pointer-events', 'stroke');
  strokeSvgEl.style.cursor = 'pointer';
  svg.appendChild(strokeSvgEl);
}

function continueStroke(e) {
  if (!state.isDrawing || !strokeSvgEl) return;
  const wp = screenToWorld(e.clientX, e.clientY);
  currentPoints.push(wp);
  strokeSvgEl.setAttribute('d', pointsToPath(currentPoints));
}

function endStroke() {
  if (!state.isDrawing) return;
  state.isDrawing = false;
  if (currentPoints.length < 2) {
    strokeSvgEl?.remove();
    return;
  }
  const obj = stampOwner({
    id: uid(),
    type: 'stroke',
    points: [...currentPoints],
    color: penState.color,
    width: penState.width,
    opacity: penState.opacity,
  });
  state.objects.push(obj);
  strokeSvgEl.remove();
  const pathEl = addStrokeToSvg(getDrawingSvg(), obj);
  updateObjectCount();
  History.push();
  saveToStorage();

  // ── Shape recognition: analyse and maybe show convert popup
  const recognized = recognizeShape(currentPoints);
  if (recognized) showConvertPopup(obj.id, recognized, pathEl);
}

function pointsToPath(pts) {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    if (i === 1) {
      d += ` L ${pts[i].x} ${pts[i].y}`;
    } else {
      const prev = pts[i - 1];
      const curr = pts[i];
      const mx = (prev.x + curr.x) / 2;
      const my = (prev.y + curr.y) / 2;
      d += ` Q ${prev.x} ${prev.y} ${mx} ${my}`;
    }
  }
  return d;
}

// ═══════════════════════════════════════════════════
// TEXT TOOL
// ═══════════════════════════════════════════════════
function placeText(e) {
  e.preventDefault();
  const wp = screenToWorld(e.clientX, e.clientY);

  // create obj immediately and render via addTextToCanvas
  // this ensures all new text nodes have handles from the start
  const obj = stampOwner({
    id: uid(),
    type: 'text',
    x: wp.x, y: wp.y,
    content: '',
    fontSize:   currentTextStyle.fontSize,
    fontWeight: currentTextStyle.fontWeight,
    fontStyle:  currentTextStyle.fontStyle,
    color:      currentTextStyle.color,
    w: null, h: null, // auto-size until resized
  });

  state.objects.push(obj);
  updateObjectCount();

  const wrap = addTextToCanvas(obj);

  // highlight border while editing
  wrap.style.border = '1.5px dashed rgba(79,113,242,0.5)';

  // enable editing immediately for new text
  const editable = wrap.querySelector('div');
  if (editable) {
    editable.contentEditable = 'true';
    editable.style.pointerEvents = '';
    editable.focus();
    // remove empty node on blur if no text was typed
    const onFirstBlur = () => {
      if (!obj.content.trim()) {
        wrap.remove();
        state.objects = state.objects.filter(o => o.id !== obj.id);
        updateObjectCount();
        return;
      }
      // save size
      obj.w = wrap.offsetWidth;
      obj.h = wrap.offsetHeight;
      wrap.style.border = '1.5px solid transparent';
      History.push();
      saveToStorage();
      editable.removeEventListener('blur', onFirstBlur);
    };
    editable.addEventListener('blur', onFirstBlur);
  }
}

// ═══════════════════════════════════════════════════
// ERASER TOOL
// ═══════════════════════════════════════════════════
state.isErasing = false;
let eraseRafId = null;
let erasePendingEvent = null;

function strokePointDistSq(px, py, x, y) {
  const dx = px - x;
  const dy = py - y;
  return dx * dx + dy * dy;
}

function strokeSegmentDistSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return strokePointDistSq(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return strokePointDistSq(px, py, cx, cy);
}

function strokeHitsEraser(points, wx, wy, radiusSq) {
  for (let i = 0; i < points.length; i += 1) {
    if (strokePointDistSq(wx, wy, points[i].x, points[i].y) < radiusSq) return true;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (strokeSegmentDistSq(wx, wy, p1.x, p1.y, p2.x, p2.y) < radiusSq) return true;
  }
  return false;
}

function markStrokePointsErased(points, wx, wy, radiusSq) {
  const erased = new Array(points.length).fill(false);
  for (let i = 0; i < points.length; i += 1) {
    if (strokePointDistSq(wx, wy, points[i].x, points[i].y) < radiusSq) {
      erased[i] = true;
    }
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (strokeSegmentDistSq(wx, wy, p1.x, p1.y, p2.x, p2.y) < radiusSq) {
      erased[i] = true;
      erased[i + 1] = true;
    }
  }
  return erased;
}

function splitStrokePoints(points, erased) {
  const segments = [];
  let current = [];
  for (let i = 0; i < points.length; i += 1) {
    if (!erased[i]) {
      current.push(points[i]);
    } else if (current.length) {
      if (current.length >= 2) segments.push(current);
      current = [];
    }
  }
  if (current.length >= 2) segments.push(current);
  return segments;
}

function makeStrokeFromSegment(points, template) {
  return stampOwner({
    id: uid(),
    type: 'stroke',
    points: points.map((p) => ({ x: p.x, y: p.y })),
    color: template.color,
    width: template.width,
    opacity: template.opacity,
  });
}

function applyPartialStrokeErase(wx, wy, radius) {
  const radiusSq = radius * radius;
  const svg = getDrawingSvg();
  const updates = [];

  state.objects.forEach((obj) => {
    if (obj.type !== 'stroke' || !canEditObject(obj) || !obj.points?.length) return;
    if (!strokeHitsEraser(obj.points, wx, wy, radiusSq)) return;

    const erased = markStrokePointsErased(obj.points, wx, wy, radiusSq);
    if (!erased.some(Boolean)) return;

    const segments = splitStrokePoints(obj.points, erased);
    const unchanged = segments.length === 1
      && segments[0].length === obj.points.length
      && segments[0].every((p, i) => p.x === obj.points[i].x && p.y === obj.points[i].y);
    if (unchanged) return;

    updates.push({ obj, segments });
  });

  if (!updates.length) return false;

  const removeIds = new Set(updates.map((entry) => entry.obj.id));
  const newStrokes = [];

  updates.forEach(({ obj, segments }) => {
    document.querySelector(`path[data-obj-id="${obj.id}"]`)?.remove();
    segments.forEach((pts) => {
      if (pts.length < 2) return;
      const stroke = makeStrokeFromSegment(pts, obj);
      newStrokes.push(stroke);
      addStrokeToSvg(svg, stroke);
    });
  });

  state.objects = state.objects.filter((o) => !removeIds.has(o.id)).concat(newStrokes);
  updateObjectCount();
  return true;
}

function startErase(e) {
  e.preventDefault();
  updateEraserCursor(e.clientX, e.clientY);
  state.isErasing = true;
  doErase(e);
}

function continueErase(e) {
  if (!state.isErasing) return;
  erasePendingEvent = e;
  if (eraseRafId) return;
  eraseRafId = requestAnimationFrame(() => {
    eraseRafId = null;
    const ev = erasePendingEvent;
    erasePendingEvent = null;
    if (state.isErasing && ev) doErase(ev);
  });
}

function doErase(e) {
  // Eraser radius in world-space units
  const RADIUS = 20 / state.zoom;

  // cursor position in world space
  const wx = (e.clientX - state.panX) / state.zoom;
  const wy = (e.clientY - state.panY) / state.zoom;

  if (applyPartialStrokeErase(wx, wy, RADIUS)) {
    state.erasedSomething = true;
  }

  // ── Erase text elements by hit-testing bounding box ──
  const texts = canvasWorld.querySelectorAll('.canvas-text');
  texts.forEach(el => {
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX <= r.right &&
        e.clientY >= r.top  && e.clientY <= r.bottom) {
      const id = el.dataset.objId;
      const obj = state.objects.find((o) => o.id === id);
      if (!obj || !canEditObject(obj)) return;
      el.remove();
      state.objects = state.objects.filter(o => o.id !== id);
      updateObjectCount();
      state.erasedSomething = true;
    }
  });
}

function endErase() {
  if (eraseRafId) {
    cancelAnimationFrame(eraseRafId);
    eraseRafId = null;
  }
  if (erasePendingEvent) {
    doErase(erasePendingEvent);
    erasePendingEvent = null;
  }
  if (state.isErasing && state.erasedSomething) {
    History.push(); // ← erase completed
    saveToStorage();
    state.erasedSomething = false;
  }
  state.isErasing = false;
}

// ═══════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════
const KEY_TOOLS = { h:'hand', v:'select', p:'pen', t:'text', e:'eraser', s:'sticky', r:'shape', i:'image' };

document.addEventListener('keydown', ev => {
  const tag = document.activeElement.tagName;
  const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement.isContentEditable;

  // space = temp pan
  if (ev.code === 'Space' && !isEditing) {
    ev.preventDefault();
    if (!state.isSpaceDown) {
      state.isSpaceDown = true;
      state.prevTool = state.tool;
      document.body.classList.add('tool-hand');
      canvasRoot.style.cursor = 'grab';
    }
    return;
  }

  if (isEditing) return;

  if (isReadOnlyMode()) {
    const blockedKeys = ['Delete', 'Backspace', 'z', 'Z', 'y', 'Y'];
    if (blockedKeys.includes(ev.key)) {
      ev.preventDefault();
      showToast('View-only link: editing disabled');
      return;
    }
  }

  // tool keys
  const toolKey = KEY_TOOLS[ev.key.toLowerCase()];
  if (toolKey) { setTool(toolKey); return; }


  // arrow key nudge — move selected objects
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(ev.key)) {
    if (selectedIds && selectedIds.size > 0) {
      ev.preventDefault();
      const step = ev.shiftKey ? 10 : 1; // shift = 10px, normal = 1px
      const dx = ev.key==='ArrowLeft' ? -step : ev.key==='ArrowRight' ? step : 0;
      const dy = ev.key==='ArrowUp'   ? -step : ev.key==='ArrowDown'  ? step : 0;

      selectedIds.forEach(id => {
        const obj = state.objects.find(o => o.id === id);
        if (!obj || obj.locked || !canEditObject(obj)) return;
        if (obj.type === 'stroke') {
          obj.points = obj.points.map(p => ({ x:p.x+dx, y:p.y+dy }));
          const pathEl = document.querySelector(`path[data-obj-id="${id}"]`);
          if (pathEl) pathEl.setAttribute('d', pointsToPath(obj.points));
        } else if (obj.type === 'shape' && (obj.shapeType==='arrow'||obj.shapeType==='line')) {
          obj.x  += dx; obj.y  += dy;
          obj.x2 += dx; obj.y2 += dy;
          const el = canvasWorld.querySelector(`[data-obj-id="${id}"]`);
          if (el) { el.style.left = (obj.x + Math.min(0,obj.x2-obj.x) - 10) + 'px';
                    el.style.top  = (obj.y + Math.min(0,obj.y2-obj.y) - 10) + 'px'; }
        } else {
          obj.x += dx; obj.y += dy;
          const el = canvasWorld.querySelector(`[data-obj-id="${id}"]`);
          if (el) { el.style.left = obj.x+'px'; el.style.top = obj.y+'px'; }
        }
      });
      // debounced history save
      clearTimeout(nudgeTimer);
      nudgeTimer = setTimeout(() => { History.push(); saveToStorage(); }, 400);
      scheduleMinimap();
      return;
    }
  }
  // zoom
  if (ev.key === '+' || ev.key === '=') { zoomIn(); return; }
  if (ev.key === '-') { zoomOut(); return; }
  if (ev.key === '0') { resetZoom(); return; }
  if (ev.key.toLowerCase() === 'f') {
    if (selectedIds && selectedIds.size > 0) {
      fitObjectsInView([...selectedIds]);
    } else {
      fitAll();
    }
    return;
  }
  if (ev.key.toLowerCase() === 'g') { toggleGrid(); return; }
  if (ev.key === '?') { showShortcuts(); return; }

  // undo / redo
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'z' && !ev.shiftKey) { undo(); return; }
  if ((ev.metaKey || ev.ctrlKey) && (ev.key === 'Z' || (ev.key === 'z' && ev.shiftKey) || ev.key === 'y')) { ev.preventDefault(); redo(); return; }

  // copy objects
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'c') {
    if (selectedIds.size > 0) {
      ev.preventDefault();
      copyObjectsToClipboard([...selectedIds]);
      showToast(`Copied ${objectCopyClipboard.length} object${objectCopyClipboard.length === 1 ? '' : 's'}`);
    }
    return;
  }

  // paste objects
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'v') {
    if (objectCopyClipboard.length > 0) {
      ev.preventDefault();
      const pasted = pasteObjectsFromClipboard();
      if (pasted.length) showToast(`Pasted ${pasted.length} object${pasted.length === 1 ? '' : 's'}`);
    }
    return;
  }

  // delete
  if (ev.key === 'Delete' || ev.key === 'Backspace') { deleteSelectedObj(); return; }

  // duplicate
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'd') { ev.preventDefault(); duplicateSelectedObj(); return; }
  // select all
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'a') { ev.preventDefault(); selectAll(); return; }

  // escape
  if (ev.key === 'Escape') { setTool('hand'); hideShortcuts(); return; }

  // export
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'e') { ev.preventDefault(); exportBoard(); return; }
});

document.addEventListener('keyup', ev => {
  if (ev.code === 'Space') {
    state.isSpaceDown = false;
    setTool(state.prevTool);
  }
});

// ═══════════════════════════════════════════════════
// HISTORY — simple, reliable, snapshot based
// ═══════════════════════════════════════════════════
const History = {
  stack: [],
  idx:   -1,

  // Take a clean snapshot of current objects array
  snapshot() {
    return JSON.stringify(state.objects);
  },

  // Push new state — called after EVERY completed user action
  push() {
    const snap = this.snapshot();
    // skip if identical to current
    if (this.idx >= 0 && this.stack[this.idx] === snap) return;
    // drop any redo states above current
    this.stack.length = this.idx + 1;
    this.stack.push(snap);
    if (this.stack.length > 60) {
      this.stack.shift();
    }
    this.idx = this.stack.length - 1;
  },

  // Set baseline (on load) — nothing to undo from here
  baseline() {
    this.stack = [this.snapshot()];
    this.idx   = 0;
  },

  undo() {
    if (this.idx <= 0) return false;
    this.idx--;
    state.objects = JSON.parse(this.stack[this.idx]);
    redrawAll();
    updateObjectCount();
    return true;
  },

  redo() {
    if (this.idx >= this.stack.length - 1) return false;
    this.idx++;
    state.objects = JSON.parse(this.stack[this.idx]);
    redrawAll();
    updateObjectCount();
    return true;
  },
};

// kept for compatibility — all callers use this
function saveToHistory() { History.push(); }

function undo() {
  if (!History.undo()) { showToast('Nothing to undo'); return; }
  showToast('Undo');
}

function redo() {
  if (!History.redo()) { showToast('Nothing to redo'); return; }
  showToast('Redo');
}

function redrawAll() {
  if (!ensureCanvasMountedOnBody() || !canvasWorld) return;

  // 1. clear selections safely
  if (typeof clearAllSelections === 'function') clearAllSelections();

  // 2. wipe entire DOM — remove SVG layer, texts, stickies
  const oldLayer = document.getElementById('drawing-layer');
  if (oldLayer) oldLayer.remove();
  canvasWorld.querySelectorAll('.canvas-text').forEach(el => el.remove());
  canvasWorld.querySelectorAll('.sticky-note').forEach(el => el.remove());
  canvasWorld.querySelectorAll('.shape-obj').forEach(el => el.remove());
  canvasWorld.querySelectorAll('.image-obj').forEach(el => el.remove());

  // 3. rebuild from state.objects
  const svg = getDrawingSvg();

  state.objects.forEach(obj => {
    if (obj.type === 'stroke') {
      addStrokeToSvg(svg, obj);
    } else if (obj.type === 'text') {
      addTextToCanvas(obj);
    } else if (obj.type === 'sticky') {
      if (typeof renderStickyFromObj === 'function') {
        const sEl = renderStickyFromObj(obj);
        if (obj.locked && sEl) {
          sEl.dataset.locked = '1';
          sEl.style.opacity = '0.6';
          const b = document.createElement('div');
          b.className = 'lock-badge';
          b.style.cssText = 'position:absolute;top:3px;left:3px;font-size:10px;pointer-events:none;z-index:200;';
          b.textContent = '🔒';
          sEl.appendChild(b);
        }
      }
    } else if (obj.type === 'shape') {
      const shEl = renderShapeObj(obj);
      if (obj.locked && shEl) applyLockStyle(shEl);
    } else if (obj.type === 'image') {
      const imEl = renderImageObj(obj);
      if (obj.locked && imEl) applyLockStyle(imEl);
    }
  });
}

// ── helpers so both redrawAll and new-object creation use the same code ──

function addStrokeToSvg(svg, obj) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  configureStrokePath(path, obj);
  path.setAttribute('pointer-events', 'stroke');
  path.setAttribute('d', pointsToPath(obj.points));
  path.dataset.objId = obj.id;
  path.style.cursor = 'pointer';
  path.addEventListener('mousedown', ev => {
    if (state.tool === 'select') {
      ev.stopPropagation();
      selectObject(obj.id, ev.ctrlKey || ev.metaKey);
      startObjDrag(ev, obj.id);
    }
  });
  svg.appendChild(path);
  return path;
}

function addTextToCanvas(obj) {
  bindBoardDom();
  if (!canvasWorld) return null;
  const wrap = document.createElement('div');
  wrap.className = 'canvas-text';
  wrap.dataset.objId = obj.id;

  // apply size — if w/h stored use them, else auto
  const hasSize = obj.w && obj.h;
  wrap.style.cssText = `
    position:absolute;
    left:${obj.x}px; top:${obj.y}px;
    ${hasSize ? `width:${obj.w}px;height:${obj.h}px;` : 'min-width:120px;min-height:28px;'}
    font-family:'Bricolage Grotesque',sans-serif;
    font-size:${obj.fontSize||18}px;
    font-weight:${obj.fontWeight||'500'};
    font-style:${obj.fontStyle||'normal'};
    color:${obj.color||'#141414'};
    background:transparent;
    border:1.5px solid transparent;
    outline:none; overflow:hidden;
    padding:3px 6px; cursor:text; z-index:10;
    box-sizing:border-box;
  `;

  // inner editable — not editable until double-clicked
  const editable = document.createElement('div');
  editable.contentEditable = 'false';
  editable.style.cssText = 'outline:none;width:100%;height:100%;min-height:1em;word-break:break-word;white-space:pre-wrap;pointer-events:none;';
  editable.textContent = obj.content || '';
  wrap.appendChild(editable);

  // ── 8 resize handles
  const HANDLES = [
    { pos:'tl', cur:'nwse-resize', css:'top:-5px;left:-5px;' },
    { pos:'tm', cur:'ns-resize',   css:'top:-5px;left:50%;transform:translateX(-50%);' },
    { pos:'tr', cur:'nesw-resize', css:'top:-5px;right:-5px;' },
    { pos:'ml', cur:'ew-resize',   css:'top:50%;left:-5px;transform:translateY(-50%);' },
    { pos:'mr', cur:'ew-resize',   css:'top:50%;right:-5px;transform:translateY(-50%);' },
    { pos:'bl', cur:'nesw-resize', css:'bottom:-5px;left:-5px;' },
    { pos:'bm', cur:'ns-resize',   css:'bottom:-5px;left:50%;transform:translateX(-50%);' },
    { pos:'br', cur:'nwse-resize', css:'bottom:-5px;right:-5px;' },
  ];

  HANDLES.forEach(h => {
    const rh = document.createElement('div');
    rh.className = 'text-resize-handle';
    rh.style.cssText = h.css + `cursor:${h.cur};position:absolute;`;
    wrap.appendChild(rh);

    rh.addEventListener('mousedown', ev => {
      ev.stopPropagation(); ev.preventDefault();
      if (!guardEditObject(obj)) return;
      // init size if not set
      if (!obj.w) obj.w = wrap.offsetWidth;
      if (!obj.h) obj.h = wrap.offsetHeight;
      const startX = ev.clientX, startY = ev.clientY;
      const origX = obj.x, origY = obj.y;
      const origW = obj.w, origH = obj.h;
      let didResize = false;

      function onMove(mv) {
        didResize = true;
        const dx = (mv.clientX - startX) / state.zoom;
        const dy = (mv.clientY - startY) / state.zoom;
        const pos = h.pos;
        if (pos.includes('r')) obj.w = Math.max(60, origW + dx);
        if (pos.includes('l')) { obj.w = Math.max(60, origW - dx); obj.x = origX + (origW - obj.w); }
        if (pos.includes('b')) obj.h = Math.max(24, origH + dy);
        if (pos === 'tm'||pos === 'tl'||pos === 'tr') {
          obj.h = Math.max(24, origH - dy);
          obj.y = origY + (origH - obj.h);
        }
        wrap.style.left   = obj.x + 'px'; wrap.style.top    = obj.y + 'px';
        wrap.style.width  = obj.w + 'px'; wrap.style.height = obj.h + 'px';
      }
      function onUp() {
        if (didResize) { History.push(); saveToStorage(); }
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  // stop propagation so canvas doesn't deselect
  wrap.addEventListener('mousedown', ev => {
    ev.stopPropagation();
    if (state.tool === 'select') {
      selectObject(obj.id, ev.ctrlKey || ev.metaKey);
      startObjDrag(ev, obj.id);
    }
  });

  // double-click to switch to text tool and edit
  wrap.addEventListener('dblclick', ev => {
    ev.stopPropagation();
    if (!guardEditObject(obj)) return;
    editable.contentEditable = 'true';
    editable.focus();
    // select all text
    try {
      const range = document.createRange();
      range.selectNodeContents(editable);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
    } catch(e) {}
  });

  editable.addEventListener('blur', () => {
    editable.contentEditable = 'false';
    editable.style.pointerEvents = 'none';
    if (!obj.w) obj.w = wrap.offsetWidth;
    if (!obj.h) obj.h = wrap.offsetHeight;
    const newText = editable.textContent;
    if (newText !== obj.content) {
      obj.content = newText;
      History.push(); saveToStorage();
    }
  });

  editable.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { editable.blur(); ev.preventDefault(); }
    ev.stopPropagation();
  });
  editable.addEventListener('mousedown', ev => ev.stopPropagation());

  appendToCanvasWorld(wrap);
  return wrap;
}

// ═══════════════════════════════════════════════════
// MISC ACTIONS
// ═══════════════════════════════════════════════════
function deleteSelected() {
  deleteSelectedObj();
}

function selectAll() {
  clearAllSelections();
  const editableObjects = state.objects.filter((obj) => canSelectObjectForEdit(obj));
  editableObjects.forEach(obj => {
    selectedIds.add(obj.id);
    // apply visual selection highlight per type
    const sticky = document.querySelector(`.sticky-note[data-obj-id="${obj.id}"]`);
    if (sticky) sticky.classList.add('selected');
    const shape = document.querySelector(`.shape-obj[data-obj-id="${obj.id}"]`);
    if (shape) shape.classList.add('selected-shape');
    const img = document.querySelector(`.image-obj[data-obj-id="${obj.id}"]`);
    if (img) img.classList.add('selected-image');
    const txt = document.querySelector(`.canvas-text[data-obj-id="${obj.id}"]`);
    if (txt) txt.style.border = '1.5px solid #2e9d91';
  });
  updateSelToolbar();
  showToast(`Selected ${editableObjects.length} object${editableObjects.length === 1 ? '' : 's'}`);
}

function updateGridToggleUi() {
  const btn = document.getElementById('gridToggle');
  if (!btn) return;
  btn.style.color = state.gridVisible ? 'var(--teal)' : '';
}

function toggleGrid() {
  state.gridVisible = !state.gridVisible;
  canvasRoot.style.backgroundImage = state.gridVisible
    ? 'radial-gradient(circle, var(--dot-color) 1.2px, transparent 1.2px)'
    : 'none';
  updateGridToggleUi();
  showToast(state.gridVisible ? 'Grid on' : 'Grid off');
}

function saveBoardName(val) {
  if (!isBoardAdmin()) return;
  state.boardName = val || 'LP MindSpace';
  document.title = state.boardName + ' — LP MindSpace';
  saveToStorage();
}

function updateObjectCount() {
  if (sbObjects) sbObjects.textContent = state.objects.length;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ═══════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════
function exportBoard() { showExportMenu(document.querySelector('[onclick="showExportMenu(this)"]')); }

function getSessionLink() {
  const access = getLiveBoardAccess();
  if (!access.sessionId) return null;
  return `${window.location.origin}/${encodeURIComponent(access.sessionId)}`;
}

function copySessionLink() {
  if (!isFacilitator()) {
    showToast('Only the facilitator can copy the session link');
    return;
  }
  const link = getSessionLink();
  if (!link) {
    showToast('Open a training session first');
    return;
  }
  copyText(link);
  showToast('Session link copied');
}

function updateFacilitatorUi() {
  const access = getLiveBoardAccess();
  const showSessionLink = isFacilitator() && !!access.sessionId && !!access.boardId;

  const sessionSection = document.getElementById('share-session-section');
  if (sessionSection) {
    sessionSection.classList.toggle('visible', showSessionLink);
  }

  const activityBtn = document.getElementById('activity-panel-btn');
  if (activityBtn) {
    activityBtn.classList.toggle('visible', !!access.sessionId);
  }
}

// ═══════════════════════════════════════════════════
// PARTICIPANT ACTIVITY PANEL (Phase 2/5)
// ═══════════════════════════════════════════════════

function canNavigateToParticipant() {
  const access = getLiveBoardAccess();
  return !!access.sessionId && (isFacilitator() || isParticipant());
}

function canFollowParticipant() {
  return isFacilitator() && !!getLiveBoardAccess().sessionId;
}

function formatLastActivity(iso, isOnline) {
  if (isOnline) return 'Active now';
  if (!iso) return 'Last seen unknown';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Last seen unknown';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'Active just now';
  if (diffSec < 3600) return `Last seen ${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `Last seen ${Math.floor(diffSec / 3600)}h ago`;
  return `Last seen ${Math.floor(diffSec / 86400)}d ago`;
}

function getDisplayNameForUserId(userId) {
  const access = getLiveBoardAccess();
  if (userId === access.userId) return access.userName || access.userEmail || 'You';
  for (const client of remoteCollabClients.values()) {
    if (client.userId === userId && client.name) return client.name;
  }
  for (const user of presenceUsers) {
    if (user.userId === userId && user.name) return user.name;
  }
  const rosterEntry = sessionRoster.find((row) => row.user_id === userId);
  if (rosterEntry?.displayName) return rosterEntry.displayName;
  return 'Participant';
}

function getLiveClientsForUser(userId) {
  pruneStaleCollabClients();
  const cutoff = Date.now() - 30000;
  return Array.from(remoteCollabClients.values())
    .filter((client) => client.userId === userId && (client.updatedAt || 0) >= cutoff)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function getBestClientForUser(userId) {
  const liveClients = getLiveClientsForUser(userId);
  if (liveClients.length) return liveClients[0];
  return Array.from(remoteCollabClients.values())
    .filter((client) => client.userId === userId)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
}

function isUserOnline(userId) {
  if (getLiveClientsForUser(userId).length) return true;
  const row = sessionRoster.find((entry) => entry.user_id === userId);
  if (!row?.last_seen_at) return false;
  return Date.now() - new Date(row.last_seen_at).getTime() < 120000;
}

function buildActivityEntries() {
  const access = getLiveBoardAccess();
  const byUser = new Map();

  sessionRoster.forEach((row) => {
    byUser.set(row.user_id, {
      userId: row.user_id,
      role: row.role || 'participant',
      lastSeenAt: row.last_seen_at,
      name: getDisplayNameForUserId(row.user_id),
      isSelf: row.user_id === access.userId,
    });
  });

  if (access.userId && !byUser.has(access.userId)) {
    byUser.set(access.userId, {
      userId: access.userId,
      role: access.role || 'participant',
      lastSeenAt: new Date().toISOString(),
      name: access.userName || access.userEmail || 'You',
      isSelf: true,
    });
  }

  remoteCollabClients.forEach((client) => {
    if (!client.userId || client.userId === access.userId) return;
    if (!byUser.has(client.userId)) {
      byUser.set(client.userId, {
        userId: client.userId,
        role: 'participant',
        lastSeenAt: null,
        name: client.name || 'Participant',
        isSelf: false,
      });
    }
  });

  return Array.from(byUser.values())
    .map((entry) => ({
      ...entry,
      isOnline: isUserOnline(entry.userId),
      client: getBestClientForUser(entry.userId),
    }))
    .sort((a, b) => {
      if (a.isSelf) return -1;
      if (b.isSelf) return 1;
      if (a.role === 'facilitator' && b.role !== 'facilitator') return -1;
      if (b.role === 'facilitator' && a.role !== 'facilitator') return 1;
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

async function fetchSessionRoster() {
  const access = getLiveBoardAccess();
  if (!window.supabaseClient || !access.sessionId) {
    sessionRoster = [];
    return;
  }
  const { data, error } = await window.supabaseClient
    .from('session_participants')
    .select('user_id, role, last_seen_at')
    .eq('session_id', access.sessionId);
  if (error) {
    console.error('[activity] roster fetch failed', error.message);
    return;
  }
  sessionRoster = data || [];
  if (activityPanelOpen) renderActivityPanel();
}

function subscribeSessionRoster() {
  const access = getLiveBoardAccess();
  if (!window.supabaseClient || !access.sessionId) return;
  if (activityRosterChannel) {
    activityRosterChannel.unsubscribe();
    activityRosterChannel = null;
  }
  activityRosterChannel = window.supabaseClient
    .channel(`activity-roster-${access.sessionId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'session_participants',
        filter: `session_id=eq.${access.sessionId}`,
      },
      () => {
        fetchSessionRoster();
      },
    )
    .subscribe();
}

async function touchSessionHeartbeat() {
  const access = getLiveBoardAccess();
  if (!window.supabaseClient || !access.sessionId || !access.userId) return;
  await window.supabaseClient
    .from('session_participants')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('session_id', access.sessionId)
    .eq('user_id', access.userId);
}

function startActivityHeartbeat() {
  if (activityHeartbeatTimer) clearInterval(activityHeartbeatTimer);
  const access = getLiveBoardAccess();
  if (!access.sessionId) return;
  touchSessionHeartbeat();
  activityHeartbeatTimer = setInterval(() => {
    touchSessionHeartbeat();
  }, 45000);
}

function startActivityPanelRefresh() {
  if (activityPanelRefreshTimer) clearInterval(activityPanelRefreshTimer);
  activityPanelRefreshTimer = setInterval(() => {
    if (!activityPanelOpen) return;
    renderActivityPanel();
  }, 5000);
}

function initActivityPanel() {
  const access = getLiveBoardAccess();
  if (!access.sessionId) return;
  fetchSessionRoster();
  subscribeSessionRoster();
  startActivityHeartbeat();
  startActivityPanelRefresh();
  updateFacilitatorUi();
}

function toggleActivityPanel() {
  const access = getLiveBoardAccess();
  if (!access.sessionId) {
    showToast('Open a training session to see participants');
    return;
  }
  if (activityPanelOpen) {
    closeActivityPanel();
    return;
  }
  closeShareDialog();
  activityPanelOpen = true;
  document.getElementById('activity-panel')?.classList.add('visible');
  document.getElementById('panel-backdrop').style.display = 'block';
  fetchSessionRoster().then(() => renderActivityPanel());
}

function closeActivityPanel() {
  activityPanelOpen = false;
  document.getElementById('activity-panel')?.classList.remove('visible');
  if (!document.getElementById('share-dialog')?.classList.contains('visible')) {
    document.getElementById('panel-backdrop').style.display = 'none';
  }
}

function renderActivityPanel() {
  const list = document.getElementById('activity-participant-list');
  const banner = document.getElementById('activity-follow-banner');
  if (!list) return;

  const entries = buildActivityEntries();
  const onlineCount = entries.filter((entry) => entry.isOnline).length;
  const subtitle = document.getElementById('activity-panel-subtitle');
  if (subtitle) {
    subtitle.textContent = `${onlineCount} active · ${entries.length} in session`;
  }

  if (banner) {
    if (followClientId) {
      const followed = entries.find((entry) => entry.client?.clientId === followClientId);
      const followedName = followed?.name || 'participant';
      banner.style.display = 'flex';
      banner.innerHTML = `
        <span>Following ${escapeHtml(followedName)}</span>
        <button type="button" class="activity-follow-stop" onclick="stopFollowingParticipant()">Stop</button>
      `;
    } else {
      banner.style.display = 'none';
      banner.innerHTML = '';
    }
  }

  if (!entries.length) {
    list.innerHTML = '<div class="activity-detail">No participants yet.</div>';
    return;
  }

  list.innerHTML = entries.map((entry) => {
    const color = userColorFromId(entry.userId);
    const initial = (entry.name || '?').slice(0, 1).toUpperCase();
    const roleLabel = entry.role === 'facilitator' ? 'Facilitator' : 'Participant';
    const activityLabel = formatLastActivity(entry.lastSeenAt, entry.isOnline);
    const isFollowing = !!followClientId && entry.client?.clientId === followClientId;
    const canJump = canNavigateToParticipant() && !entry.isSelf;
    const canFollow = canFollowParticipant() && !entry.isSelf && entry.isOnline;
    const jumpDisabled = !canJump || !entry.client;
    const followLabel = isFollowing ? 'Following' : 'Follow';

    return `
      <div class="activity-item ${entry.isOnline ? '' : 'is-offline'} ${isFollowing ? 'is-following' : ''}">
        <div class="activity-item-main" ${canJump ? `onclick="jumpToParticipant('${entry.userId}')"` : ''} title="${canJump ? 'Jump to this participant' : ''}">
          <div class="activity-avatar" style="background:${color}">
            ${initial}
            <span class="activity-avatar-dot ${entry.isOnline ? 'online' : ''}"></span>
          </div>
          <div class="activity-meta">
            <div class="activity-name">${escapeHtml(entry.isSelf ? `${entry.name} (you)` : entry.name)}</div>
            <div class="activity-detail">${roleLabel} · ${activityLabel}</div>
          </div>
        </div>
        <div class="activity-actions">
          ${canJump ? (jumpDisabled
    ? '<button type="button" class="activity-btn" disabled title="Not visible right now">Jump</button>'
    : `<button type="button" class="activity-btn" onclick="event.stopPropagation(); jumpToParticipant('${entry.userId}')" title="Jump to cursor">Jump</button>`) : ''}
          ${canFollow ? `<button type="button" class="activity-btn activity-btn-primary" onclick="event.stopPropagation(); ${isFollowing ? 'stopFollowingParticipant()' : `startFollowingParticipant('${entry.client?.clientId || ''}')`}">${followLabel}</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function navigateToScreenPoint(sx, sy) {
  const wx = (sx - state.panX) / state.zoom;
  const wy = (sy - state.panY) / state.zoom;
  state.panX = window.innerWidth / 2 - wx * state.zoom;
  state.panY = window.innerHeight / 2 - wy * state.zoom;
  applyTransform();
}

function navigateToParticipantViewport(client) {
  if (!client) return false;
  if (Number.isFinite(client.panX) && Number.isFinite(client.panY) && Number.isFinite(client.zoom)) {
    state.panX = client.panX;
    state.panY = client.panY;
    state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, client.zoom));
    applyTransform();
    return true;
  }
  if (Number.isFinite(client.cursorX) && Number.isFinite(client.cursorY)) {
    navigateToScreenPoint(client.cursorX, client.cursorY);
    return true;
  }
  return false;
}

function highlightPresenceCursor(clientId) {
  if (!clientId) return;
  const layer = document.getElementById('presence-layer');
  if (!layer) return;
  const cursor = layer.querySelector(`[data-client-id="${clientId}"]`);
  if (!cursor) return;
  cursor.classList.add('is-highlighted');
  setTimeout(() => cursor.classList.remove('is-highlighted'), 1800);
}

function jumpToParticipant(userId) {
  if (!canNavigateToParticipant()) {
    showToast('Only session members can jump to participants');
    return;
  }
  const client = getBestClientForUser(userId);
  if (!client) {
    showToast('This participant is not visible right now');
    return;
  }
  if (!navigateToParticipantViewport(client)) {
    showToast('This participant has no cursor or viewport yet');
    return;
  }
  highlightPresenceCursor(client.clientId);
  const name = getDisplayNameForUserId(userId);
  showToast(`Jumped to ${name}`);
}

function startFollowingParticipant(clientId) {
  if (!canFollowParticipant()) {
    showToast('Only the facilitator can follow participants');
    return;
  }
  if (!clientId || !remoteCollabClients.has(clientId)) {
    showToast('Participant is not live right now');
    return;
  }
  followClientId = clientId;
  const client = remoteCollabClients.get(clientId);
  navigateToParticipantViewport(client);
  renderActivityPanel();
  showToast(`Following ${client?.name || 'participant'}`);
}

function stopFollowingParticipant() {
  if (!followClientId) return;
  followClientId = null;
  renderActivityPanel();
  showToast('Stopped following');
}

function breakFollowOnUserViewportChange() {
  if (!followClientId) return;
  followClientId = null;
  if (activityPanelOpen) renderActivityPanel();
}

function applyFollowViewportIfNeeded() {
  if (!followClientId) return;
  const client = remoteCollabClients.get(followClientId);
  if (!client) {
    followClientId = null;
    if (activityPanelOpen) renderActivityPanel();
    return;
  }
  if (Number.isFinite(client.panX) && Number.isFinite(client.panY) && Number.isFinite(client.zoom)) {
    state.panX = client.panX;
    state.panY = client.panY;
    state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, client.zoom));
    applyTransform();
    return;
  }
  if (Number.isFinite(client.cursorX) && Number.isFinite(client.cursorY)) {
    navigateToScreenPoint(client.cursorX, client.cursorY);
  }
}

function scheduleViewportPresencePublish() {
  if (viewportPresenceTimer) return;
  viewportPresenceTimer = setTimeout(() => {
    viewportPresenceTimer = null;
    publishCollabPresence(lastPresenceCursorX, lastPresenceCursorY);
  }, 350);
}

function shareBoard() {
  if (!isBoardAdmin()) {
    showToast('Only the facilitator can manage sharing');
    return;
  }
  closeActivityPanel();
  ensureShareDefaults();
  updateFacilitatorUi();
  const panel = document.getElementById('share-dialog');
  panel.classList.add('visible');
  document.getElementById('panel-backdrop').style.display = 'block';
  renderShareDialog();
}

function closeShareDialog() {
  document.getElementById('share-dialog').classList.remove('visible');
  document.getElementById('panel-backdrop').style.display = 'none';
}

function ensureShareDefaults() {
  if (!state.sharing) state.sharing = {};
  if (!state.sharing.viewToken) state.sharing.viewToken = uid() + uid();
  if (!state.sharing.editToken) state.sharing.editToken = uid() + uid();
  if (!state.sharing.defaultPermission) state.sharing.defaultPermission = 'view';
  if (!Array.isArray(state.sharing.invites)) state.sharing.invites = [];
}

function getShareLink(permission) {
  const mode = permission === 'edit' ? 'edit' : 'view';
  const token = mode === 'edit' ? state.sharing.editToken : state.sharing.viewToken;
  const boardId = boardAccess.boardId || '';
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?board=${encodeURIComponent(boardId)}&mode=${mode}&token=${encodeURIComponent(token)}`;
}

function onSharePermissionChange() {
  const val = document.getElementById('share-permission').value;
  state.sharing.defaultPermission = val === 'edit' ? 'edit' : 'view';
  renderShareDialog();
  saveToStorage();
}

function copyShareLink() {
  const permission = document.getElementById('share-permission').value;
  const link = getShareLink(permission);
  copyText(link);
  showToast('🔗 Link copied to clipboard');
}

function sendBoardInvite() {
  if (!isBoardAdmin()) {
    showToast('Only the facilitator can invite people');
    return;
  }
  ensureShareDefaults();
  const emailInput = document.getElementById('share-email-input');
  const invitePerm = document.getElementById('share-invite-permission').value === 'edit' ? 'edit' : 'view';
  const email = (emailInput.value || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    showToast('Enter a valid email');
    return;
  }
  const existing = state.sharing.invites.find((entry) => entry.email === email);
  if (existing) {
    existing.permission = invitePerm;
  } else {
    state.sharing.invites.push({ email, permission: invitePerm, id: uid() });
  }
  emailInput.value = '';
  renderShareDialog();
  saveToStorage();
  showToast(`Invite updated for ${email}`);
}

function revokeBoardAccess(email) {
  if (!isBoardAdmin()) {
    showToast('Only the facilitator can revoke access');
    return;
  }
  ensureShareDefaults();
  state.sharing.invites = state.sharing.invites.filter((entry) => entry.email !== email);
  renderShareDialog();
  saveToStorage();
  showToast(`${email} removed`);
}

function renderShareDialog() {
  ensureShareDefaults();
  const permission = state.sharing.defaultPermission || 'view';
  const linkInput = document.getElementById('share-link-input');
  const permSelect = document.getElementById('share-permission');
  permSelect.value = permission;
  linkInput.value = getShareLink(permission);

  const sessionInput = document.getElementById('share-session-link-input');
  if (sessionInput) {
    sessionInput.value = getSessionLink() || '';
  }

  const accessList = document.getElementById('share-access-list');
  const ownerEmail = boardAccess.userEmail || 'you';
  const ownerName = boardAccess.userName || ownerEmail;
  const inviteRows = (state.sharing.invites || []).map((entry) => (
    `<div class="share-access-item">
      <div class="share-access-meta">
        <div class="share-access-email">${entry.email}</div>
        <div class="share-access-perm">${entry.permission === 'edit' ? 'Can edit' : 'View only'}</div>
      </div>
      <button class="share-revoke" onclick="revokeBoardAccess('${entry.email}')">Revoke</button>
    </div>`
  )).join('');

  accessList.innerHTML = `
    <div class="share-access-item">
      <div class="share-access-meta">
        <div class="share-access-email">${ownerName}</div>
        <div class="share-access-perm">Owner</div>
      </div>
    </div>
    ${inviteRows || '<div class="share-access-perm">No invited people yet.</div>'}
  `;
}

function copyText(url) {
  const ta = document.createElement('textarea');
  ta.value = url;
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
  document.body.appendChild(ta);
  ta.select();
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url);
    } else {
      document.execCommand('copy');
    }
  } catch(e) {}
  ta.remove();
}

// ═══════════════════════════════════════════════════
// SHORTCUTS OVERLAY
// ═══════════════════════════════════════════════════
function showShortcuts() {
  document.getElementById('shortcuts-overlay').classList.add('show');
}
function hideShortcuts() {
  document.getElementById('shortcuts-overlay').classList.remove('show');
}

// ═══════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════
let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

// ═══════════════════════════════════════════════════
// LOCALSTORAGE PERSISTENCE
// ═══════════════════════════════════════════════════
function saveToStorage() {
  localStorage.setItem('lpa-board-saved', new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }));
  const boardState = getCurrentBoardState();
  const prepared = prepareBoardStateForPersistence(boardState);
  try {
    localStorage.setItem('lpa-mindspace-v1', JSON.stringify(prepared));
  } catch (e) {
    console.warn('[board] local save failed (storage may be full)', e);
  }
  queueSupabaseSave(boardState);
  publishBoardDeltaUpdate();
}

function loadFromStorage() {
  try {
    const raw =
      window.__LPA_BOARD_STATE_OBJECT__ ||
      window.supabaseInitialState ||
      localStorage.getItem('lpa-mindspace-v1');
    const data = parseBoardStateRaw(raw);
    if (!data) {
      History.baseline();
      return;
    }
    state.boardName = data.boardName || 'LP MindSpace';
    state.panX = Number.isFinite(data.panX) ? data.panX : 0;
    state.panY = Number.isFinite(data.panY) ? data.panY : 0;
    state.zoom = Number.isFinite(data.zoom) && data.zoom > 0 ? data.zoom : 1;
    state.objects = hydrateObjectsList(normalizeObjectsList(data.objects));
    state.sharing = data.sharing || null;
    const boardNameInput = document.getElementById('boardName');
    if (boardNameInput) boardNameInput.value = state.boardName;
    document.title = state.boardName + ' — LP MindSpace';
    applyTransform();
    scheduleBoardRedraw();
    History.baseline();
    console.info('[board] loaded', state.objects.length, 'objects');
  } catch (e) {
    console.error('[board] loadFromStorage failed', e);
    History.baseline();
  }
}

// auto-save every 10s
setInterval(saveToStorage, 10000);
window.addEventListener('beforeunload', saveToStorage);

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════
function init() {
  const access = getLiveBoardAccess();
  realtimeClientId = `${access.userId || 'anon'}:${Math.random().toString(36).slice(2, 10)}`;
  applyTransform();
  loadFromStorage();
  lastPublishedBoardState = getCurrentBoardState();
  applyAccessModeUi();
  updateGridToggleUi();
  initRealtimePresence();
  initRealtimeBoardSync();
  initActivityPanel();
  showHint('Welcome to LP MindSpace — drag to pan · scroll to zoom · press ? for shortcuts');
}

/** Re-paint in-memory objects after React injects a fresh board shell. */
function restoreCanvasIfDomWasCleared() {
  bindBoardDom();
  if (!canvasWorld) return;
  const hasDom =
    canvasWorld.querySelector('.sticky-note, .shape-obj, .canvas-text, .image-obj') ||
    document.getElementById('drawing-layer');
  if (!hasDom && state.objects.length) scheduleBoardRedraw();
}

function serializeCurrentBoardState() {
  return JSON.stringify({
    boardName: state.boardName,
    objects: state.objects,
    panX: state.panX,
    panY: state.panY,
    zoom: state.zoom,
    sharing: state.sharing || null,
  });
}

function getCurrentBoardState() {
  return {
    boardName: state.boardName,
    objects: state.objects,
    panX: state.panX,
    panY: state.panY,
    zoom: state.zoom,
    sharing: state.sharing || null,
  };
}

function cloneBoardStateSnapshot(source) {
  return JSON.parse(JSON.stringify(source || getCurrentBoardState()));
}

const BOARD_IMAGES_BUCKET = 'board-images';

function isInlineImageSrc(src) {
  return typeof src === 'string' && src.startsWith('data:');
}

function getBoardImagePublicUrl(objectId, ext = 'jpg') {
  const client = window.supabaseClient;
  const boardId = boardAccess.boardId;
  if (!client || !boardId || !objectId) return '';
  const path = `${boardId}/${objectId}.${ext}`;
  const { data } = client.storage.from(BOARD_IMAGES_BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}

function hydrateImageObject(obj) {
  if (!obj || obj.type !== 'image') return obj;
  if (obj.src && !isInlineImageSrc(obj.src)) return obj;
  const pngUrl = getBoardImagePublicUrl(obj.id, 'png');
  const jpgUrl = getBoardImagePublicUrl(obj.id, 'jpg');
  if (isInlineImageSrc(obj.src)) return obj;
  return { ...obj, src: obj.src || jpgUrl || pngUrl || '' };
}

function hydrateObjectsList(objects) {
  return (objects || []).map(hydrateImageObject);
}

function prepareObjectForPersistence(obj) {
  if (!obj || obj.type !== 'image') return obj;
  if (!isInlineImageSrc(obj.src)) return obj;
  const ext = obj.src.includes('image/png') ? 'png' : 'jpg';
  const url = getBoardImagePublicUrl(obj.id, ext);
  return { ...obj, src: url || '' };
}

function prepareBoardStateForPersistence(boardState) {
  if (!boardState || typeof boardState !== 'object') return boardState;
  return {
    ...boardState,
    objects: (boardState.objects || []).map(prepareObjectForPersistence),
  };
}

let supabaseSaveInFlight = false;
let supabaseSavePending = null;

async function flushSupabaseSaveQueue() {
  if (supabaseSaveInFlight || !window.supabaseStorageSave) return;
  supabaseSaveInFlight = true;
  while (supabaseSavePending) {
    const toSave = supabaseSavePending;
    supabaseSavePending = null;
    try {
      await window.supabaseStorageSave(toSave);
    } catch (e) {
      console.error('[board] Supabase state save failed', e);
    }
  }
  supabaseSaveInFlight = false;
}

function queueSupabaseSave(boardState) {
  supabaseSavePending = prepareBoardStateForPersistence(boardState);
  flushSupabaseSaveQueue();
}

function sanitizeObjForSync(obj) {
  if (!obj || obj.type !== 'image') return obj;
  if (isInlineImageSrc(obj.src)) {
    const ext = obj.src.includes('image/png') ? 'png' : 'jpg';
    return { ...obj, src: getBoardImagePublicUrl(obj.id, ext) || '' };
  }
  if (!obj.src) {
    const hydrated = hydrateImageObject(obj);
    return hydrated.src ? hydrated : obj;
  }
  return obj;
}

function sanitizeSnapshotForSync(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot;
  return {
    ...snapshot,
    objects: (snapshot.objects || []).map(sanitizeObjForSync),
  };
}

function applyRemoteBoardState(remoteState, sourceLabel) {
  if (!remoteState || typeof remoteState !== 'object') return;
  const remoteList = normalizeObjectsList(
    normalizeBoardStateData(remoteState)?.objects ?? remoteState.objects,
  );
  if (
    sourceLabel === 'latest' &&
    remoteList.length === 0 &&
    (state.objects || []).length > 0
  ) {
    console.warn('[board] ignoring empty remote snapshot; keeping local objects');
    return;
  }
  let currentSerialized = '';
  let remoteSerialized = '';
  try {
    currentSerialized = serializeCurrentBoardState();
    remoteSerialized = JSON.stringify(remoteState);
  } catch (_e) {
    return;
  }
  if (!remoteSerialized || remoteSerialized === currentSerialized) return;

  const previousObjects = state.objects || [];
  const previousById = createObjectMap(previousObjects);
  const mergedRemoteList = remoteList.map((obj) => {
    if (obj?.type !== 'image' || obj.src) return obj;
    const prev = previousById.get(String(obj.id));
    if (prev?.type === 'image' && prev.src) return { ...obj, src: prev.src };
    return obj;
  });
  const remoteIds = new Set(mergedRemoteList.map((o) => o.id));
  // Keep images that exist locally but are missing from remote (e.g. DB save still in flight).
  const localImagesMissingFromRemote = previousObjects.filter(
    (o) => o.type === 'image' && o.id && !remoteIds.has(o.id) && o.src
  );

  state.boardName = remoteState.boardName || state.boardName || 'LP MindSpace';
  state.panX = Number.isFinite(remoteState.panX) ? remoteState.panX : 0;
  state.panY = Number.isFinite(remoteState.panY) ? remoteState.panY : 0;
  state.zoom = Number.isFinite(remoteState.zoom) ? remoteState.zoom : 1;
  state.objects = hydrateObjectsList([...mergedRemoteList, ...localImagesMissingFromRemote]);
  state.sharing = remoteState.sharing || null;

  const boardNameInput = document.getElementById('boardName');
  if (boardNameInput) boardNameInput.value = state.boardName;
  document.title = state.boardName + ' — LP MindSpace';
  applyTransform();
  scheduleBoardRedraw();
  History.baseline();
  lastPublishedBoardState = cloneBoardStateSnapshot(remoteState);
  if (sourceLabel === 'latest') showToast('Board updated');
}

async function pullLatestBoardStateFromSupabase() {
  try {
    const access = getLiveBoardAccess();
    if (!window.supabaseClient || !access.boardId) return;
    const { data, error } = await window.supabaseClient
      .from('boards')
      .select('state')
      .eq('id', access.boardId)
      .single();
    if (error || !data?.state) return;
    applyRemoteBoardState(data.state, 'latest');
  } catch (_e) {}
}

function initRealtimeBoardSync() {
  const access = getLiveBoardAccess();
  if (!window.supabaseClient || !access.boardId) return;
  if (boardSyncChannel) {
    boardSyncChannel.unsubscribe();
    boardSyncChannel = null;
    boardSyncChannelReady = false;
    if (collabPresenceHeartbeat) {
      clearInterval(collabPresenceHeartbeat);
      collabPresenceHeartbeat = null;
    }
  }
  const channelName = access.sessionId
    ? `session-sync-${access.sessionId}`
    : `board-sync-${access.boardId}`;
  boardSyncChannel = window.supabaseClient.channel(channelName);
  boardSyncChannelReady = false;
  boardSyncChannel.on('broadcast', { event: 'board_resync_request' }, ({ payload }) => {
    if (!payload || payload.requesterId === realtimeClientId) return;
    // Any editor can answer with latest snapshot; observers are read-only responders.
    if (!canEditBoardNow()) return;
    publishBoardStateUpdate({ targetClientId: payload.requesterId, reason: 'resync' });
  });
  boardSyncChannel.on('broadcast', { event: 'board_resync_state' }, ({ payload }) => {
    if (!payload || payload.senderId === realtimeClientId) return;
    if (payload.targetClientId && payload.targetClientId !== realtimeClientId) return;
    applyRemoteBoardState(payload.state, 'latest');
  });
  boardSyncChannel.on('broadcast', { event: 'board_ops' }, ({ payload }) => {
    if (!payload || payload.editorId === realtimeClientId) return;
    applyRemoteBoardOps(payload.ops, payload.meta);
  });
  boardSyncChannel.on('broadcast', { event: 'board_state' }, ({ payload }) => {
    if (!payload || payload.editorId === realtimeClientId) return;
    applyRemoteBoardState(payload.state, 'collab');
  });
  boardSyncChannel.on('broadcast', { event: 'collab_presence' }, ({ payload }) => {
    if (!payload || payload.clientId === realtimeClientId) return;
    remoteCollabClients.set(payload.clientId, {
      clientId: payload.clientId,
      userId: payload.userId,
      name: payload.name || 'User',
      color: payload.color || userColorFromId(payload.clientId),
      cursorX: payload.cursorX,
      cursorY: payload.cursorY,
      panX: payload.panX,
      panY: payload.panY,
      zoom: payload.zoom,
      updatedAt: payload.updatedAt || Date.now(),
    });
    pruneStaleCollabClients();
    renderPresence();
    applyFollowViewportIfNeeded();
    if (activityPanelOpen) renderActivityPanel();
  });
  boardSyncChannel.on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'boards',
      filter: `id=eq.${access.boardId}`,
    },
    (payload) => {
      applyRemoteBoardState(payload?.new?.state, 'collab');
    },
  );
  boardSyncChannel.subscribe((status) => {
    boardSyncChannelReady = status === 'SUBSCRIBED';
    if (status === 'SUBSCRIBED') {
      pullLatestBoardStateFromSupabase();
      requestRealtimeResync();
      publishCollabPresence(null, null);
      if (collabPresenceHeartbeat) clearInterval(collabPresenceHeartbeat);
      collabPresenceHeartbeat = setInterval(() => publishCollabPresence(lastPresenceCursorX, lastPresenceCursorY), 4000);
    }
  });
}

function pruneStaleCollabClients() {
  const cutoff = Date.now() - 12000;
  remoteCollabClients.forEach((client, clientId) => {
    if ((client.updatedAt || 0) < cutoff) remoteCollabClients.delete(clientId);
  });
}

function publishCollabPresence(cursorX, cursorY) {
  if (!boardSyncChannel || !boardSyncChannelReady) return;
  const access = window.boardAccess || boardAccess;
  boardSyncChannel.send({
    type: 'broadcast',
    event: 'collab_presence',
    payload: {
      clientId: realtimeClientId,
      userId: access.userId,
      name: access.userName || access.userEmail || 'User',
      color: userColorFromId(realtimeClientId),
      cursorX: Number.isFinite(cursorX) ? cursorX : null,
      cursorY: Number.isFinite(cursorY) ? cursorY : null,
      panX: state.panX,
      panY: state.panY,
      zoom: state.zoom,
      updatedAt: Date.now(),
    },
  });
}

function requestRealtimeResync() {
  if (!boardSyncChannel || !boardSyncChannelReady) return;
  boardSyncChannel.send({
    type: 'broadcast',
    event: 'board_resync_request',
    payload: {
      boardId: boardAccess.boardId,
      requesterId: realtimeClientId,
      requestedAt: Date.now(),
    },
  });
}

function publishBoardStateUpdate({ targetClientId = null, reason = 'state' } = {}) {
  if (!boardSyncChannel || !boardSyncChannelReady || !getLiveBoardAccess().boardId || !canEditBoardNow()) return;
  const snapshot = sanitizeSnapshotForSync(cloneBoardStateSnapshot());
  lastPublishedBoardState = cloneBoardStateSnapshot();
  boardSyncChannel.send({
    type: 'broadcast',
    event: reason === 'resync' ? 'board_resync_state' : 'board_state',
    payload: {
      boardId: boardAccess.boardId,
      editorId: realtimeClientId,
      senderId: realtimeClientId,
      targetClientId,
      state: snapshot,
      updatedAt: Date.now(),
    },
  });
}

function getObjectId(obj) {
  return obj?.id != null ? String(obj.id) : null;
}

function createObjectMap(objects) {
  const m = new Map();
  (objects || []).forEach((obj) => {
    const id = getObjectId(obj);
    if (!id) return;
    m.set(id, obj);
  });
  return m;
}

function buildBoardOps(previousState, nextState) {
  const ops = [];
  const prevMap = createObjectMap(previousState?.objects || []);
  const nextMap = createObjectMap(nextState?.objects || []);

  prevMap.forEach((_obj, id) => {
    if (!nextMap.has(id)) ops.push({ t: 'delete', id });
  });

  nextMap.forEach((obj, id) => {
    const prevObj = prevMap.get(id);
    if (!prevObj) {
      ops.push({ t: 'upsert', obj });
      return;
    }
    if (JSON.stringify(prevObj) !== JSON.stringify(obj)) ops.push({ t: 'upsert', obj });
  });

  const viewportChanged =
    previousState?.panX !== nextState?.panX ||
    previousState?.panY !== nextState?.panY ||
    previousState?.zoom !== nextState?.zoom;
  if (viewportChanged) {
    ops.push({ t: 'viewport', panX: nextState.panX, panY: nextState.panY, zoom: nextState.zoom });
  }

  if ((previousState?.boardName || '') !== (nextState?.boardName || '')) {
    ops.push({ t: 'boardName', boardName: nextState.boardName || 'LP MindSpace' });
  }

  if (JSON.stringify(previousState?.sharing || null) !== JSON.stringify(nextState?.sharing || null)) {
    ops.push({ t: 'sharing', sharing: nextState.sharing || null });
  }

  return ops;
}

function applyRemoteBoardOps(ops, meta = {}) {
  if (!Array.isArray(ops) || ops.length === 0) return;
  let changed = false;
  const objectMap = createObjectMap(state.objects);

  ops.forEach((op) => {
    if (!op || !op.t) return;
    if (op.t === 'delete' && op.id != null) {
      if (objectMap.delete(String(op.id))) changed = true;
      return;
    }
    if (op.t === 'upsert' && op.obj) {
      const id = getObjectId(op.obj);
      if (!id) return;
      const existing = objectMap.get(id);
      if (
        op.obj.type === 'image' &&
        !op.obj.src &&
        existing?.type === 'image' &&
        existing.src
      ) {
        objectMap.set(id, { ...op.obj, src: existing.src });
      } else {
        objectMap.set(id, op.obj.type === 'image' ? hydrateImageObject(op.obj) : op.obj);
      }
      changed = true;
      return;
    }
    if (op.t === 'viewport') {
      state.panX = Number.isFinite(op.panX) ? op.panX : state.panX;
      state.panY = Number.isFinite(op.panY) ? op.panY : state.panY;
      state.zoom = Number.isFinite(op.zoom) ? op.zoom : state.zoom;
      changed = true;
      return;
    }
    if (op.t === 'boardName') {
      state.boardName = op.boardName || state.boardName;
      const boardNameInput = document.getElementById('boardName');
      if (boardNameInput) boardNameInput.value = state.boardName;
      document.title = `${state.boardName} — LP MindSpace`;
      changed = true;
      return;
    }
    if (op.t === 'sharing') {
      state.sharing = op.sharing || null;
      changed = true;
    }
  });

  if (!changed) return;
  state.objects = hydrateObjectsList(Array.from(objectMap.values()));
  applyTransform();
  redrawAll();
  updateObjectCount();
  History.baseline();
  lastPublishedBoardState = cloneBoardStateSnapshot();
  if (meta?.reason === 'resync') showToast('Board synced');
}

function publishBoardDeltaUpdate() {
  if (!boardSyncChannel || !boardSyncChannelReady || !getLiveBoardAccess().boardId || !canEditBoardNow()) return;
  const nextState = cloneBoardStateSnapshot();
  const previousState = lastPublishedBoardState || nextState;
  const ops = buildBoardOps(previousState, nextState);
  if (!ops.length) return;

  // If too many changes, send a full snapshot to avoid huge op lists.
  if (ops.length > 180) {
    publishBoardStateUpdate({ reason: 'state' });
    return;
  }

  const syncOps = ops.map((op) => (
    op.t === 'upsert' && op.obj ? { ...op, obj: sanitizeObjForSync(op.obj) } : op
  ));

  boardSyncChannel.send({
    type: 'broadcast',
    event: 'board_ops',
    payload: {
      boardId: boardAccess.boardId,
      editorId: realtimeClientId,
      ops: syncOps,
      meta: {
        sentAt: Date.now(),
      },
    },
  });
  lastPublishedBoardState = nextState;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    restoreCanvasIfDomWasCleared();
    pullLatestBoardStateFromSupabase();
  }
});
window.addEventListener('pageshow', () => {
  restoreCanvasIfDomWasCleared();
  pullLatestBoardStateFromSupabase();
});

function applyAccessModeUi() {
  const avatar = document.querySelector('.tb-avatar');
  if (avatar) avatar.textContent = ((boardAccess.userName || 'U')[0] || 'U').toUpperCase();

  const boardNameInput = document.getElementById('boardName');
  if (boardNameInput && isParticipant()) {
    boardNameInput.setAttribute('readonly', 'readonly');
    boardNameInput.style.opacity = '0.85';
  }

  updateFacilitatorUi();

  if (!isReadOnlyMode()) return;

  document.body.classList.add('read-only-mode');
  state.tool = 'hand';
  document.body.className = 'tool-hand read-only-mode';
  if (boardNameInput) {
    boardNameInput.setAttribute('readonly', 'readonly');
    boardNameInput.style.opacity = '0.8';
  }
  showToast('View-only mode');
}

function userColorFromId(id) {
  const palette = ['#2e9d91', '#4f71f2', '#f2541d', '#141414', '#fbfbfb'];
  let hash = 0;
  const str = id || 'user';
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

function buildPresencePayload(cursorX = null, cursorY = null) {
  return {
    clientId: realtimeClientId,
    userId: boardAccess.userId,
    name: boardAccess.userName || boardAccess.userEmail || 'User',
    color: userColorFromId(realtimeClientId),
    cursorX,
    cursorY,
    panX: state.panX,
    panY: state.panY,
    zoom: state.zoom,
  };
}

function getRemoteCollabUsers() {
  pruneStaleCollabClients();
  const fromBroadcast = Array.from(remoteCollabClients.values());
  if (fromBroadcast.length) return fromBroadcast;
  return presenceUsers.filter((u) => u.clientId && u.clientId !== realtimeClientId);
}

function renderPresence() {
  // One entry per tab/client (not per user), so same account in 2 tabs shows 2 avatars.
  const others = getRemoteCollabUsers();
  const avatars = document.getElementById('tb-presence');
  const layer = document.getElementById('presence-layer');
  if (!avatars || !layer) return;

  avatars.innerHTML = others.map((u) => `
    <div class="tb-presence-avatar" title="${u.name}" style="background:${u.color}">
      ${(u.name || '?').slice(0, 1).toUpperCase()}
    </div>
  `).join('');

  layer.innerHTML = others
    .filter((u) => Number.isFinite(u.cursorX) && Number.isFinite(u.cursorY))
    .map((u) => `
      <div class="presence-cursor" data-client-id="${u.clientId}" style="left:${u.cursorX}px;top:${u.cursorY}px">
        <div class="presence-cursor-dot" style="background:${u.color}"></div>
        <div class="presence-cursor-label" style="background:${u.color}">${u.name}</div>
      </div>
    `).join('');
  if (activityPanelOpen) renderActivityPanel();
}

function initRealtimePresence() {
  const access = getLiveBoardAccess();
  if (!window.supabaseClient || !access.boardId) return;
  if (presenceChannel) {
    presenceChannel.unsubscribe();
    presenceChannel = null;
  }

  const channelName = access.sessionId
    ? `presence-session-${access.sessionId}`
    : `presence-board-${access.boardId}`;
  presenceChannel = window.supabaseClient.channel(channelName, {
    config: { presence: { key: realtimeClientId } },
  });

  presenceChannel.on('presence', { event: 'sync' }, () => {
    const stateMap = presenceChannel.presenceState();
    const users = [];
    Object.entries(stateMap).forEach(([presenceKey, entries]) => {
      entries.forEach((entry) => {
        users.push({ ...entry, clientId: entry.clientId || presenceKey });
      });
    });
    presenceUsers = users;
    renderPresence();
    if (activityPanelOpen) renderActivityPanel();
  });

  presenceChannel.on('presence', { event: 'join' }, ({ newPresences }) => {
    newPresences.forEach((p) => {
      if (p.clientId !== realtimeClientId) showToast(`${p.name || 'Someone'} joined the board`);
    });
  });

  presenceChannel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
    leftPresences.forEach((p) => {
      if (p.clientId !== realtimeClientId) showToast(`${p.name || 'Someone'} left`);
    });
  });

  presenceChannel.subscribe(async (status) => {
    if (status !== 'SUBSCRIBED') return;
    await presenceChannel.track(buildPresencePayload());
  });
}

let presenceMoveTimer = null;
document.addEventListener('mousemove', (ev) => {
  if (presenceMoveTimer) return;
  lastPresenceCursorX = ev.clientX;
  lastPresenceCursorY = ev.clientY;
  presenceMoveTimer = setTimeout(() => {
    presenceMoveTimer = null;
    publishCollabPresence(ev.clientX, ev.clientY);
    if (presenceChannel) presenceChannel.track(buildPresencePayload(ev.clientX, ev.clientY));
  }, 70);
});

window.addEventListener('beforeunload', () => {
  if (collabPresenceHeartbeat) clearInterval(collabPresenceHeartbeat);
  if (presenceChannel) presenceChannel.unsubscribe();
  if (boardSyncChannel) boardSyncChannel.unsubscribe();
});




// ═══════════════════════════════════════════════════
// SELECT TOOL — CLEAN REWRITE
// ═══════════════════════════════════════════════════

// Multi-select: array of selected ids
let selectedIds = new Set();
let isBoxSelecting = false;
let boxSelectStart = null;

const selBox     = document.getElementById('sel-box');
const selToolbar = document.getElementById('sel-toolbar');

// ─── Core: select one object (or add to multi-select with ctrl)
function selectObject(id, addToSelection) {
  const obj = state.objects.find(o => o.id === id);
  if (!obj) return;
  if (!canSelectObjectForEdit(obj)) {
    notifyNotYourWork();
    return;
  }

  if (!addToSelection) clearAllSelections();
  selectedIds.add(id);

  if (obj.type === 'sticky') {
    const el = document.querySelector(`.sticky-note[data-obj-id="${id}"]`);
    if (el) el.classList.add('selected');
    selectedStickyId = id;
  } else if (obj.type === 'text') {
    const el = document.querySelector(`.canvas-text[data-obj-id="${id}"]`);
    if (el) {
      el.classList.add('sel-active');
      el.style.border = '1.5px solid #2e9d91';
      el.querySelectorAll('.text-resize-handle').forEach(h => h.style.display = 'block');
    }
  } else if (obj.type === 'stroke') {
    // highlight the stroke in teal
    const el = document.querySelector(`path[data-obj-id="${id}"]`);
    if (el) {
      el.setAttribute('stroke', '#2e9d91');
      el.dataset.prevStroke = obj.color || '#141414';
    }
  }

  updateSelToolbar();
}

// ─── Clear all selections
function clearAllSelections() {
  // restore stroke colors before clearing
  selectedIds.forEach(id => {
    const pathEl = document.querySelector(`path[data-obj-id="${id}"]`);
    if (pathEl) {
      const obj = state.objects.find(o => o.id === id);
      pathEl.setAttribute('stroke', pathEl.dataset.prevStroke || (obj && obj.color) || '#141414');
    }
  });
  selectedIds.clear();
  selectedStickyId = null;
  document.querySelectorAll('.sticky-note.selected').forEach(el => el.classList.remove('selected'));
  document.querySelectorAll('.canvas-text.sel-active').forEach(el => {
    el.classList.remove('sel-active');
    el.style.border = '1.5px solid transparent';
    el.querySelectorAll('.text-resize-handle').forEach(h => h.style.display = 'none');
  });
  hideSelToolbar();
  hideStickyPicker();
}

// ─── Deselect everything (alias used elsewhere)
function deselectAll() { clearAllSelections(); }

// ─── Show/hide toolbar
function updateSelToolbar() {
  if (selectedIds.size === 0 || shouldHideSelToolbarForTypeToolbar()) {
    hideSelToolbar();
    return;
  }
  selToolbar.classList.add('visible');
  positionSelToolbar();
}

function getSelectionAnchorRect() {
  let minTop = Infinity;
  let maxBottom = -Infinity;
  let minLeft = Infinity;
  let maxRight = -Infinity;

  selectedIds.forEach((id) => {
    const obj = state.objects.find((o) => o.id === id);
    if (!obj) return;
    let r;
    if (obj.type === 'stroke') {
      const el = document.querySelector(`path[data-obj-id="${id}"]`);
      if (el) {
        try {
          const bbox = el.getBBox();
          const tl = worldToScreen(bbox.x, bbox.y);
          const br = worldToScreen(bbox.x + bbox.width, bbox.y + bbox.height);
          r = { top: tl.y, left: tl.x, right: br.x, bottom: br.y, width: br.x - tl.x, height: br.y - tl.y };
        } catch (e) {
          return;
        }
      }
    } else {
      const el = document.querySelector(`[data-obj-id="${id}"]`);
      if (!el) return;
      r = el.getBoundingClientRect();
    }
    if (!r) return;
    minTop = Math.min(minTop, r.top);
    maxBottom = Math.max(maxBottom, r.bottom);
    minLeft = Math.min(minLeft, r.left);
    maxRight = Math.max(maxRight, r.right);
  });

  if (!isFinite(minTop)) return null;
  return {
    top: minTop,
    left: minLeft,
    right: maxRight,
    bottom: maxBottom,
    width: maxRight - minLeft,
    height: maxBottom - minTop,
  };
}

function positionSelToolbar() {
  if (selectedIds.size === 0 || !selToolbar.classList.contains('visible')) return;
  const anchorRect = getSelectionAnchorRect();
  if (!anchorRect) return;
  positionFloatingPanel(selToolbar, {
    anchorRect,
    excludeIds: ['sel-toolbar'],
  });
  repositionSelectionAiPopup();
}

function hideSelToolbar() {
  selToolbar.classList.remove('visible');
  const popup = document.getElementById('sel-ai-popup');
  if (popup) popup.style.display = 'none';
}
function showSelToolbar()  { if (selectedIds.size > 0) selToolbar.classList.add('visible'); }

// ─── Main mousedown handler for select tool
function handleSelectMousedown(e) {
  const addMode = e.ctrlKey || e.metaKey; // Ctrl/Cmd = add to selection

  // Did we click a sticky?
  const stickyEl = e.target.closest('.sticky-note');
  if (stickyEl) {
    const id = stickyEl.dataset.objId;
    if (!addMode) clearAllSelections();
    selectObject(id, true);
    startObjDrag(e, id);
    return;
  }

  // Did we click a text node?
  const textEl = e.target.closest('.canvas-text');
  if (textEl) {
    const id = textEl.dataset.objId;
    if (!addMode) clearAllSelections();
    selectObject(id, true);
    startObjDrag(e, id);
    return;
  }

  // Clicked empty canvas — clear and start box select
  if (!addMode) clearAllSelections();
  startBoxSelect(e);
}

// ─── Drag one or all selected objects
function startObjDrag(e, clickedId) {
  // check if the clicked object is locked
  const clickedObj = state.objects.find(o => o.id === clickedId);
  if (clickedObj && !canEditObject(clickedObj)) {
    notifyNotYourWork();
    e.stopPropagation();
    return;
  }
  if (clickedObj && clickedObj.locked) {
    showToast('🔒 Locked — right-click to unlock');
    e.stopPropagation();
    return;
  }

  e.stopPropagation();
  e.preventDefault();

  // snapshot start positions of ALL selected objects
  const startPositions = {};
  selectedIds.forEach(id => {
    const obj = state.objects.find(o => o.id === id);
    if (!obj) return;
    if (obj.type === 'stroke') {
      startPositions[id] = { points: obj.points.map(p => ({ x: p.x, y: p.y })) };
    } else if (obj.type === 'shape' && (obj.shapeType==='arrow'||obj.shapeType==='line')) {
      // snapshot both endpoints
      startPositions[id] = { x: obj.x, y: obj.y, x2: obj.x2||0, y2: obj.y2||0 };
    } else {
      startPositions[id] = { x: obj.x, y: obj.y };
    }
  });

  const startMouseX = e.clientX;
  const startMouseY = e.clientY;
  let moved = false;

  // add dragging class to sticky
  selectedIds.forEach(id => {
    const el = document.querySelector(`.sticky-note[data-obj-id="${id}"]`);
    if (el) el.classList.add('dragging');
  });

  function onMove(ev) {
    const dx = (ev.clientX - startMouseX) / state.zoom;
    const dy = (ev.clientY - startMouseY) / state.zoom;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved = true;

    selectedIds.forEach(id => {
      const obj = state.objects.find(o => o.id === id);
      const sp  = startPositions[id];
      if (!obj || !sp || !canEditObject(obj)) return;

      if (obj.type === 'stroke') {
        obj.points = sp.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
        const pathEl = document.querySelector(`path[data-obj-id="${id}"]`);
        if (pathEl) pathEl.setAttribute('d', pointsToPath(obj.points));
      } else if (obj.type === 'shape' && (obj.shapeType==='arrow'||obj.shapeType==='line')) {
        // move both endpoints
        obj.x  = sp.x  + dx; obj.y  = sp.y  + dy;
        obj.x2 = sp.x2 + dx; obj.y2 = sp.y2 + dy;
        // re-render the line element
        const el = canvasWorld.querySelector(`.shape-obj[data-obj-id="${id}"]`);
        if (el) {
          const newDx = obj.x2 - obj.x;
          const newDy = obj.y2 - obj.y;
          const nmX = Math.min(0,newDx)-10, nmY = Math.min(0,newDy)-10;
          el.style.left = (obj.x + nmX) + 'px';
          el.style.top  = (obj.y + nmY) + 'px';
        }
      } else {
        obj.x = sp.x + dx;
        obj.y = sp.y + dy;
        const el = canvasWorld.querySelector(`[data-obj-id="${id}"]`);
        if (el) { el.style.left = obj.x + 'px'; el.style.top = obj.y + 'px'; }
      }
    });
    positionSelToolbar();
  }

  function onUp() {
    selectedIds.forEach(id => {
      const el = document.querySelector(`.sticky-note[data-obj-id="${id}"]`);
      if (el) el.classList.remove('dragging');
    });
    if (moved) { History.push(); saveToStorage(); }
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ─── Box select
function startBoxSelect(e) {
  isBoxSelecting = true;
  boxSelectStart = { x: e.clientX, y: e.clientY };
  selBox.style.cssText = `display:block;left:${e.clientX}px;top:${e.clientY}px;width:0;height:0;`;

  function onMove(ev) {
    if (!isBoxSelecting) return;
    const x = Math.min(ev.clientX, boxSelectStart.x);
    const y = Math.min(ev.clientY, boxSelectStart.y);
    const w = Math.abs(ev.clientX - boxSelectStart.x);
    const h = Math.abs(ev.clientY - boxSelectStart.y);
    selBox.style.left   = x + 'px';
    selBox.style.top    = y + 'px';
    selBox.style.width  = w + 'px';
    selBox.style.height = h + 'px';
  }

  function onUp(ev) {
    isBoxSelecting = false;
    selBox.style.display = 'none';
    const x = Math.min(ev.clientX, boxSelectStart.x);
    const y = Math.min(ev.clientY, boxSelectStart.y);
    const w = Math.abs(ev.clientX - boxSelectStart.x);
    const h = Math.abs(ev.clientY - boxSelectStart.y);
    if (w > 6 && h > 6) applyBoxSelect(x, y, w, h);
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function applyBoxSelect(bx, by, bw, bh) {
  let hit = false;

  function overlaps(r) {
    return r.left < bx+bw && r.right > bx && r.top < by+bh && r.bottom > by;
  }

  // stickies
  document.querySelectorAll('.sticky-note').forEach(el => {
    if (overlaps(el.getBoundingClientRect())) {
      const obj = state.objects.find((o) => o.id === el.dataset.objId);
      if (obj && canSelectObjectForEdit(obj)) {
        selectObject(el.dataset.objId, true);
        hit = true;
      }
    }
  });
  // text nodes
  document.querySelectorAll('.canvas-text').forEach(el => {
    if (overlaps(el.getBoundingClientRect())) {
      const obj = state.objects.find((o) => o.id === el.dataset.objId);
      if (obj && canSelectObjectForEdit(obj)) {
        selectObject(el.dataset.objId, true);
        hit = true;
      }
    }
  });
  // shapes
  document.querySelectorAll('.shape-obj').forEach(el => {
    if (overlaps(el.getBoundingClientRect())) {
      const id = el.dataset.objId;
      const obj = state.objects.find((o) => o.id === id);
      if (!obj || !canSelectObjectForEdit(obj)) return;
      selectedIds.add(id);
      el.classList.add('selected-shape');
      hit = true;
    }
  });
  // images
  document.querySelectorAll('.image-obj').forEach(el => {
    if (overlaps(el.getBoundingClientRect())) {
      const id = el.dataset.objId;
      const obj = state.objects.find((o) => o.id === id);
      if (!obj || !canSelectObjectForEdit(obj)) return;
      selectedIds.add(id);
      el.classList.add('selected-image');
      hit = true;
    }
  });
  // strokes — check each point
  state.objects.forEach(obj => {
    if (obj.type !== 'stroke' || !canSelectObjectForEdit(obj)) return;
    const inBox = obj.points.some(p => {
      const sp = worldToScreen(p.x, p.y);
      return sp.x >= bx && sp.x <= bx+bw && sp.y >= by && sp.y <= by+bh;
    });
    if (inBox) { selectedIds.add(obj.id); hit = true; }
  });

  if (hit) {
    updateSelToolbar();
    if (selectedIds.size === 1) {
      const id = [...selectedIds][0];
      const obj = state.objects.find((o) => o.id === id);
      const el = document.querySelector(`[data-obj-id="${id}"]`);
      if (obj?.type === 'shape' && el) showShapeToolbar(el);
      else if (obj?.type === 'text' && el) showTextToolbar(el);
      else if (obj?.type === 'image' && el) showImageToolbar(el);
    }
  }
}

// ─── Delete all selected
function deleteSelectedObj() {
  if (selectedIds.size === 0) return;
  const deletableIds = [...selectedIds].filter((id) => {
    const obj = state.objects.find((o) => o.id === id);
    return obj && canEditObject(obj);
  });
  if (!deletableIds.length) {
    notifyNotYourWork();
    return;
  }
  deletableIds.forEach(id => {
    canvasWorld.querySelector(`.sticky-note[data-obj-id="${id}"]`)?.remove();
    canvasWorld.querySelector(`.canvas-text[data-obj-id="${id}"]`)?.remove();
    canvasWorld.querySelector(`.shape-obj[data-obj-id="${id}"]`)?.remove();
    canvasWorld.querySelector(`.image-obj[data-obj-id="${id}"]`)?.remove();
    document.querySelector(`path[data-obj-id="${id}"]`)?.remove();
    state.objects = state.objects.filter(o => o.id !== id);
  });
  selectedIds.clear();
  selectedStickyId = null;
  updateObjectCount();
  hideSelToolbar();
  History.push();
  saveToStorage();
  showToast('Deleted');
}

// ─── Duplicate all selected
function duplicateSelectedObj() {
  if (selectedIds.size === 0) return;
  const toSelect = [];
  selectedIds.forEach(id => {
    const obj = state.objects.find(o => o.id === id);
    if (!obj) return;
    const copy = cloneObjectWithNewOwner(obj, 24, 24);
    state.objects.push(copy);
    toSelect.push(copy.id);
    if (obj.type === 'sticky') {
      renderStickyFromObj(copy);
    } else if (obj.type === 'text') {
      const origEl = document.querySelector(`.canvas-text[data-obj-id="${id}"]`);
      if (origEl) {
        const newEl = origEl.cloneNode(true);
        newEl.dataset.objId = copy.id;
        newEl.style.left = copy.x + 'px';
        newEl.style.top  = copy.y + 'px';
        newEl.addEventListener('mousedown', ev => {
          if (state.tool === 'select') {
            selectObject(copy.id, ev.ctrlKey || ev.metaKey);
            startObjDrag(ev, copy.id);
            ev.stopPropagation();
          } else { ev.stopPropagation(); }
        });
        canvasWorld.appendChild(newEl);
      }
    } else if (obj.type === 'stroke') {
      copy.points = obj.points.map(p => ({ x: p.x + 24, y: p.y + 24 }));
      addStrokeToSvg(getDrawingSvg(), copy);
    }
  });
  clearAllSelections();
  toSelect.forEach(id => selectObject(id, true));
  updateObjectCount();
  History.push();
  saveToStorage();
  showToast(`Duplicated ${toSelect.length} object${toSelect.length > 1 ? 's' : ''}`);
}

// ─── Deselect when clicking empty canvas (already handled in handleSelectMousedown)
// but also handle it from the canvasRoot global listener
document.addEventListener('mousedown', (e) => {
  if (state.tool !== 'select' || !isEventOnCanvas(e)) return;
  const isOnObj = e.target.closest('.sticky-note') ||
                  e.target.closest('.canvas-text') ||
                  e.target.closest('#sel-toolbar') ||
                  e.target.closest('#sticky-color-picker');
  if (!isOnObj) clearAllSelections();
});

// ─── Keep toolbar position updated on scroll/zoom
document.addEventListener('wheel', () => positionSelToolbar(), { passive: true });



// ═══════════════════════════════════════════════════
// SHAPES & ARROWS — STEP 4
// ═══════════════════════════════════════════════════

const SHAPE_FILLS = [
  { name:'none',    color:'transparent', border:'1px solid rgba(20,20,20,0.15)' },
  { name:'white',   color:'#fbfbfb' },
  { name:'teal',    color:'#2e9d91' },
  { name:'blue',    color:'#4f71f2' },
  { name:'orange',  color:'#f2541d' },
  { name:'black',   color:'#141414' },
];

const SHAPE_STROKES = [
  { name:'black',   color:'#141414' },
  { name:'teal',    color:'#2e9d91' },
  { name:'blue',    color:'#4f71f2' },
  { name:'orange',  color:'#f2541d' },
  { name:'white',   color:'#fbfbfb' },
  { name:'none',    color:'transparent' },
];

let currentShapeType  = 'rect';
let selectedShapeId   = null;

// shape draw state
state.isShaping       = false;
let shapeDrawStart    = null;
let shapePreviewEl    = null;

// ── Init color swatches in shape toolbar
function initShapeToolbar() {
  const fillWrap   = document.getElementById('stb-fills');
  const strokeWrap = document.getElementById('stb-strokes');
  if (!fillWrap || !strokeWrap) return;
  if (fillWrap.dataset.toolbarInited === '1') return;
  fillWrap.dataset.toolbarInited = '1';

  SHAPE_FILLS.forEach(f => {
    const s = document.createElement('div');
    s.className = 'stb-swatch';
    s.style.background = f.color;
    if (f.border) s.style.border = f.border;
    s.title = f.name;
    s.dataset.fill = f.name;
    s.addEventListener('click', ev => {
      ev.stopPropagation();
      applyShapeFill(selectedShapeId, f.color);
      fillWrap.querySelectorAll('.stb-swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
    });
    fillWrap.appendChild(s);
  });

  SHAPE_STROKES.forEach(st => {
    const s = document.createElement('div');
    s.className = 'stb-swatch';
    s.style.background = st.color;
    if (st.name === 'none') { s.style.background='transparent'; s.style.border='1px dashed rgba(255,255,255,0.3)'; }
    s.title = st.name;
    s.dataset.stroke = st.name;
    s.addEventListener('click', ev => {
      ev.stopPropagation();
      applyShapeStroke(selectedShapeId, st.color);
      strokeWrap.querySelectorAll('.stb-swatch').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
    });
    strokeWrap.appendChild(s);
  });
}

// ── Set active shape type
function setShapeType(type) {
  currentShapeType = type;
  document.querySelectorAll('.sp-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('sp-' + type);
  if (btn) btn.classList.add('active');
}

// Helper: is this shape type a line/arrow?
function shapeIsLine(type) {
  const def = SHAPE_REGISTRY.find(r => r.id === type);
  return def ? def.isLine : false;
}

// ── Start drawing a shape
function startShapeDraw(e) {
  e.preventDefault();
  state.isShaping = true;
  shapeDrawStart  = screenToWorld(e.clientX, e.clientY);

  // create preview element
  shapePreviewEl = document.createElement('div');
  shapePreviewEl.className = 'shape-preview';
  shapePreviewEl.style.cssText = `left:${shapeDrawStart.x}px;top:${shapeDrawStart.y}px;width:0;height:0;`;
  shapePreviewEl.innerHTML = buildShapeSVG(currentShapeType, 0, 0, '#fbfbfb', '#141414', 1.5);
  canvasWorld.appendChild(shapePreviewEl);
}

function continueShapeDraw(e) {
  if (!state.isShaping || !shapeDrawStart || !shapePreviewEl) return;
  const wp = screenToWorld(e.clientX, e.clientY);
  let x = Math.min(wp.x, shapeDrawStart.x);
  let y = Math.min(wp.y, shapeDrawStart.y);
  let w = Math.abs(wp.x - shapeDrawStart.x);
  let h = Math.abs(wp.y - shapeDrawStart.y);

  // shift = constrain to square/circle
  if (e.shiftKey) { const s = Math.max(w,h); w = s; h = s; }

  // for arrows and lines — don't constrain
  const isLine = shapeIsLine(currentShapeType);
  if (isLine) {
    const endWp = wp;
    shapePreviewEl.style.left = shapeDrawStart.x + 'px';
    shapePreviewEl.style.top  = shapeDrawStart.y + 'px';
    shapePreviewEl.innerHTML  = buildLineSVG(currentShapeType,
      0, 0,
      endWp.x - shapeDrawStart.x,
      endWp.y - shapeDrawStart.y, '#141414', 2);
    return;
  }

  shapePreviewEl.style.left   = x + 'px';
  shapePreviewEl.style.top    = y + 'px';
  shapePreviewEl.style.width  = w + 'px';
  shapePreviewEl.style.height = h + 'px';
  shapePreviewEl.innerHTML    = buildShapeSVG(currentShapeType, w, h, 'rgba(79,113,242,0.1)', '#4f71f2', 1.5);
}

function endShapeDraw(e) {
  if (!state.isShaping) return;
  state.isShaping = false;

  const wp = screenToWorld(e.clientX, e.clientY);
  const isLine = shapeIsLine(currentShapeType);

  let obj;
  if (isLine) {
    const dx = wp.x - shapeDrawStart.x;
    const dy = wp.y - shapeDrawStart.y;
    const len = Math.sqrt(dx*dx + dy*dy);
    if (len < 10) { shapePreviewEl?.remove(); shapePreviewEl = null; return; }
    obj = {
      id: uid(), type: 'shape',
      shapeType: currentShapeType,
      x: shapeDrawStart.x, y: shapeDrawStart.y,
      x2: wp.x, y2: wp.y,
      fill: 'none', stroke: '#141414', strokeWidth: 2,
      label: '',
    };
  } else {
    let x = Math.min(wp.x, shapeDrawStart.x);
    let y = Math.min(wp.y, shapeDrawStart.y);
    let w = Math.abs(wp.x - shapeDrawStart.x);
    let h = Math.abs(wp.y - shapeDrawStart.y);
    if (e.shiftKey) { const s = Math.max(w,h); w = s; h = s; }
    if (w < 10 || h < 10) { shapePreviewEl?.remove(); shapePreviewEl = null; return; }
    obj = {
      id: uid(), type: 'shape',
      shapeType: currentShapeType,
      x, y, w, h,
      fill: '#fbfbfb', stroke: '#141414', strokeWidth: 1.5,
      label: '',
    };
  }

  shapePreviewEl?.remove();
  shapePreviewEl = null;

  stampOwner(obj);
  state.objects.push(obj);
  updateObjectCount();
  renderShapeObj(obj);
  History.push();
  saveToStorage();
  setTool('select');
  selectObject(obj.id, false);
}

// ── Build SVG markup for a shape
// ═══════════════════════════════════════════════════
// SHAPE REGISTRY — add new shapes here only
// Each entry: { id, label, isLine, icon(svg string), build(w,h,f,s,sw) }
// ═══════════════════════════════════════════════════
const SHAPE_REGISTRY = [
  {
    id: 'rect', label: 'Rectangle', isLine: false,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/></svg>`,
    build: (w,h,f,s,sw) => {
      const p=sw; const iw=Math.max(1,w-p*2); const ih=Math.max(1,h-p*2);
      return `<rect x="${p}" y="${p}" width="${iw}" height="${ih}" rx="4" fill="${f}" stroke="${s}" stroke-width="${sw}"/>`;
    }
  },
  {
    id: 'circle', label: 'Circle', isLine: false,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.5"/></svg>`,
    build: (w,h,f,s,sw) => {
      const p=sw; const iw=Math.max(1,w-p*2); const ih=Math.max(1,h-p*2);
      return `<ellipse cx="${w/2}" cy="${h/2}" rx="${iw/2}" ry="${ih/2}" fill="${f}" stroke="${s}" stroke-width="${sw}"/>`;
    }
  },
  {
    id: 'diamond', label: 'Diamond', isLine: false,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="9,1 17,9 9,17 1,9" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
    build: (w,h,f,s,sw) => {
      const p=sw; const cx=w/2,cy=h/2;
      return `<polygon points="${cx},${p} ${w-p},${cy} ${cx},${h-p} ${p},${cy}" fill="${f}" stroke="${s}" stroke-width="${sw}"/>`;
    }
  },
  {
    id: 'triangle', label: 'Triangle', isLine: false,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="9,2 16,16 2,16" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
    build: (w,h,f,s,sw) => {
      const p=sw;
      return `<polygon points="${w/2},${p} ${w-p},${h-p} ${p},${h-p}" fill="${f}" stroke="${s}" stroke-width="${sw}"/>`;
    }
  },
  {
    id: 'hexagon', label: 'Hexagon', isLine: false,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="9,1 16,4.5 16,13.5 9,17 2,13.5 2,4.5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
    build: (w,h,f,s,sw) => {
      const p=sw; const cx=w/2,cy=h/2; const rx=(w-p*2)/2,ry=(h-p*2)/2;
      const pts = [0,1,2,3,4,5].map(i => {
        const a = Math.PI/180*(60*i-30);
        return `${cx+rx*Math.cos(a)},${cy+ry*Math.sin(a)}`;
      }).join(' ');
      return `<polygon points="${pts}" fill="${f}" stroke="${s}" stroke-width="${sw}"/>`;
    }
  },
  {
    id: 'parallelogram', label: 'Parallelogram', isLine: false,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="5,3 17,3 13,15 1,15" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
    build: (w,h,f,s,sw) => {
      const p=sw; const off=w*0.2;
      return `<polygon points="${off+p},${p} ${w-p},${p} ${w-off-p},${h-p} ${p},${h-p}" fill="${f}" stroke="${s}" stroke-width="${sw}"/>`;
    }
  },
  {
    id: 'cylinder', label: 'Cylinder', isLine: false,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><ellipse cx="9" cy="4" rx="6" ry="2.5" stroke="currentColor" stroke-width="1.5"/><path d="M3 4v10" stroke="currentColor" stroke-width="1.5"/><path d="M15 4v10" stroke="currentColor" stroke-width="1.5"/><ellipse cx="9" cy="14" rx="6" ry="2.5" stroke="currentColor" stroke-width="1.5"/></svg>`,
    build: (w,h,f,s,sw) => {
      const p=sw; const ew=w-p*2; const eh=Math.min(h*0.2,30); const cy1=p+eh/2; const cy2=h-p-eh/2;
      return `<rect x="${p}" y="${cy1}" width="${ew}" height="${cy2-cy1}" fill="${f}" stroke="none"/>
        <ellipse cx="${w/2}" cy="${cy2}" rx="${ew/2}" ry="${eh/2}" fill="${f}" stroke="${s}" stroke-width="${sw}"/>
        <line x1="${p}" y1="${cy1}" x2="${p}" y2="${cy2}" stroke="${s}" stroke-width="${sw}"/>
        <line x1="${w-p}" y1="${cy1}" x2="${w-p}" y2="${cy2}" stroke="${s}" stroke-width="${sw}"/>
        <ellipse cx="${w/2}" cy="${cy1}" rx="${ew/2}" ry="${eh/2}" fill="${f}" stroke="${s}" stroke-width="${sw}"/>`;
    }
  },
  {
    id: 'star', label: 'Star', isLine: false,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><polygon points="9,1 11,7 17,7 12,11 14,17 9,13 4,17 6,11 1,7 7,7" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`,
    build: (w,h,f,s,sw) => {
      const cx=w/2,cy=h/2; const outerR=Math.min(w,h)/2-sw; const innerR=outerR*0.45;
      const pts = [];
      for(let i=0;i<10;i++){
        const a=Math.PI/180*(36*i-90);
        const r=i%2===0?outerR:innerR;
        pts.push(`${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${f}" stroke="${s}" stroke-width="${sw}"/>`;
    }
  },
  {
    id: 'arrow', label: 'Arrow', isLine: true,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 9h14M11 4l5 5-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    build: null
  },
  {
    id: 'line', label: 'Line', isLine: true,
    icon: `<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 16L16 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    build: null
  },
];

// ── Build SVG for any registered shape
function buildShapeSVG(type, w, h, fill, stroke, sw) {
  const f  = fill   || '#fbfbfb';
  const s  = stroke || '#141414';
  const sw2 = sw    || 1.5;
  const def = SHAPE_REGISTRY.find(r => r.id === type);
  const inner = def ? def.build(w, h, f, s, sw2) : '';
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

// ── Build the shape picker UI from registry
function buildShapePicker() {
  const picker = document.getElementById('shape-picker');
  if (!picker) return;
  picker.innerHTML = '';
  SHAPE_REGISTRY.forEach((shape, i) => {
    const btn = document.createElement('button');
    btn.className = 'sp-btn' + (i === 0 ? ' active' : '');
    btn.id = 'sp-' + shape.id;
    btn.dataset.shape = shape.id;
    btn.dataset.tip = shape.label;
    btn.innerHTML = shape.icon;
    btn.addEventListener('click', () => setShapeType(shape.id));
    picker.appendChild(btn);
  });
}

function buildLineSVG(type, x1, y1, x2, y2, stroke, sw) {
  const minX = Math.min(x1,x2)-10, minY = Math.min(y1,y2)-10;
  const maxX = Math.max(x1,x2)+10, maxY = Math.max(y1,y2)+10;
  const vw = maxX-minX, vh = maxY-minY;
  const lx1=x1-minX, ly1=y1-minY, lx2=x2-minX, ly2=y2-minY;

  let arrowHead = '';
  if (type === 'arrow') {
    arrowHead = `<defs>
      <marker id="ah-${uid()}" viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M1 1L9 5L1 9" fill="none" stroke="${stroke}" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round"/>
      </marker>
    </defs>`;
  }
  const markerId = type === 'arrow' ? `marker-end="url(#ah-inline)"` : '';
  return `<svg width="${vw}" height="${vh}" viewBox="${minX} ${minY} ${vw} ${vh}" overflow="visible" style="position:absolute;top:${minY}px;left:${minX}px">
    ${type==='arrow' ? `<defs><marker id="ah-inline" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke="${stroke}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>` : ''}
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
      stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"
      ${type==='arrow' ? 'marker-end="url(#ah-inline)"' : ''}/>
  </svg>`;
}

// ── Render a shape object to the DOM
function renderShapeObj(obj) {
  bindBoardDom();
  if (!canvasWorld) return null;
  const el = document.createElement('div');
  el.className = 'shape-obj';
  el.dataset.objId = obj.id;

  const isLine = shapeIsLine(obj.shapeType);

  if (isLine) {
    const dx = (obj.x2||0) - obj.x;
    const dy = (obj.y2||0) - obj.y;
    const minX = Math.min(0,dx)-10, minY = Math.min(0,dy)-10;
    const maxX = Math.max(0,dx)+10, maxY = Math.max(0,dy)+10;
    const vw = maxX-minX, vh = maxY-minY;
    el.style.cssText = `position:absolute;left:${obj.x+minX}px;top:${obj.y+minY}px;
      width:${vw}px;height:${vh}px;pointer-events:none;`;

    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('width', vw); svg.setAttribute('height', vh);
    svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    svg.style.cssText='overflow:visible;pointer-events:none;';

    if (obj.shapeType === 'arrow') {
      const mid = 'ah-' + obj.id;
      const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
      defs.innerHTML = `<marker id="${mid}" viewBox="0 0 10 10" refX="9" refY="5"
        markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M1 1L9 5L1 9" fill="none" stroke="${obj.stroke||'#141414'}" stroke-width="1.5"
          stroke-linecap="round" stroke-linejoin="round"/></marker>`;
      svg.appendChild(defs);
    }

    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1', -minX); line.setAttribute('y1', -minY);
    line.setAttribute('x2', dx-minX); line.setAttribute('y2', dy-minY);
    line.setAttribute('stroke', obj.stroke||'#141414');
    line.setAttribute('stroke-width', obj.strokeWidth||2);
    line.setAttribute('stroke-linecap','round');
    if (obj.shapeType === 'arrow') line.setAttribute('marker-end',`url(#ah-${obj.id})`);
    svg.appendChild(line);

    // hit area (wide invisible line for easier clicking)
    const hit = document.createElementNS('http://www.w3.org/2000/svg','line');
    hit.setAttribute('x1', -minX); hit.setAttribute('y1', -minY);
    hit.setAttribute('x2', dx-minX); hit.setAttribute('y2', dy-minY);
    hit.setAttribute('stroke','transparent'); hit.setAttribute('stroke-width','12');
    hit.style.pointerEvents = 'stroke'; hit.style.cursor = 'pointer';
    svg.appendChild(hit);
    svg.style.overflow = 'visible';
    el.appendChild(svg);

    // ── endpoint handles (shown when selected)
    function makeEndpointHandle(isStart) {
      const h = document.createElement('div');
      h.style.cssText = `position:absolute;width:12px;height:12px;
        background:#fff;border:2px solid #2e9d91;border-radius:50%;
        cursor:crosshair;display:none;transform:translate(-50%,-50%);
        z-index:200;pointer-events:all;`;
      h.dataset.endpoint = isStart ? 'start' : 'end';
      el.appendChild(h);

      function positionHandle() {
        // compute screen position of endpoint relative to el's parent (canvasWorld)
        if (isStart) {
          h.style.left = '0px';
          h.style.top  = '0px';
        } else {
          h.style.left = (obj.x2 - obj.x) + 'px';
          h.style.top  = (obj.y2 - obj.y) + 'px';
        }
      }
      positionHandle();

      h.addEventListener('mousedown', ev => {
        ev.stopPropagation(); ev.preventDefault();
        const startMX = ev.clientX, startMY = ev.clientY;
        const origX  = isStart ? obj.x  : obj.x2;
        const origY  = isStart ? obj.y  : obj.y2;
        let didMove = false;

        function onMove(mv) {
          didMove = true;
          const dx2 = (mv.clientX - startMX) / state.zoom;
          const dy2 = (mv.clientY - startMY) / state.zoom;
          if (isStart) { obj.x = origX + dx2; obj.y = origY + dy2; }
          else         { obj.x2 = origX + dx2; obj.y2 = origY + dy2; }
          // full re-render the line element in place
          rebuildLineEl();
        }

        function onUp() {
          if (didMove) { History.push(); saveToStorage(); }
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });

      return { el: h, reposition: positionHandle };
    }

    const startH = makeEndpointHandle(true);
    const endH   = makeEndpointHandle(false);

    // store reposition refs on el for selectShapeObj
    el._lineHandles = [startH, endH];

    // rebuildLineEl — fully re-renders the SVG in-place when endpoints change
    function rebuildLineEl() {
      const newDx = obj.x2 - obj.x;
      const newDy = obj.y2 - obj.y;
      const nmX = Math.min(0,newDx)-10, nmY = Math.min(0,newDy)-10;
      const nmXe = Math.max(0,newDx)+10, nmYe = Math.max(0,newDy)+10;
      const nvw = nmXe-nmX, nvh = nmYe-nmY;

      el.style.left = obj.x + nmX + 'px';
      el.style.top  = obj.y + nmY + 'px';
      el.style.width  = nvw + 'px';
      el.style.height = nvh + 'px';

      const s = el.querySelector('svg');
      if (s) {
        s.setAttribute('width', nvw);
        s.setAttribute('height', nvh);
        s.setAttribute('viewBox', `0 0 ${nvw} ${nvh}`);
        // update line coords
        const lines = s.querySelectorAll('line');
        lines.forEach(l => {
          l.setAttribute('x1', -nmX); l.setAttribute('y1', -nmY);
          l.setAttribute('x2', newDx-nmX); l.setAttribute('y2', newDy-nmY);
        });
      }
      // reposition handles relative to el
      startH.el.style.left = -nmX + 'px';
      startH.el.style.top  = -nmY + 'px';
      endH.el.style.left   = (newDx-nmX) + 'px';
      endH.el.style.top    = (newDy-nmY) + 'px';
    }

    el.style.pointerEvents = 'none';
    svg.style.pointerEvents = 'none';

    // click on hit area
    hit.addEventListener('mousedown', ev => {
      if (state.tool === 'select') {
        ev.stopPropagation();
        selectShapeObj(obj.id, el, ev.ctrlKey||ev.metaKey);
        startObjDrag(ev, obj.id);
      }
    });

  } else {
    // ── box shape
    el.style.cssText = `position:absolute;left:${obj.x}px;top:${obj.y}px;
      width:${obj.w}px;height:${obj.h}px;user-select:none;`;

    // SVG layer — rebuilt cleanly via updateShapeSvg()
    const svgWrap = document.createElement('div');
    svgWrap.className = 'shape-svg-wrap';
    svgWrap.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    el.appendChild(svgWrap);

    function updateShapeSvg() {
      svgWrap.innerHTML = buildShapeSVG(obj.shapeType, obj.w, obj.h, obj.fill, obj.stroke, obj.strokeWidth);
      const s = svgWrap.querySelector('svg');
      if (s) s.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;';
    }
    updateShapeSvg();

    // label layer
    const label = document.createElement('div');
    label.className = 'shape-label';
    label.contentEditable = 'false';
    label.textContent = obj.label || '';
    label.style.color = (obj.fill === '#141414') ? '#fbfbfb' : '#141414';
    el.appendChild(label);

    // double-click to edit label
    el.addEventListener('dblclick', ev => {
      ev.stopPropagation();
      label.contentEditable = 'true';
      label.classList.add('editable');
      label.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(label);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      } catch(e) {}
    });
    label.addEventListener('blur', () => {
      label.contentEditable = 'false';
      label.classList.remove('editable');
      obj.label = label.textContent;
      History.push(); saveToStorage();
    });
    label.addEventListener('mousedown', ev => ev.stopPropagation());
    label.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' || (ev.key === 'Enter' && !ev.shiftKey)) {
        label.blur(); ev.preventDefault();
      }
    });

    // ── 8 resize handles (corners + edges)
    const HANDLES = [
      { pos:'tl', cursor:'nwse-resize', style:'top:-5px;left:-5px;' },
      { pos:'tm', cursor:'ns-resize',   style:'top:-5px;left:50%;transform:translateX(-50%);' },
      { pos:'tr', cursor:'nesw-resize', style:'top:-5px;right:-5px;' },
      { pos:'ml', cursor:'ew-resize',   style:'top:50%;left:-5px;transform:translateY(-50%);' },
      { pos:'mr', cursor:'ew-resize',   style:'top:50%;right:-5px;transform:translateY(-50%);' },
      { pos:'bl', cursor:'nesw-resize', style:'bottom:-5px;left:-5px;' },
      { pos:'bm', cursor:'ns-resize',   style:'bottom:-5px;left:50%;transform:translateX(-50%);' },
      { pos:'br', cursor:'nwse-resize', style:'bottom:-5px;right:-5px;' },
    ];

    HANDLES.forEach(h => {
      const rh = document.createElement('div');
      rh.className = 'shape-resize-handle';
      rh.style.cssText = h.style + `cursor:${h.cursor};display:none;position:absolute;`;
      rh.dataset.pos = h.pos;
      el.appendChild(rh);

      rh.addEventListener('mousedown', ev => {
        ev.stopPropagation(); ev.preventDefault();
        const startX = ev.clientX, startY = ev.clientY;
        const origX = obj.x, origY = obj.y;
        const origW = obj.w, origH = obj.h;
        let didResize = false;

        function onMove(mv) {
          didResize = true;
          const dx = (mv.clientX - startX) / state.zoom;
          const dy = (mv.clientY - startY) / state.zoom;
          const pos = h.pos;

          // width
          if (pos.includes('r')) obj.w = Math.max(30, origW + dx);
          if (pos.includes('l')) { obj.w = Math.max(30, origW - dx); obj.x = origX + (origW - obj.w); }
          // height
          if (pos.includes('b')) obj.h = Math.max(30, origH + dy);
          if (pos === 'tm' || pos === 'tl' || pos === 'tr') { obj.h = Math.max(30, origH - dy); obj.y = origY + (origH - obj.h); }

          el.style.left   = obj.x + 'px';
          el.style.top    = obj.y + 'px';
          el.style.width  = obj.w + 'px';
          el.style.height = obj.h + 'px';
          updateShapeSvg();
        }

        function onUp() {
          if (didResize) { History.push(); saveToStorage(); }
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });

    // store reference for color updates
    el._updateShapeSvg = updateShapeSvg;
    el._label = label;
  }

  // click to select
  el.addEventListener('mousedown', ev => {
    if (state.tool === 'select') {
      ev.stopPropagation();
      // if already part of multi-selection, don't clear — just drag the group
      if (selectedIds.size > 1 && selectedIds.has(obj.id)) {
        startObjDrag(ev, obj.id);
      } else {
        selectShapeObj(obj.id, el, ev.ctrlKey||ev.metaKey);
        startObjDrag(ev, obj.id);
      }
    }
  });

  appendToCanvasWorld(el);
  return el;
}

// ── Select a shape
function selectShapeObj(id, el, addMode) {
  const obj = state.objects.find((o) => o.id === id);
  if (!obj || !canSelectObjectForEdit(obj)) {
    notifyNotYourWork();
    return;
  }
  if (!addMode) clearAllSelections();
  selectedShapeId = id;
  selectedIds.add(id);
  el.classList.add('selected-shape');

  // show resize handles (box shapes) or endpoint handles (lines/arrows)
  el.querySelectorAll('.shape-resize-handle').forEach(rh => rh.style.display = 'block');
  if (el._lineHandles) el._lineHandles.forEach(h => h.el.style.display = 'block');

  // show shape toolbar
  showShapeToolbar(el);
}

function showShapeToolbar(el) {
  const tb = document.getElementById('shape-toolbar');
  if (!tb) return;
  hideSelToolbar();
  tb.classList.add('visible');

  requestAnimationFrame(() => {
    positionFloatingPanel(tb, {
      anchorRect: el.getBoundingClientRect(),
      excludeIds: ['shape-toolbar'],
    });
    repositionSelectionAiPopup();
  });
}

function hideShapeToolbar() {
  const tb = document.getElementById('shape-toolbar');
  if (tb) tb.classList.remove('visible');
}

/** Line/arrow shapes have no _updateShapeSvg — sync stroke from obj to the live SVG. */
function syncLineShapeAppearance(el, obj) {
  const svg = el.querySelector('svg');
  if (!svg) return;
  const lines = [...svg.querySelectorAll('line')];
  const main = lines.find((l) => l.getAttribute('stroke') !== 'transparent');
  if (main) {
    const hide = obj.stroke === 'transparent' || obj.stroke === 'none';
    main.setAttribute('stroke', hide ? 'transparent' : (obj.stroke || '#141414'));
    main.setAttribute('stroke-width', hide ? '0' : String(obj.strokeWidth ?? 2));
  }
  if (obj.shapeType === 'arrow') {
    const pth = svg.querySelector('defs marker path');
    if (pth) {
      const hide = obj.stroke === 'transparent' || obj.stroke === 'none';
      pth.setAttribute('stroke', hide ? 'transparent' : (obj.stroke || '#141414'));
    }
  }
}

// ── Apply fill/stroke to selected shape
function applyShapeFill(id, color) {
  const obj = state.objects.find(o => o.id === id);
  const el  = document.querySelector(`.shape-obj[data-obj-id="${id}"]`);
  if (!obj || !el || !guardEditObject(obj)) return;
  obj.fill = color;
  if (el._updateShapeSvg) el._updateShapeSvg();
  if (el._label) el._label.style.color = color === '#141414' ? '#fbfbfb' : '#141414';
  History.push(); saveToStorage();
}

function applyShapeStroke(id, color) {
  const obj = state.objects.find(o => o.id === id);
  const el  = document.querySelector(`.shape-obj[data-obj-id="${id}"]`);
  if (!obj || !el || !guardEditObject(obj)) return;
  obj.stroke = color;
  if (el._updateShapeSvg) el._updateShapeSvg();
  else if (shapeIsLine(obj.shapeType)) syncLineShapeAppearance(el, obj);
  History.push(); saveToStorage();
}

// ── Delete / Duplicate selected shape
function deleteSelectedShape() {
  if (!selectedShapeId) return;
  document.querySelector(`.shape-obj[data-obj-id="${selectedShapeId}"]`)?.remove();
  state.objects = state.objects.filter(o => o.id !== selectedShapeId);
  selectedIds.delete(selectedShapeId);
  selectedShapeId = null;
  hideShapeToolbar();
  updateObjectCount();
  History.push(); saveToStorage();
  showToast('Deleted');
}

function duplicateSelectedShape() {
  if (!selectedShapeId) return;
  const obj = state.objects.find(o => o.id === selectedShapeId);
  if (!obj) return;
  const copy = cloneObjectWithNewOwner(obj, 24, 24);
  state.objects.push(copy);
  updateObjectCount();
  renderShapeObj(copy);
  clearAllSelections();
  const newEl = document.querySelector(`.shape-obj[data-obj-id="${copy.id}"]`);
  if (newEl) selectShapeObj(copy.id, newEl, false);
  History.push(); saveToStorage();
  showToast('Duplicated');
}

// ── Patch clearAllSelections to also deselect shapes
const _origClearAll = clearAllSelections;
clearAllSelections = function() {
  _origClearAll();
  document.querySelectorAll('.shape-obj.selected-shape').forEach(el => {
    el.classList.remove('selected-shape');
    el.querySelectorAll('.shape-resize-handle').forEach(rh => rh.style.display = 'none');
    if (el._lineHandles) el._lineHandles.forEach(h => h.el.style.display = 'none');
  });
  selectedShapeId = null;
  hideShapeToolbar();
};

// arrow/line drag handled by startObjDrag directly

// ── Keyboard shortcut: Delete selected shape
document.addEventListener('keydown', ev => {
  if (!selectedShapeId) return;
  const isEditing = document.activeElement.tagName === 'TEXTAREA'
    || document.activeElement.tagName === 'INPUT'
    || document.activeElement.isContentEditable;
  if (isEditing) return;
  if (ev.key === 'Delete' || ev.key === 'Backspace') {
    ev.preventDefault(); deleteSelectedShape();
  }
  if ((ev.metaKey||ev.ctrlKey) && ev.key==='d') {
    ev.preventDefault(); duplicateSelectedShape();
  }
}, true);

// ── Init on load
whenDomReady(() => {
  initShapeToolbar();
  buildShapePicker();
});


// ═══════════════════════════════════════════════════
// IMAGES — STEP 5
// ═══════════════════════════════════════════════════

let selectedImageId = null;

function dataUrlToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mime = (header.match(/:(.*?);/) || [])[1] || 'image/jpeg';
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function compressImageDataUrl(dataUrl, maxDim = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      const scale = Math.min(1, maxDim / Math.max(w, h, 1));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const cv = document.createElement('canvas');
      cv.width = cw;
      cv.height = ch;
      const ctx = cv.getContext('2d');
      const isPng = dataUrl.includes('image/png');
      if (!isPng) {
        ctx.fillStyle = '#fbfbfb';
        ctx.fillRect(0, 0, cw, ch);
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      resolve({
        dataUrl: isPng ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', quality),
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
      });
    };
    img.onerror = () => reject(new Error('Image decode failed'));
    img.src = dataUrl;
  });
}

async function uploadBoardImageDataUrl(dataUrl, objectId, ext = 'jpg') {
  const client = window.supabaseClient;
  const boardId = boardAccess.boardId;
  if (!client || !boardId) return null;
  try {
    const blob = dataUrlToBlob(dataUrl);
    const path = `${boardId}/${objectId}.${ext}`;
    const { error } = await client.storage.from(BOARD_IMAGES_BUCKET).upload(path, blob, {
      upsert: true,
      cacheControl: '3600',
      contentType: blob.type || (ext === 'png' ? 'image/png' : 'image/jpeg'),
    });
    if (error) {
      console.error('[board] image upload failed', error.message);
      return null;
    }
    return getBoardImagePublicUrl(objectId, ext);
  } catch (e) {
    console.error('[board] image upload failed', e);
    return null;
  }
}

async function resolveImageSrcForBoard(dataUrl, objectId) {
  const compressed = await compressImageDataUrl(dataUrl);
  const ext = compressed.dataUrl.includes('image/png') ? 'png' : 'jpg';
  const uploaded = await uploadBoardImageDataUrl(compressed.dataUrl, objectId, ext);
  if (!uploaded) {
    throw new Error('Image upload failed — create the board-images bucket in Supabase (run supabase_board_images_storage.sql)');
  }
  return {
    src: uploaded,
    naturalW: compressed.naturalW,
    naturalH: compressed.naturalH,
    uploaded: true,
  };
}

async function createImageObjectAtWorldPoint(dataUrl, naturalW, naturalH, worldX, worldY) {
  showToast('Uploading image…');
  const objectId = uid();
  let resolved;
  try {
    resolved = await resolveImageSrcForBoard(dataUrl, objectId);
  } catch (e) {
    console.error('[board] image upload failed', e);
    showToast('Image upload failed — check Supabase Storage (board-images bucket)');
    return null;
  }
  const srcNaturalW = resolved.naturalW || naturalW;
  const srcNaturalH = resolved.naturalH || naturalH;

  const maxW = 600;
  const scale = srcNaturalW > maxW ? maxW / srcNaturalW : 1;
  const w = Math.round(srcNaturalW * scale);
  const h = Math.round(srcNaturalH * scale);

  const obj = stampOwner({
    id: objectId,
    type: 'image',
    x: worldX - w / 2,
    y: worldY - h / 2,
    w, h,
    src: resolved.src,
    naturalW: srcNaturalW,
    naturalH: srcNaturalH,
    opacity: 1,
  });

  state.objects.push(obj);
  updateObjectCount();
  renderImageObj(obj);
  History.push();
  saveToStorage();
  publishBoardStateUpdate({ reason: 'state' });
  setTool('select');
  selectImageObj(obj.id);
  showToast('Image placed');
  return obj;
}

// ── Place image at center of current viewport
async function placeImageOnCanvas(dataUrl, naturalW, naturalH) {
  const cx = (window.innerWidth / 2 - state.panX) / state.zoom;
  const cy = (window.innerHeight / 2 - state.panY) / state.zoom;
  await createImageObjectAtWorldPoint(dataUrl, naturalW, naturalH, cx, cy);
}

// ── Render image object to DOM
function renderImageObj(obj) {
  bindBoardDom();
  if (!canvasWorld) return null;
  const hydrated = hydrateImageObject(obj);
  const el = document.createElement('div');
  el.className = 'image-obj';
  el.dataset.objId = obj.id;
  el.style.cssText = `left:${obj.x}px;top:${obj.y}px;width:${obj.w}px;height:${obj.h}px;`;

  const img = document.createElement('img');
  img.draggable = false;
  const displaySrc = hydrated.src || '';
  if (displaySrc) img.src = displaySrc;
  img.onerror = () => {
    if (!obj.src && displaySrc.endsWith('.jpg')) {
      const pngUrl = getBoardImagePublicUrl(obj.id, 'png');
      if (pngUrl && img.src !== pngUrl) img.src = pngUrl;
    }
  };
  el.appendChild(img);

  // ── 8 resize handles
  const HANDLES = [
    { pos:'tl', cur:'nwse-resize', css:'top:-5px;left:-5px;' },
    { pos:'tm', cur:'ns-resize',   css:'top:-5px;left:50%;transform:translateX(-50%);' },
    { pos:'tr', cur:'nesw-resize', css:'top:-5px;right:-5px;' },
    { pos:'ml', cur:'ew-resize',   css:'top:50%;left:-5px;transform:translateY(-50%);' },
    { pos:'mr', cur:'ew-resize',   css:'top:50%;right:-5px;transform:translateY(-50%);' },
    { pos:'bl', cur:'nesw-resize', css:'bottom:-5px;left:-5px;' },
    { pos:'bm', cur:'ns-resize',   css:'bottom:-5px;left:50%;transform:translateX(-50%);' },
    { pos:'br', cur:'nwse-resize', css:'bottom:-5px;right:-5px;' },
  ];

  HANDLES.forEach(h => {
    const rh = document.createElement('div');
    rh.className = 'image-resize-handle';
    rh.style.cssText = h.css + `cursor:${h.cur};position:absolute;`;
    rh.dataset.pos = h.pos;
    el.appendChild(rh);

    rh.addEventListener('mousedown', ev => {
      ev.stopPropagation(); ev.preventDefault();
      const startX = ev.clientX, startY = ev.clientY;
      const origX = obj.x, origY = obj.y;
      const origW = obj.w, origH = obj.h;
      const ratio = obj.naturalW / obj.naturalH;
      let didResize = false;

      function onMove(mv) {
        didResize = true;
        const dx = (mv.clientX - startX) / state.zoom;
        const dy = (mv.clientY - startY) / state.zoom;
        const pos = h.pos;
        let newW = origW, newH = origH;

        if (pos.includes('r')) newW = Math.max(30, origW + dx);
        if (pos.includes('l')) { newW = Math.max(30, origW - dx); obj.x = origX + (origW - newW); }
        if (pos.includes('b')) newH = Math.max(30, origH + dy);
        if (pos === 'tm'||pos === 'tl'||pos === 'tr') {
          newH = Math.max(30, origH - dy);
          obj.y = origY + (origH - newH);
        }

        // hold shift or corner = maintain aspect ratio
        if (mv.shiftKey || (pos !== 'tm' && pos !== 'bm' && pos !== 'ml' && pos !== 'mr')) {
          if (pos.includes('r') || pos === 'tm' || pos === 'bm') {
            newH = newW / ratio;
          } else {
            newW = newH * ratio;
          }
        }

        obj.w = newW; obj.h = newH;
        el.style.left   = obj.x + 'px';
        el.style.top    = obj.y + 'px';
        el.style.width  = obj.w + 'px';
        el.style.height = obj.h + 'px';
        updateImageSizeLabel();
        if (document.getElementById('image-toolbar').classList.contains('visible')) {
          showImageToolbar(el);
        }
      }

      function onUp() {
        if (didResize) { History.push(); saveToStorage(); }
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  // ── click to select
  el.addEventListener('mousedown', ev => {
    if (state.tool === 'select') {
      ev.stopPropagation();
      if (selectedIds.size > 1 && selectedIds.has(obj.id)) {
        startObjDrag(ev, obj.id);
      } else {
        selectImageObj(obj.id, ev.ctrlKey || ev.metaKey);
        startObjDrag(ev, obj.id);
      }
    }
  });

  appendToCanvasWorld(el);
  return el;
}

// ── Select image
function selectImageObj(id, addMode) {
  const obj = state.objects.find((o) => o.id === id);
  if (!obj || !canSelectObjectForEdit(obj)) {
    notifyNotYourWork();
    return;
  }
  if (!addMode) clearAllSelections();
  selectedImageId = id;
  selectedIds.add(id);
  const el = document.querySelector(`.image-obj[data-obj-id="${id}"]`);
  if (!el) return;
  el.classList.add('selected-image');
  el.querySelectorAll('.image-resize-handle').forEach(h => h.style.display = 'block');
  showImageToolbar(el);
}

function showImageToolbar(el) {
  const tb = document.getElementById('image-toolbar');
  if (!tb) return;
  hideSelToolbar();
  tb.classList.add('visible');
  updateImageSizeLabel();
  requestAnimationFrame(() => {
    positionFloatingPanel(tb, {
      anchorRect: el.getBoundingClientRect(),
      excludeIds: ['image-toolbar'],
    });
    repositionSelectionAiPopup();
  });
}

function hideImageToolbar() {
  document.getElementById('image-toolbar')?.classList.remove('visible');
}

function updateImageSizeLabel() {
  if (!selectedImageId) return;
  const obj = state.objects.find(o => o.id === selectedImageId);
  if (!obj) return;
  const lbl = document.getElementById('itb-size');
  if (lbl) lbl.textContent = `${Math.round(obj.w)} × ${Math.round(obj.h)}`;
}

// ── Fit image to viewport
function fitSelectedImage() {
  if (!selectedImageId) return;
  const obj = state.objects.find(o => o.id === selectedImageId);
  if (!obj) return;
  const maxW = (window.innerWidth  - 120) / state.zoom;
  const maxH = (window.innerHeight - 120) / state.zoom;
  const ratio = obj.naturalW / obj.naturalH;
  let w = maxW, h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  obj.w = w; obj.h = h;
  obj.x = (window.innerWidth  / 2 - state.panX) / state.zoom - w / 2;
  obj.y = (window.innerHeight / 2 - state.panY) / state.zoom - h / 2;
  const el = document.querySelector(`.image-obj[data-obj-id="${selectedImageId}"]`);
  if (el) {
    el.style.left = obj.x + 'px'; el.style.top  = obj.y + 'px';
    el.style.width = obj.w + 'px'; el.style.height = obj.h + 'px';
    showImageToolbar(el);
  }
  updateImageSizeLabel();
  History.push(); saveToStorage();
}

// ── Duplicate selected image
function duplicateSelectedImage() {
  if (!selectedImageId) return;
  const obj = state.objects.find(o => o.id === selectedImageId);
  if (!obj) return;
  const copy = cloneObjectWithNewOwner(obj, 24, 24);
  state.objects.push(copy);
  updateObjectCount();
  renderImageObj(copy);
  clearAllSelections();
  selectImageObj(copy.id);
  History.push(); saveToStorage();
  showToast('Duplicated');
}

// ── Delete selected image
function deleteSelectedImage() {
  if (!selectedImageId) return;
  document.querySelector(`.image-obj[data-obj-id="${selectedImageId}"]`)?.remove();
  state.objects = state.objects.filter(o => o.id !== selectedImageId);
  selectedIds.delete(selectedImageId);
  selectedImageId = null;
  hideImageToolbar();
  updateObjectCount();
  History.push(); saveToStorage();
  showToast('Deleted');
}

// ── Patch clearAllSelections to deselect images
const _origClearAllForImage = clearAllSelections;
clearAllSelections = function() {
  _origClearAllForImage();
  document.querySelectorAll('.image-obj.selected-image').forEach(el => {
    el.classList.remove('selected-image');
    el.querySelectorAll('.image-resize-handle').forEach(h => h.style.display = 'none');
  });
  selectedImageId = null;
  hideImageToolbar();
};

// ── Keyboard: delete/duplicate selected image
document.addEventListener('keydown', ev => {
  if (!selectedImageId) return;
  const isEditing = document.activeElement.tagName === 'TEXTAREA'
    || document.activeElement.tagName === 'INPUT'
    || document.activeElement.isContentEditable;
  if (isEditing) return;
  if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteSelectedImage(); }
  if ((ev.metaKey || ev.ctrlKey) && ev.key === 'd')  { ev.preventDefault(); duplicateSelectedImage(); }
}, true);

// ══════════════════════════════════════
// IMAGE INPUT — File picker + paste + drag-drop
// ══════════════════════════════════════

// ── 1. File picker (triggered by image tool click)
function triggerImageFilePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const files = [...input.files];
    if (files.length > 0) {
      files.forEach((file, i) => {
        // offset each image slightly if multiple
        setTimeout(() => loadImageFile(file), i * 50);
      });
    } else {
      // user cancelled — switch back to previous tool
      setTool('select');
    }
    input.remove();
  });
  // if user cancels dialog (focus returns), switch back to select
  window.addEventListener('focus', function onFocus() {
    setTimeout(() => {
      if (input.files && input.files.length === 0) setTool('select');
      window.removeEventListener('focus', onFocus);
    }, 300);
  });
  input.click();
}

// ── 2. Drag & drop onto canvas
document.addEventListener('dragover', e => {
  e.preventDefault();
  const hasImage = [...(e.dataTransfer?.types || [])].includes('Files');
  if (hasImage) document.getElementById('drop-overlay').classList.add('active');
});

document.addEventListener('dragleave', e => {
  if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
    document.getElementById('drop-overlay').classList.remove('active');
  }
});

document.addEventListener('drop', e => {
  e.preventDefault();
  document.getElementById('drop-overlay').classList.remove('active');
  const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
  if (files.length === 0) return;
  // place each image offset from the drop point
  files.forEach((file, i) => {
    loadImageFile(file, e.clientX + i * 20, e.clientY + i * 20);
  });
});

// ── 3. Paste from clipboard (Ctrl+V)
document.addEventListener('paste', e => {
  const items = [...(e.clipboardData?.items || [])];
  const imageItem = items.find(item => item.type.startsWith('image/'));
  if (!imageItem) return;
  e.preventDefault();
  const file = imageItem.getAsFile();
  if (file) loadImageFile(file);
});

// ── Shared: load image file → compress → upload → place on canvas
function loadImageFile(file, dropX, dropY) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      if (dropX !== undefined && dropY !== undefined) {
        const wp = screenToWorld(dropX, dropY);
        createImageObjectAtWorldPoint(dataUrl, img.naturalWidth, img.naturalHeight, wp.x, wp.y);
      } else {
        placeImageOnCanvas(dataUrl, img.naturalWidth, img.naturalHeight);
      }
    };
    img.onerror = () => showToast('Could not load image');
    img.src = dataUrl;
  };
  reader.onerror = () => showToast('Could not read image file');
  reader.readAsDataURL(file);
}

// ── Wire select tool to handle image objects
const _origHandleSelectMousedown = handleSelectMousedown;
handleSelectMousedown = function(e) {
  const imageEl = e.target.closest('.image-obj');
  if (imageEl && state.tool === 'select') {
    const id = imageEl.dataset.objId;
    selectImageObj(id, e.ctrlKey || e.metaKey);
    startObjDrag(e, id);
    return;
  }
  _origHandleSelectMousedown(e);
};


// ═══════════════════════════════════════════════════
// TEXT TOOLBAR — font size, bold, italic, color
// ═══════════════════════════════════════════════════

const TEXT_COLORS = [
  '#141414', '#fbfbfb', '#2e9d91', '#4f71f2', '#f2541d',
];

// current style applied to new text nodes
const currentTextStyle = {
  fontSize: 18,
  fontWeight: '500',
  fontStyle: 'normal',
  color: '#141414',
};

let selectedTextId = null;

function initTextToolbar() {
  const wrap = document.getElementById('ttb-colors');
  if (!wrap) return;
  if (wrap.dataset.toolbarInited === '1') return;
  wrap.dataset.toolbarInited = '1';
  TEXT_COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'ttb-color-swatch';
    s.style.background = c;
    if (c === '#fbfbfb') s.style.border = '2px solid rgba(251,251,251,0.3)';
    s.title = c;
    s.addEventListener('mousedown', ev => {
      ev.preventDefault(); ev.stopPropagation();
      setTextColor(c);
    });
    wrap.appendChild(s);
  });
}

// ── Show toolbar above/below a text element
function showTextToolbar(el) {
  const tb = document.getElementById('text-toolbar');
  if (!tb) return;
  hideSelToolbar();
  tb.classList.add('visible');

  // sync controls to current obj
  const obj = state.objects.find(o => o.id === el.dataset.objId);
  if (obj) {
    document.getElementById('ttb-size-val').value = obj.fontSize || 18;
    document.getElementById('ttb-bold').classList.toggle('active', obj.fontWeight === 'bold' || obj.fontWeight === '700');
    document.getElementById('ttb-italic').classList.toggle('active', obj.fontStyle === 'italic');
    // color swatches
    document.querySelectorAll('.ttb-color-swatch').forEach(s => {
      s.classList.toggle('active', s.style.background === obj.color ||
        s.title === obj.color);
    });
  }

  requestAnimationFrame(() => {
    positionFloatingPanel(tb, {
      anchorRect: el.getBoundingClientRect(),
      excludeIds: ['text-toolbar'],
    });
    repositionSelectionAiPopup();
  });
}

function hideTextToolbar() {
  document.getElementById('text-toolbar')?.classList.remove('visible');
  selectedTextId = null;
}

// ── Select a text node — called from select tool
function selectTextNode(id) {
  selectedTextId = id;
  const el = document.querySelector(`.canvas-text[data-obj-id="${id}"]`);
  if (el) showTextToolbar(el);
}

// ── Apply style changes to selected text
function applyTextStyle(prop, value) {
  if (!selectedTextId) return;
  const obj = state.objects.find(o => o.id === selectedTextId);
  const el  = document.querySelector(`.canvas-text[data-obj-id="${selectedTextId}"]`);
  if (!obj || !el || !guardEditObject(obj)) return;
  obj[prop] = value;
  // apply to wrapper (font props cascade to inner editable)
  if (prop === 'fontSize')   { el.style.fontSize   = value + 'px'; }
  if (prop === 'fontWeight') { el.style.fontWeight  = value; }
  if (prop === 'fontStyle')  { el.style.fontStyle   = value; }
  if (prop === 'color')      { el.style.color        = value; }
  currentTextStyle[prop] = value;
  History.push(); saveToStorage();
}

function changeTextSize(delta) {
  if (!selectedTextId) return;
  const obj = state.objects.find(o => o.id === selectedTextId);
  if (!obj) return;
  const newSize = Math.max(8, Math.min(200, (obj.fontSize || 18) + delta));
  setTextSize(newSize);
}

function setTextSize(size) {
  size = Math.max(8, Math.min(200, size || 18));
  document.getElementById('ttb-size-val').value = size;
  applyTextStyle('fontSize', size);
  // reposition toolbar since text element height changed
  const el = document.querySelector(`.canvas-text[data-obj-id="${selectedTextId}"]`);
  if (el) showTextToolbar(el);
}

function toggleTextBold() {
  if (!selectedTextId) return;
  const obj = state.objects.find(o => o.id === selectedTextId);
  if (!obj) return;
  const isBold = obj.fontWeight === 'bold' || obj.fontWeight === '700';
  applyTextStyle('fontWeight', isBold ? '400' : 'bold');
  document.getElementById('ttb-bold').classList.toggle('active', !isBold);
}

function toggleTextItalic() {
  if (!selectedTextId) return;
  const obj = state.objects.find(o => o.id === selectedTextId);
  if (!obj) return;
  const isItalic = obj.fontStyle === 'italic';
  applyTextStyle('fontStyle', isItalic ? 'normal' : 'italic');
  document.getElementById('ttb-italic').classList.toggle('active', !isItalic);
}

function setTextColor(color) {
  applyTextStyle('color', color);
  document.querySelectorAll('.ttb-color-swatch').forEach(s => {
    s.classList.toggle('active', s.title === color);
  });
}

function deleteSelectedTextNode() {
  if (!selectedTextId) return;
  const obj = state.objects.find(o => o.id === selectedTextId);
  if (!guardEditObject(obj)) return;
  document.querySelector(`.canvas-text[data-obj-id="${selectedTextId}"]`)?.remove();
  state.objects = state.objects.filter(o => o.id !== selectedTextId);
  updateObjectCount();
  hideTextToolbar();
  History.push(); saveToStorage();
  showToast('Deleted');
}

// ── Patch selectObject to show text toolbar when text is selected
const _origSelectObject = selectObject;
selectObject = function(id, addToSelection) {
  _origSelectObject(id, addToSelection);
  const obj = state.objects.find(o => o.id === id);
  if (obj && obj.type === 'text' && selectedIds.has(id)) {
    selectTextNode(id);
  } else {
    hideTextToolbar();
  }
};

// ── Patch clearAllSelections to hide text toolbar
const _origClearAllForText = clearAllSelections;
clearAllSelections = function() {
  _origClearAllForText();
  hideTextToolbar();
  document.querySelectorAll('.canvas-text.sel-active').forEach(el => {
    el.classList.remove('sel-active');
    el.style.border = '1.5px solid transparent';
    el.querySelectorAll('.text-resize-handle').forEach(h => h.style.display = 'none');
  });
};

// ── Init on load
whenDomReady(initTextToolbar);


// ═══════════════════════════════════════════════════
// EXPORT — STEP 6 (pure Canvas2D, no external libs)
// ═══════════════════════════════════════════════════

function showExportMenu(btn) {
  const menu = document.getElementById('export-menu');
  if (menu.classList.contains('visible')) { hideExportMenu(); return; }
  menu.classList.add('visible');
  requestAnimationFrame(() => {
    const r  = btn.getBoundingClientRect();
    const mw = menu.offsetWidth;
    let left = r.right - mw;
    if (left < 8) left = 8;
    menu.style.top  = (r.bottom + 6) + 'px';
    menu.style.left = left + 'px';
  });
}

function hideExportMenu() {
  document.getElementById('export-menu')?.classList.remove('visible');
}

document.addEventListener('click', e => {
  if (!e.target.closest('#export-menu') && !e.target.closest('[onclick*="showExportMenu"]')) {
    hideExportMenu();
  }
});

function showExportProgress(title, sub) {
  document.getElementById('ep-title').textContent = title;
  document.getElementById('ep-sub').textContent   = sub || 'Please wait…';
  document.getElementById('export-progress').classList.add('visible');
}
function hideExportProgress() {
  document.getElementById('export-progress').classList.remove('visible');
}

// ── Compute bounding box of all objects
function getBoardBounds() {
  if (state.objects.length === 0) return { x:0, y:0, w:800, h:600 };

  // Read bounds directly from DOM elements — most accurate, handles auto-grow
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;

  function expand(x, y, w, h) {
    minX=Math.min(minX,x); minY=Math.min(minY,y);
    maxX=Math.max(maxX,x+w); maxY=Math.max(maxY,y+h);
  }

  state.objects.forEach(obj => {
    if (obj.type === 'stroke') {
      // strokes use world-space points — most accurate source
      obj.points.forEach(p => {
        minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
        maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
      });
    } else if (obj.type === 'shape' &&
              (obj.shapeType==='arrow' || obj.shapeType==='line')) {
      expand(
        Math.min(obj.x, obj.x2||0),
        Math.min(obj.y, obj.y2||0),
        Math.abs((obj.x2||0) - obj.x),
        Math.abs((obj.y2||0) - obj.y)
      );
    } else {
      // for all box objects — try to read actual DOM size
      const sel = obj.type==='sticky' ? `.sticky-note[data-obj-id="${obj.id}"]`
                : obj.type==='text'   ? `.canvas-text[data-obj-id="${obj.id}"]`
                : obj.type==='image'  ? `.image-obj[data-obj-id="${obj.id}"]`
                : obj.type==='shape'  ? `.shape-obj[data-obj-id="${obj.id}"]`
                : null;
      const domEl = sel ? document.querySelector(sel) : null;
      if (domEl) {
        // offsetWidth/Height gives actual rendered size
        expand(obj.x, obj.y, domEl.offsetWidth / state.zoom, domEl.offsetHeight / state.zoom);
      } else {
        expand(obj.x||0, obj.y||0, obj.w||200, obj.h||100);
      }
    }
  });

  if (!isFinite(minX)) return { x:0, y:0, w:800, h:600 };

  // generous padding so nothing is ever clipped
  const PAD = 40;
  return {
    x: minX - PAD,
    y: minY - PAD,
    w: Math.max(1, maxX - minX + PAD*2),
    h: Math.max(1, maxY - minY + PAD*2),
  };
}

// ── Core: draw board onto a Canvas2D context
async function drawBoardToCanvas(bounds, pad, scale) {
  const W = Math.round((bounds.w + pad*2) * scale);
  const H = Math.round((bounds.h + pad*2) * scale);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // white background
  ctx.fillStyle = '#fbfbfb';
  ctx.fillRect(0, 0, W, H);

  const tx = (x) => (x - bounds.x + pad) * scale;
  const ty = (y) => (y - bounds.y + pad) * scale;
  const ts = (v) => v * scale;

  // draw each object in order
  for (const obj of state.objects) {

    if (obj.type === 'stroke') {
      if (!obj.points || obj.points.length < 2) continue;
      ctx.beginPath();
      ctx.strokeStyle = obj.color || '#141414';
      ctx.lineWidth   = ts(obj.width || 2.5);
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.moveTo(tx(obj.points[0].x), ty(obj.points[0].y));
      for (let i = 1; i < obj.points.length; i++) {
        if (i === 1) {
          ctx.lineTo(tx(obj.points[i].x), ty(obj.points[i].y));
        } else {
          const prev = obj.points[i-1], curr = obj.points[i];
          const mx = (prev.x+curr.x)/2, my = (prev.y+curr.y)/2;
          ctx.quadraticCurveTo(tx(prev.x), ty(prev.y), tx(mx), ty(my));
        }
      }
      ctx.stroke();

    } else if (obj.type === 'text') {
      ctx.font = `${obj.fontStyle||'normal'} ${obj.fontWeight||500} ${ts(obj.fontSize||18)}px 'Bricolage Grotesque', sans-serif`;
      ctx.fillStyle = obj.color || '#141414';
      ctx.textBaseline = 'top';
      const lines = (obj.content||'').split('\n');
      const lineH = ts((obj.fontSize||18) * 1.5);
      lines.forEach((line, i) => {
        ctx.fillText(line, tx(obj.x) + ts(6), ty(obj.y) + ts(3) + i * lineH);
      });

    } else if (obj.type === 'sticky') {
      const x=tx(obj.x), y=ty(obj.y), w=ts(obj.w||220), h=ts(obj.h||180);
      const stickyColor = normalizeStickyColorName(obj.color);
      ctx.fillStyle = STICKY_BG[stickyColor] || STICKY_BG.yellow;
      roundRectPath(ctx, x, y, w, h, ts(12));
      ctx.fill();
      // handle bar
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      roundRectPath(ctx, x, y, w, ts(28), ts(12));
      ctx.fill();
      // text
      ctx.fillStyle = obj.color === 'charcoal' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)';
      ctx.font = `500 ${ts(14)}px 'Bricolage Grotesque', sans-serif`;
      ctx.textBaseline = 'top';
      const stickyLines = (obj.text||'').split('\n');
      stickyLines.forEach((line, i) => {
        ctx.fillText(line, x + ts(14), y + ts(36) + i * ts(22), w - ts(28));
      });

    } else if (obj.type === 'image') {
      await new Promise(res => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          ctx.drawImage(img, tx(obj.x), ty(obj.y), ts(obj.w), ts(obj.h));
          res();
        };
        img.onerror = res;
        img.src = obj.src;
      });

    } else if (obj.type === 'shape') {
      const isLine = obj.shapeType === 'arrow' || obj.shapeType === 'line';
      if (isLine) {
        ctx.beginPath();
        ctx.strokeStyle = obj.stroke || '#141414';
        ctx.lineWidth   = ts(obj.strokeWidth || 2);
        ctx.lineCap     = 'round';
        ctx.moveTo(tx(obj.x), ty(obj.y));
        ctx.lineTo(tx(obj.x2||obj.x), ty(obj.y2||obj.y));
        ctx.stroke();
        if (obj.shapeType === 'arrow') {
          drawArrowHead(ctx, tx(obj.x), ty(obj.y), tx(obj.x2||obj.x), ty(obj.y2||obj.y), obj.stroke||'#141414', ts(obj.strokeWidth||2));
        }
      } else {
        const x=tx(obj.x), y=ty(obj.y), w=ts(obj.w||100), h=ts(obj.h||80);
        const f = obj.fill || '#fbfbfb';
        const s = obj.stroke || '#141414';
        const sw = ts(obj.strokeWidth || 1.5);
        ctx.fillStyle   = f === 'transparent' ? 'rgba(0,0,0,0)' : f;
        ctx.strokeStyle = s;
        ctx.lineWidth   = sw;
        drawShapeOnCtx(ctx, obj.shapeType, x, y, w, h);
        if (f !== 'transparent' && f !== 'none') ctx.fill();
        ctx.stroke();
        // label
        if (obj.label) {
          ctx.fillStyle   = f === '#141414' ? '#fbfbfb' : '#141414';
          ctx.font        = `600 ${ts(13)}px 'Bricolage Grotesque', sans-serif`;
          ctx.textAlign   = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(obj.label, x + w/2, y + h/2);
          ctx.textAlign = 'left';
        }
      }
    }
  }
  return cv;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);   ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);     ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function drawShapeOnCtx(ctx, type, x, y, w, h) {
  ctx.beginPath();
  if (type==='rect')      { ctx.roundRect ? ctx.roundRect(x,y,w,h,4) : ctx.rect(x,y,w,h); }
  else if (type==='circle')   { ctx.ellipse(x+w/2, y+h/2, w/2, h/2, 0, 0, Math.PI*2); }
  else if (type==='diamond')  { ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h/2); ctx.lineTo(x+w/2,y+h); ctx.lineTo(x,y+h/2); ctx.closePath(); }
  else if (type==='triangle') { ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h); ctx.lineTo(x,y+h); ctx.closePath(); }
  else if (type==='hexagon')  {
    const cx=x+w/2,cy=y+h/2,rx=w/2,ry=h/2;
    for(let i=0;i<6;i++){const a=Math.PI/180*(60*i-30);i===0?ctx.moveTo(cx+rx*Math.cos(a),cy+ry*Math.sin(a)):ctx.lineTo(cx+rx*Math.cos(a),cy+ry*Math.sin(a));}
    ctx.closePath();
  }
  else if (type==='parallelogram') { const off=w*0.2; ctx.moveTo(x+off,y); ctx.lineTo(x+w,y); ctx.lineTo(x+w-off,y+h); ctx.lineTo(x,y+h); ctx.closePath(); }
  else if (type==='star') {
    const cx=x+w/2,cy=y+h/2,outerR=Math.min(w,h)/2,innerR=outerR*0.45;
    for(let i=0;i<10;i++){const a=Math.PI/180*(36*i-90),r=i%2===0?outerR:innerR;i===0?ctx.moveTo(cx+r*Math.cos(a),cy+r*Math.sin(a)):ctx.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a));}
    ctx.closePath();
  }
  else { ctx.rect(x,y,w,h); }
}

function drawArrowHead(ctx, x1, y1, x2, y2, color, lw) {
  const angle = Math.atan2(y2-y1, x2-x1);
  const size  = Math.max(10, lw * 4);
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth   = lw;
  ctx.lineCap     = 'round';
  ctx.moveTo(x2 - size*Math.cos(angle-0.4), y2 - size*Math.sin(angle-0.4));
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - size*Math.cos(angle+0.4), y2 - size*Math.sin(angle+0.4));
  ctx.stroke();
}

// ── PNG export
async function exportPNG(mode) {
  showExportProgress('Exporting PNG…', 'Drawing board…');
  await new Promise(r => setTimeout(r, 50));
  try {
    let bounds, pad;
    if (mode === 'full') {
      bounds = getBoardBounds(); pad = 60;
    } else {
      bounds = {
        x: -state.panX/state.zoom, y: -state.panY/state.zoom,
        w: window.innerWidth/state.zoom, h: window.innerHeight/state.zoom,
      };
      pad = 0;
    }

    // cap scale so canvas doesn't exceed browser max (16384px)
    const maxDim = 4096;
    const rawW   = (bounds.w + pad*2);
    const rawH   = (bounds.h + pad*2);
    const scale  = Math.min(2, maxDim / Math.max(rawW, rawH));

    const cv = await drawBoardToCanvas(bounds, pad, scale);
    const dataUrl = cv.toDataURL('image/png', 1.0);
    triggerDownload(dataUrl, (state.boardName||'board') + (mode==='full'?'-full':'-view') + '.png');
    hideExportProgress();
    showToast('PNG saved!');
  } catch(e) {
    hideExportProgress(); console.error(e);
    showToast('PNG export failed — ' + e.message);
  }
}

// ── PDF export — pure JS, direct download, no popup, no library
// Builds a valid binary PDF with the board image embedded as JPEG
async function exportPDF() {
  showExportProgress('Exporting PDF…', 'Rendering board…');
  await new Promise(r => setTimeout(r, 60));
  try {
    const bounds = getBoardBounds();
    const scale  = Math.min(1.5, 2400 / Math.max(bounds.w, bounds.h));
    const cv     = await drawBoardToCanvas(bounds, 0, scale);

    // get JPEG as base64
    const jpegB64 = cv.toDataURL('image/jpeg', 0.88).split(',')[1];

    // decode base64 → Uint8Array of raw JPEG bytes
    const jpegBin  = atob(jpegB64);
    const jpegBytes = new Uint8Array(jpegBin.length);
    for (let i = 0; i < jpegBin.length; i++) jpegBytes[i] = jpegBin.charCodeAt(i);

    const imgW = cv.width, imgH = cv.height;

    // A4 landscape in points (72dpi: 1pt = 1/72 inch, 1px ~= 0.75pt at 96dpi)
    const A4W = 841.89, A4H = 595.28;
    const ratio  = imgW / imgH;
    const margin = 28;
    let pw = A4W - margin*2, ph = pw / ratio;
    if (ph > A4H - margin*2) { ph = A4H - margin*2; pw = ph * ratio; }
    const ox = (A4W - pw) / 2;
    const oy = (A4H - ph) / 2;

    // ── Build PDF as array of Uint8Arrays (preserves binary image bytes)
    const enc = s => new TextEncoder().encode(s);
    const parts = []; // array of Uint8Array
    const offsets = [];

    function push(u8) { parts.push(u8); }
    function pushStr(s) { push(enc(s)); }
    function totalLen() { return parts.reduce((a,b) => a + b.length, 0); }

    pushStr('%PDF-1.4\n');
    pushStr('%\xE2\xE3\xCF\xD3\n'); // binary comment so viewers treat as binary

    // obj 1 — catalog
    offsets.push(totalLen());
    pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

    // obj 2 — pages
    offsets.push(totalLen());
    pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

    // obj 3 — page
    offsets.push(totalLen());
    pushStr(
      '3 0 obj\n<< /Type /Page /Parent 2 0 R' +
      '\n/MediaBox [0 0 ' + A4W.toFixed(2) + ' ' + A4H.toFixed(2) + ']' +
      '\n/Contents 4 0 R' +
      '\n/Resources << /XObject << /Im0 5 0 R >> >>' +
      '\n>>\nendobj\n'
    );

    // obj 4 — content stream (place image)
    const stream =
      'q ' +
      pw.toFixed(4) + ' 0 0 ' + ph.toFixed(4) + ' ' +
      ox.toFixed(4) + ' ' + oy.toFixed(4) +
      ' cm /Im0 Do Q';
    offsets.push(totalLen());
    pushStr(
      '4 0 obj\n<< /Length ' + stream.length + ' >>\n' +
      'stream\n' + stream + '\nendstream\nendobj\n'
    );

    // obj 5 — JPEG image XObject (raw binary bytes)
    const imgHeader =
      '5 0 obj\n' +
      '<< /Type /XObject /Subtype /Image' +
      ' /Width ' + imgW + ' /Height ' + imgH +
      ' /ColorSpace /DeviceRGB /BitsPerComponent 8' +
      ' /Filter /DCTDecode /Length ' + jpegBytes.length + ' >>\n' +
      'stream\n';
    offsets.push(totalLen());
    pushStr(imgHeader);
    push(jpegBytes);           // raw binary JPEG — not base64
    pushStr('\nendstream\nendobj\n');

    // xref table
    const xrefOffset = totalLen();
    let xref = 'xref\n0 ' + (offsets.length + 1) + '\n';
    xref += '0000000000 65535 f \n';
    offsets.forEach(o => { xref += o.toString().padStart(10,'0') + ' 00000 n \n'; });
    pushStr(xref);

    // trailer
    pushStr(
      'trailer\n<< /Size ' + (offsets.length+1) + ' /Root 1 0 R >>\n' +
      'startxref\n' + xrefOffset + '\n%%EOF'
    );

    // merge all parts into one Uint8Array
    const total  = parts.reduce((a,b) => a+b.length, 0);
    const pdfBuf = new Uint8Array(total);
    let pos = 0;
    parts.forEach(p => { pdfBuf.set(p, pos); pos += p.length; });

    // convert to base64 for data URI download
    let bStr = '';
    const chunkSize = 8192;
    for (let i = 0; i < pdfBuf.length; i += chunkSize) {
      bStr += String.fromCharCode(...pdfBuf.subarray(i, i + chunkSize));
    }
    const pdfB64  = btoa(bStr);
    const dataUri = 'data:application/pdf;base64,' + pdfB64;

    triggerDownload(dataUri, (state.boardName||'board').replace(/[^a-z0-9]/gi,'-') + '.pdf');
    hideExportProgress();
    showToast('PDF saved!');
  } catch(e) {
    hideExportProgress(); console.error(e);
    showToast('PDF export failed — ' + e.message);
  }
}

// ── JSON export — strip image src data to keep file small, save separately
function exportJSON() {
  try {
    // create a copy of objects — replace large image src with a placeholder marker
    const exportObjs = state.objects.map(obj => {
      if (obj.type === 'image') {
        return { ...obj, src: obj.src }; // keep src — needed to reload
      }
      return obj;
    });

    const data = {
      version: 1,
      boardName: state.boardName,
      exportedAt: new Date().toISOString(),
      panX: state.panX, panY: state.panY, zoom: state.zoom,
      objects: exportObjs,
    };

    const jsonStr = JSON.stringify(data, null, 2);

    // Use a hidden textarea + execCommand as a fallback for large data
    // Primary: try data URI (works for most boards)
    try {
      // encode as base64 to avoid URI length/encoding issues
      const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
      const dataUrl = 'data:application/octet-stream;base64,' + b64;
      triggerDownload(dataUrl, (state.boardName||'board').replace(/[^a-z0-9]/gi,'-') + '.json');
      showToast('Board saved as JSON');
    } catch(encErr) {
      // fallback: open in new tab
      const w = window.open('', '_blank');
      if (w) { w.document.write('<pre>' + jsonStr.replace(/</g,'&lt;') + '</pre>'); }
      showToast('JSON opened in new tab — save with Ctrl+S');
    }
  } catch(e) {
    console.error(e);
    showToast('JSON export failed — ' + e.message);
  }
}

// ── Trigger download via <a> click
function triggerDownload(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 200);
}

// ── Load external script (for jsPDF)
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ── JSON import
function triggerImportJSON() {
  const input = document.createElement('input');
  input.type='file'; input.accept='.json,application/json';
  input.style.cssText='position:fixed;top:-9999px;left:-9999px;';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    if (!input.files[0]) { input.remove(); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.objects) throw new Error('Invalid board file');
        if (state.objects.length > 0 && !confirm('This will replace your current board. Continue?')) {
          input.remove(); return;
        }
        state.boardName = data.boardName || 'Imported Board';
        state.panX = data.panX||0; state.panY = data.panY||0; state.zoom = data.zoom||1;
        state.objects = data.objects||[];
        document.getElementById('boardName').value = state.boardName;
        document.title = state.boardName + ' — LP MindSpace';
        applyTransform(); redrawAll(); updateObjectCount();
        History.baseline(); saveToStorage();
        showToast('Board imported: ' + state.boardName);
      } catch(err) { showToast('Invalid JSON file'); console.error(err); }
      input.remove();
    };
    reader.readAsText(input.files[0]);
  });
  input.click();
}

// ⌘E opens export menu
document.addEventListener('keydown', ev => {
  if ((ev.metaKey||ev.ctrlKey) && ev.key==='e') {
    ev.preventDefault();
    const btn = document.querySelector('[onclick*="showExportMenu"]');
    if (btn) showExportMenu(btn);
  }
}, true);


// ═══════════════════════════════════════════════════
// MINI-MAP — STEP 7
// ═══════════════════════════════════════════════════

const MM_W = 200, MM_H = 130;     // minimap display size in px
const MM_UPDATE_MS = 80;           // throttle render interval
const MM_POS_KEY = 'lp-minimap-pos';
let mmVisible  = true;
let mmDragging = false;
let mmWrapDragging = false;
let mmWrapDidMove = false;
let mmWrapDragStart = { x: 0, y: 0, left: 0, top: 0 };
let mmTimer    = null;
let mmLastBounds = null;

const mmWrap     = document.getElementById('minimap-wrap');
const mmEl       = document.getElementById('minimap');
const mmCanvas   = document.getElementById('minimap-canvas');
const mmViewport = document.getElementById('minimap-viewport');
const mmToggle   = document.getElementById('minimap-toggle');
const mmCtx      = mmCanvas.getContext('2d');

// retina
mmCanvas.width  = MM_W * 2;
mmCanvas.height = MM_H * 2;
mmCanvas.style.width  = MM_W + 'px';
mmCanvas.style.height = MM_H + 'px';
mmCtx.scale(2, 2);

// ── Toggle visibility
function toggleMinimap() {
  mmVisible = !mmVisible;
  mmEl.classList.toggle('hidden', !mmVisible);
  mmToggle.textContent = mmVisible ? '▲ hide map' : '▼ show map';
}

function applyMinimapWrapPosition(left, top) {
  if (!mmWrap) return;
  const maxLeft = Math.max(8, window.innerWidth - mmWrap.offsetWidth - 8);
  const maxTop = Math.max(58, window.innerHeight - mmWrap.offsetHeight - 8);
  const clampedLeft = Math.max(8, Math.min(left, maxLeft));
  const clampedTop = Math.max(58, Math.min(top, maxTop));
  mmWrap.style.left = `${Math.round(clampedLeft)}px`;
  mmWrap.style.top = `${Math.round(clampedTop)}px`;
}

function initMinimapPosition() {
  if (!mmWrap) return;
  try {
    const saved = localStorage.getItem(MM_POS_KEY);
    if (saved) {
      const { left, top } = JSON.parse(saved);
      if (Number.isFinite(left) && Number.isFinite(top)) {
        applyMinimapWrapPosition(left, top);
        return;
      }
    }
  } catch (e) { /* ignore */ }
  applyMinimapWrapPosition(72, window.innerHeight - mmWrap.offsetHeight - 16);
}

function saveMinimapPosition() {
  if (!mmWrap) return;
  const left = parseFloat(mmWrap.style.left) || 72;
  const top = parseFloat(mmWrap.style.top) || 0;
  try {
    localStorage.setItem(MM_POS_KEY, JSON.stringify({ left, top }));
  } catch (e) { /* ignore */ }
}

if (mmToggle) {
  mmToggle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    mmWrapDragging = true;
    mmWrapDidMove = false;
    const rect = mmWrap.getBoundingClientRect();
    mmWrapDragStart = {
      x: e.clientX,
      y: e.clientY,
      left: rect.left,
      top: rect.top,
    };
    mmToggle.classList.add('dragging');
  });

  mmToggle.addEventListener('click', (e) => {
    if (mmWrapDidMove) {
      mmWrapDidMove = false;
      e.preventDefault();
      e.stopPropagation();
    } else {
      toggleMinimap();
    }
  });
}

window.addEventListener('resize', () => {
  if (!mmWrap) return;
  applyMinimapWrapPosition(parseFloat(mmWrap.style.left) || 72, parseFloat(mmWrap.style.top) || 0);
});

initMinimapPosition();

// ── Schedule a minimap redraw (throttled)
function scheduleMinimap() {
  if (mmTimer) return;
  mmTimer = setTimeout(() => {
    mmTimer = null;
    if (mmVisible) drawMinimap();
  }, MM_UPDATE_MS);
}

// ── Compute world-space bounding box for minimap
function getMinimapBounds() {
  // use board bounds but with a minimum size
  const b = getBoardBounds();
  // also include current viewport so minimap always shows where you are
  const vx = -state.panX / state.zoom;
  const vy = -state.panY / state.zoom;
  const vw =  window.innerWidth  / state.zoom;
  const vh =  window.innerHeight / state.zoom;

  const minX = Math.min(b.x, vx) - 40;
  const minY = Math.min(b.y, vy) - 40;
  const maxX = Math.max(b.x + b.w, vx + vw) + 40;
  const maxY = Math.max(b.y + b.h, vy + vh) + 40;

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ── Draw the minimap
function drawMinimap() {
  const bounds = getMinimapBounds();
  mmLastBounds = bounds;

  const scaleX = MM_W / bounds.w;
  const scaleY = MM_H / bounds.h;
  const mmScale = Math.min(scaleX, scaleY);

  // offset to center content in minimap
  const offX = (MM_W - bounds.w * mmScale) / 2;
  const offY = (MM_H - bounds.h * mmScale) / 2;

  // world → minimap coords
  const wx = x => (x - bounds.x) * mmScale + offX;
  const wy = y => (y - bounds.y) * mmScale + offY;
  const ws = v => v * mmScale;

  // clear
  mmCtx.clearRect(0, 0, MM_W, MM_H);
  mmCtx.fillStyle = '#1a1a22';
  mmCtx.fillRect(0, 0, MM_W, MM_H);

  // dot grid (subtle)
  mmCtx.fillStyle = 'rgba(255,255,255,0.06)';
  const gStep = ws(28);
  if (gStep > 3) {
    const startX = offX - Math.floor(offX/gStep)*gStep;
    const startY = offY - Math.floor(offY/gStep)*gStep;
    for (let x = startX; x < MM_W; x += gStep) {
      for (let y = startY; y < MM_H; y += gStep) {
        mmCtx.beginPath();
        mmCtx.arc(x, y, 0.6, 0, Math.PI*2);
        mmCtx.fill();
      }
    }
  }

  // draw objects
  mmCtx.save();
  state.objects.forEach(obj => {
    if (obj.type === 'stroke') {
      if (!obj.points || obj.points.length < 2) return;
      mmCtx.beginPath();
      mmCtx.strokeStyle = obj.color || '#141414';
      mmCtx.lineWidth   = Math.max(0.8, ws(obj.width||2));
      mmCtx.lineCap     = 'round';
      mmCtx.lineJoin    = 'round';
      mmCtx.moveTo(wx(obj.points[0].x), wy(obj.points[0].y));
      obj.points.slice(1).forEach(p => mmCtx.lineTo(wx(p.x), wy(p.y)));
      mmCtx.stroke();

    } else if (obj.type === 'sticky') {
      const stickyColor = normalizeStickyColorName(obj.color);
      const domEl = document.querySelector(`.sticky-note[data-obj-id="${obj.id}"]`);
      const w = domEl ? domEl.offsetWidth  : (obj.w||220);
      const h = domEl ? domEl.offsetHeight : (obj.h||180);
      mmCtx.fillStyle = STICKY_BG[stickyColor] || STICKY_BG.yellow;
      mmRoundRect(mmCtx, wx(obj.x), wy(obj.y), ws(w), ws(h), 2);
      mmCtx.fill();

    } else if (obj.type === 'text') {
      mmCtx.fillStyle = obj.color || '#141414';
      mmCtx.font = `${ws(obj.fontSize||18)*0.7}px sans-serif`;
      mmCtx.textBaseline = 'top';
      mmCtx.fillText(obj.content||'', wx(obj.x), wy(obj.y), ws(180));

    } else if (obj.type === 'image') {
      // draw image placeholder rect
      mmCtx.fillStyle = 'rgba(79,113,242,0.15)';
      mmCtx.strokeStyle = 'rgba(79,113,242,0.5)';
      mmCtx.lineWidth = 0.8;
      mmRoundRect(mmCtx, wx(obj.x), wy(obj.y), ws(obj.w), ws(obj.h), 2);
      mmCtx.fill(); mmCtx.stroke();
      // try to draw the actual image
      try {
        const img = new Image();
        img.src = obj.src;
        if (img.complete) {
          mmCtx.drawImage(img, wx(obj.x), wy(obj.y), ws(obj.w), ws(obj.h));
        }
      } catch(e) {}

    } else if (obj.type === 'shape') {
      const isLine = obj.shapeType==='arrow'||obj.shapeType==='line';
      if (isLine) {
        mmCtx.beginPath();
        mmCtx.strokeStyle = obj.stroke || '#141414';
        mmCtx.lineWidth   = Math.max(0.8, ws(obj.strokeWidth||2));
        mmCtx.lineCap     = 'round';
        mmCtx.moveTo(wx(obj.x), wy(obj.y));
        mmCtx.lineTo(wx(obj.x2||obj.x), wy(obj.y2||obj.y));
        mmCtx.stroke();
        if (obj.shapeType==='arrow') {
          const angle = Math.atan2((obj.y2||0)-obj.y, (obj.x2||0)-obj.x);
          const sz = Math.max(3, ws(8));
          mmCtx.beginPath();
          mmCtx.moveTo(wx(obj.x2||obj.x)-sz*Math.cos(angle-0.4), wy(obj.y2||obj.y)-sz*Math.sin(angle-0.4));
          mmCtx.lineTo(wx(obj.x2||obj.x), wy(obj.y2||obj.y));
          mmCtx.lineTo(wx(obj.x2||obj.x)-sz*Math.cos(angle+0.4), wy(obj.y2||obj.y)-sz*Math.sin(angle+0.4));
          mmCtx.stroke();
        }
      } else {
        const f = obj.fill||'#fff', s = obj.stroke||'#141414';
        mmCtx.fillStyle   = f==='transparent'||f==='none' ? 'rgba(0,0,0,0)' : f;
        mmCtx.strokeStyle = s;
        mmCtx.lineWidth   = Math.max(0.5, ws(obj.strokeWidth||1.5));
        mmCtx.beginPath();
        const x=wx(obj.x), y=wy(obj.y), w=ws(obj.w||80), h=ws(obj.h||60);
        if (obj.shapeType==='circle') { mmCtx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2); }
        else if (obj.shapeType==='diamond') {
          mmCtx.moveTo(x+w/2,y); mmCtx.lineTo(x+w,y+h/2);
          mmCtx.lineTo(x+w/2,y+h); mmCtx.lineTo(x,y+h/2); mmCtx.closePath();
        }
        else { mmCtx.rect(x,y,w,h); }
        if (f!=='transparent'&&f!=='none') mmCtx.fill();
        mmCtx.stroke();
      }
    }
  });
  mmCtx.restore();

  // ── Update viewport rectangle overlay
  const vpX = (-state.panX/state.zoom - bounds.x) * mmScale + offX;
  const vpY = (-state.panY/state.zoom - bounds.y) * mmScale + offY;
  const vpW = (window.innerWidth  / state.zoom) * mmScale;
  const vpH = (window.innerHeight / state.zoom) * mmScale;

  mmViewport.style.left   = Math.max(0, vpX) + 'px';
  mmViewport.style.top    = Math.max(0, vpY) + 'px';
  mmViewport.style.width  = Math.min(vpW, MM_W - Math.max(0,vpX)) + 'px';
  mmViewport.style.height = Math.min(vpH, MM_H - Math.max(0,vpY)) + 'px';
}

function mmRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);   ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);     ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

// ── Click on minimap → navigate to that world position
mmEl.addEventListener('mousedown', e => {
  if (!mmLastBounds) return;
  mmDragging = true;
  navigateToMinimap(e);
});

document.addEventListener('mousemove', e => {
  if (mmWrapDragging) {
    const dx = e.clientX - mmWrapDragStart.x;
    const dy = e.clientY - mmWrapDragStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mmWrapDidMove = true;
    applyMinimapWrapPosition(mmWrapDragStart.left + dx, mmWrapDragStart.top + dy);
    return;
  }
  if (!mmDragging) return;
  navigateToMinimap(e);
});

document.addEventListener('mouseup', () => {
  if (mmWrapDragging) {
    mmWrapDragging = false;
    mmToggle?.classList.remove('dragging');
    if (mmWrapDidMove) saveMinimapPosition();
    return;
  }
  mmDragging = false;
});

function navigateToMinimap(e) {
  const rect   = mmEl.getBoundingClientRect();
  const bounds = mmLastBounds;
  if (!bounds) return;

  const mmScale = Math.min(MM_W/bounds.w, MM_H/bounds.h);
  const offX    = (MM_W - bounds.w*mmScale) / 2;
  const offY    = (MM_H - bounds.h*mmScale) / 2;

  // minimap pixel → world coord
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const wx = (mx - offX) / mmScale + bounds.x;
  const wy = (my - offY) / mmScale + bounds.y;

  // center viewport on that world point
  state.panX = window.innerWidth  / 2 - wx * state.zoom;
  state.panY = window.innerHeight / 2 - wy * state.zoom;
  applyTransform();
  breakFollowOnUserViewportChange();
  drawMinimap();
}

// ── Hook into applyTransform to update minimap on every pan/zoom
const _origApplyTransform = applyTransform;
applyTransform = function() {
  _origApplyTransform();
  scheduleMinimap();
};

// ── Hook into History.push to update minimap when objects change
const _origHistoryPush = History.push.bind(History);
History.push = function() {
  _origHistoryPush();
  scheduleMinimap();
};

// ── Hook into redrawAll
const _origRedrawAll = redrawAll;
redrawAll = function() {
  _origRedrawAll();
  scheduleMinimap();
};

// initial draw after everything loads
setTimeout(() => drawMinimap(), 300);


// ═══════════════════════════════════════════════════
// SHAPE RECOGNITION — STEP 8
// ═══════════════════════════════════════════════════

// ── Utility: bounding box of points
function ptsBounds(pts) {
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  pts.forEach(p => {
    minX=Math.min(minX,p.x); minY=Math.min(minY,p.y);
    maxX=Math.max(maxX,p.x); maxY=Math.max(maxY,p.y);
  });
  return { x:minX, y:minY, w:maxX-minX, h:maxY-minY, cx:(minX+maxX)/2, cy:(minY+maxY)/2 };
}

// ── Utility: total path length
function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x-pts[i-1].x, dy = pts[i].y-pts[i-1].y;
    len += Math.sqrt(dx*dx+dy*dy);
  }
  return len;
}

// ── Utility: distance between two points
function dist(a, b) {
  return Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
}

// ── Utility: is the stroke closed? (start near end)
function isClosed(pts, threshold) {
  const d = dist(pts[0], pts[pts.length-1]);
  const bbox = ptsBounds(pts);
  const diag = Math.sqrt(bbox.w**2 + bbox.h**2);
  return d < diag * threshold;
}

// ── Utility: downsample points to N evenly spaced
function downsample(pts, n) {
  if (pts.length <= n) return pts;
  const total = pathLength(pts);
  const step  = total / (n-1);
  const result = [pts[0]];
  let acc = 0, i = 1;
  for (let s = 1; s < n-1; s++) {
    const target = s * step;
    while (i < pts.length-1) {
      const d = dist(pts[i-1], pts[i]);
      if (acc + d >= target) {
        const t = (target - acc) / d;
        result.push({
          x: pts[i-1].x + t*(pts[i].x-pts[i-1].x),
          y: pts[i-1].y + t*(pts[i].y-pts[i-1].y),
        });
        break;
      }
      acc += d; i++;
    }
  }
  result.push(pts[pts.length-1]);
  return result;
}

// ── Grid-snap based recognizer
// Strategy: snap all stroke points to the 28px grid, then analyse the unique
// grid cells visited — this gives a clean discrete picture of the shape

const GRID = 28; // must match GRID_BASE in the canvas engine

function snapToGrid(p) {
  return {
    x: Math.round(p.x / GRID) * GRID,
    y: Math.round(p.y / GRID) * GRID,
  };
}

function gridKey(p) { return p.x + ',' + p.y; }

function recognizeShape(rawPts) {
  if (rawPts.length < 6) return null;

  const pts  = downsample(rawPts, 80);
  const bbox = ptsBounds(pts);
  const diag = Math.sqrt(bbox.w**2 + bbox.h**2);
  if (diag < 10) return null;

  const aspect  = bbox.w / Math.max(bbox.h, 1);
  const closedD = dist(pts[0], pts[pts.length-1]);
  const closed  = closedD / diag < 0.40;

  // ── 1. Snap all points to grid
  const snapped = pts.map(snapToGrid);

  // ── 2. Unique grid cells visited (deduplicated)
  const cellMap = new Map();
  snapped.forEach(p => cellMap.set(gridKey(p), p));
  const cells = [...cellMap.values()];

  // ── 3. Unique X and Y grid values
  const uniqueX = [...new Set(cells.map(p => p.x))].sort((a,b)=>a-b);
  const uniqueY = [...new Set(cells.map(p => p.y))].sort((a,b)=>a-b);
  const nx = uniqueX.length;
  const ny = uniqueY.length;

  // ── STRAIGHT LINE (open)
  if (!closed) {
    // After snapping, a straight line has either 1 unique X or 1 unique Y,
    // or all points roughly collinear
    const start = snapped[0], end = snapped[snapped.length-1];
    const lineDist = dist(start, end);
    if (lineDist < GRID) return null;

    let maxDev = 0;
    snapped.forEach(p => {
      const t = Math.max(0, Math.min(1,
        ((p.x-start.x)*(end.x-start.x)+(p.y-start.y)*(end.y-start.y))/(lineDist**2)));
      const cx = start.x + t*(end.x-start.x);
      const cy = start.y + t*(end.y-start.y);
      maxDev = Math.max(maxDev, dist(p,{x:cx,y:cy}));
    });
    // on the grid, 1 cell deviation is acceptable
    if (maxDev <= GRID * 1.5) {
      return { type:'line', confidence:0.9,
        x1:pts[0].x, y1:pts[0].y,
        x2:pts[pts.length-1].x, y2:pts[pts.length-1].y };
    }
    return null;
  }

  // ── CLOSED SHAPES

  // Get the bounding grid cells (corners of the snapped bounding box)
  const minX = uniqueX[0], maxX = uniqueX[uniqueX.length-1];
  const minY = uniqueY[0], maxY = uniqueY[uniqueY.length-1];

  // How many unique grid rows and columns are occupied
  // Rectangle: many cells on exactly 4 edges, few interior cells
  // Circle/Ellipse: cells spread around a ring, few on edges
  // Triangle: cells on 3 sides

  // ── Count cells on each of the 4 bbox edges
  const onLeft   = cells.filter(p => p.x === minX).length;
  const onRight  = cells.filter(p => p.x === maxX).length;
  const onTop    = cells.filter(p => p.y === minY).length;
  const onBottom = cells.filter(p => p.y === maxY).length;
  const onEdges  = onLeft + onRight + onTop + onBottom;
  const edgeRatio = onEdges / cells.length;

  // ── Circularity on the snapped grid
  const pLen = pathLength(snapped);
  const snapBbox = ptsBounds(snapped);
  const circularity = snapBbox.w > 0 && snapBbox.h > 0
    ? (4 * Math.PI * snapBbox.w * snapBbox.h) / (pLen * pLen)
    : 0;

  // ── Triangle detection via grid:
  // A triangle has cells concentrated near 3 corners of its bbox
  // Check all 4 possible triangle orientations
  const triOrientations = [
    // apex top, base bottom
    [{x:minX+snapBbox.w/2, y:minY}, {x:minX, y:maxY}, {x:maxX, y:maxY}],
    // apex bottom, base top
    [{x:minX, y:minY}, {x:maxX, y:minY}, {x:minX+snapBbox.w/2, y:maxY}],
    // apex left, base right
    [{x:minX, y:minY+snapBbox.h/2}, {x:maxX, y:minY}, {x:maxX, y:maxY}],
    // apex right, base left
    [{x:maxX, y:minY+snapBbox.h/2}, {x:minX, y:minY}, {x:minX, y:maxY}],
  ];

  let bestTriScore = 0;
  triOrientations.forEach(corners => {
    // for each cell, find distance to nearest side of the triangle
    let onSides = 0;
    cells.forEach(p => {
      // distance to each of the 3 line segments
      const sides = [
        [corners[0], corners[1]],
        [corners[1], corners[2]],
        [corners[2], corners[0]],
      ];
      let minD = Infinity;
      sides.forEach(([a,b]) => {
        const len = dist(a,b);
        if (len === 0) return;
        const t = Math.max(0,Math.min(1,
          ((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/(len**2)));
        minD = Math.min(minD, dist(p,{x:a.x+t*(b.x-a.x),y:a.y+t*(b.y-a.y)}));
      });
      if (minD <= GRID * 1.5) onSides++;
    });
    bestTriScore = Math.max(bestTriScore, onSides / cells.length);
  });

  // ── DECISION using grid metrics ──

  // Circle/Ellipse: high circularity, low edgeRatio (points not hugging edges)
  if (circularity > 0.72 && edgeRatio < 0.50) {
    const type = (aspect > 0.72 && aspect < 1.40) ? 'circle' : 'ellipse';
    return { type, confidence: circularity, bbox };
  }

  // Triangle: high triScore, NOT high edgeRatio
  if (bestTriScore > 0.65 && edgeRatio < 0.70) {
    return { type:'triangle', confidence: bestTriScore, bbox };
  }

  // Rectangle/Square: high edgeRatio (most cells on the 4 edges)
  if (edgeRatio > 0.45 && circularity < 0.80) {
    const sq = Math.min(aspect, 1/aspect);
    const label = sq > 0.80 ? 'square' : 'rectangle';
    return { type:'rect', shapeType: label, confidence: edgeRatio, bbox };
  }

  // Diamond: squarish, low edgeRatio, medium circularity
  if (Math.min(aspect,1/aspect) > 0.60
      && edgeRatio < 0.45
      && circularity < 0.72) {
    return { type:'diamond', confidence: 0.65, bbox };
  }

  // Hexagon: medium circularity
  if (circularity > 0.55 && circularity <= 0.72 && edgeRatio < 0.50) {
    return { type:'hexagon', confidence: circularity, bbox };
  }

  return null;
}

// ── Find corners: points where direction changes sharply
function findCorners(pts, threshold = 0.60) {
  const n = pts.length;
  // window = 5% of points, but min 3 and max 10
  // small drawings have fewer points so we need a smaller window
  const win = Math.max(3, Math.min(10, Math.floor(n * 0.05)));
  const raw = [];

  for (let i = win; i < n - win; i++) {
    const prev = pts[i - win];
    const curr = pts[i];
    const next = pts[i + win];
    const a1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const a2 = Math.atan2(next.y - curr.y, next.x - curr.x);
    let da = Math.abs(a2 - a1);
    if (da > Math.PI) da = 2 * Math.PI - da;
    if (da > threshold) raw.push({ idx: i, da });
  }

  // merge nearby corners — keep sharpest in each cluster
  const minGap = win * 2;
  const merged = [];
  let group = [];
  raw.forEach(c => {
    if (group.length === 0 || c.idx - group[group.length-1].idx < minGap) {
      group.push(c);
    } else {
      merged.push(group.reduce((a,b) => a.da > b.da ? a : b));
      group = [c];
    }
  });
  if (group.length) merged.push(group.reduce((a,b) => a.da > b.da ? a : b));

  return merged;
}

// ── Show the convert popup near the stroke
let convertPopupTimer = null;

function showConvertPopup(strokeId, recognized, pathEl) {
  hideConvertPopup();

  const popup = document.getElementById('shape-convert-popup');
  if (!popup) return;

  // build popup content based on recognized shape
  const labels = {
    'rect':              { icon: '▭', label: 'Rectangle' },
    'circle':            { icon: '○', label: 'Circle' },
    'ellipse':           { icon: '⬯', label: 'Ellipse' },
    'triangle':          { icon: '△', label: 'Triangle' },
    'diamond':           { icon: '◇', label: 'Diamond' },
    'hexagon':           { icon: '⬡', label: 'Hexagon' },
    'line':              { icon: '╱', label: 'Straight line' },
    'right-angle-arrow': { icon: '⌐', label: 'Right-angle arrow' },
  };

  const info = labels[recognized.type] || { icon: '◻', label: recognized.type };

  // all shape options for dropdown
  const allShapes = [
    { key:'rect',     icon:'▭', label:'Rectangle' },
    { key:'circle',   icon:'○', label:'Circle' },
    { key:'ellipse',  icon:'⬯', label:'Ellipse' },
    { key:'triangle', icon:'△', label:'Triangle' },
    { key:'diamond',  icon:'◇', label:'Diamond' },
    { key:'hexagon',  icon:'⬡', label:'Hexagon' },
    { key:'line',     icon:'╱', label:'Line' },
    { key:'arrow',    icon:'→', label:'Arrow' },
  ];

  const otherShapes = allShapes.filter(s => s.key !== recognized.type);

  popup.innerHTML = `
    <span class="scp-label-txt">Convert to</span>
    <div class="scp-dropdown">
      <button class="scp-convert-btn" id="scp-main-btn">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M1 6.5C1 3.46 3.46 1 6.5 1s5.5 2.46 5.5 5.5-2.46 5.5-5.5 5.5S1 9.54 1 6.5z"
            stroke="#2e9d91" stroke-width="1.2"/>
          <path d="M4.5 6.5l1.5 1.5 2.5-3" stroke="#2e9d91" stroke-width="1.3"
            stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${info.icon} ${info.label}
      </button>
      <button class="scp-chevron" id="scp-chevron-btn" title="Other shapes">▾</button>
      <div class="scp-shape-list" id="scp-shape-list">
        <button class="scp-shape-opt suggested" data-shape="${recognized.type}">
          ${info.icon} ${info.label} <span style="margin-left:auto;font-size:10px;opacity:.4;">suggested</span>
        </button>
        ${otherShapes.map(s =>
          `<button class="scp-shape-opt" data-shape="${s.key}">${s.icon} ${s.label}</button>`
        ).join('')}
      </div>
    </div>
    <button class="scp-dismiss" id="scp-dismiss-btn" title="Keep as drawing">✕</button>
  `;

  popup.classList.add('visible');

  // position near the stroke bounding box
  let sx, sy;
  if (recognized.bbox) {
    const sp = worldToScreen(recognized.bbox.x + recognized.bbox.w/2, recognized.bbox.y);
    sx = sp.x; sy = sp.y;
  } else if (recognized.x1 !== undefined) {
    const sp = worldToScreen((recognized.x1+recognized.x2)/2, Math.min(recognized.y1,recognized.y2));
    sx = sp.x; sy = sp.y;
  } else {
    sx = window.innerWidth/2; sy = window.innerHeight/2;
  }

  // position above the stroke
  requestAnimationFrame(() => {
    const pw = popup.offsetWidth || 240;
    const ph = popup.offsetHeight || 44;
    let left = sx - pw/2;
    let top  = sy - ph - 14;
    if (top < 60) top = sy + 20;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    popup.style.left = left + 'px';
    popup.style.top  = top  + 'px';
  });

  // wire main button
  document.getElementById('scp-main-btn').addEventListener('click', () => {
    convertStrokeToShape(strokeId, recognized);
    hideConvertPopup();
  });
  // wire chevron dropdown
  document.getElementById('scp-chevron-btn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('scp-shape-list').classList.toggle('open');
  });
  // wire all shape options
  document.querySelectorAll('.scp-shape-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const shapeKey = btn.dataset.shape;
      const customRec = { ...recognized, type: shapeKey };
      convertStrokeToShape(strokeId, customRec);
      hideConvertPopup();
    });
  });
  document.getElementById('scp-dismiss-btn').addEventListener('click', () => {
    hideConvertPopup();
  });
  // close dropdown on outside click
  document.addEventListener('click', function closeList() {
    document.getElementById('scp-shape-list')?.classList.remove('open');
  }, { once: true });

  // auto-dismiss after 5 seconds
  convertPopupTimer = setTimeout(hideConvertPopup, 5000);
}

function hideConvertPopup() {
  clearTimeout(convertPopupTimer);
  const popup = document.getElementById('shape-convert-popup');
  if (popup) popup.classList.remove('visible');
}

// ── Convert the stroke to a clean shape object
function convertStrokeToShape(strokeId, recognized) {
  // remove the original stroke
  const pathEl = document.querySelector(`path[data-obj-id="${strokeId}"]`);
  if (pathEl) pathEl.remove();
  state.objects = state.objects.filter(o => o.id !== strokeId);

  const type = recognized.type;

  if (type === 'line' || type === 'right-angle-arrow') {
    const obj = {
      id: uid(), type: 'shape',
      shapeType: 'arrow',
      x: recognized.x1, y: recognized.y1,
      x2: recognized.x2, y2: recognized.y2,
      fill: 'none', stroke: '#141414', strokeWidth: 2,
      label: '',
    };
    stampOwner(obj);
    state.objects.push(obj);
    renderShapeObj(obj);

  } else {
    const b = recognized.bbox;
    const shapeMap = {
      'rect': 'rect', 'circle': 'circle', 'ellipse': 'circle',
      'triangle': 'triangle', 'diamond': 'diamond',
      'hexagon': 'hexagon', 'pentagon': 'hexagon',
    };
    const shapeType = shapeMap[type] || 'rect';
    const obj = {
      id: uid(), type: 'shape',
      shapeType,
      x: b.x, y: b.y, w: b.w, h: b.h,
      fill: '#fbfbfb', stroke: '#141414', strokeWidth: 1.5,
      label: '',
    };
    stampOwner(obj);
    state.objects.push(obj);
    renderShapeObj(obj);
  }

  updateObjectCount();
  History.push();
  saveToStorage();
  showToast('Converted to shape ✓');
}

// ── Hide popup when user starts drawing again
const _origStartStroke = startStroke;
startStroke = function(e) {
  hideConvertPopup();
  _origStartStroke(e);
};


// ═══════════════════════════════════════════════════
// PEN TOOLBAR — colors, width, opacity
// ═══════════════════════════════════════════════════

function initPenToolbar() {
  const wrap = document.getElementById('pt-colors');
  if (!wrap) return;
  if (wrap.dataset.toolbarInited === '1') return;
  wrap.dataset.toolbarInited = '1';
  PEN_COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'pt-color' + (c.hex === penState.color ? ' active' : '');
    s.style.background = c.hex;
    if (c.hex === '#fbfbfb') s.style.border = '2px solid rgba(251,251,251,0.3)';
    s.title = c.name;
    s.addEventListener('click', () => {
      setPenColor(c.hex);
      wrap.querySelectorAll('.pt-color').forEach(x => x.classList.remove('active'));
      s.classList.add('active');
    });
    wrap.appendChild(s);
  });
}

function setPenColor(hex) {
  penState.color = hex;
}

function setPenWidth(w) {
  penState.width = w;
  document.querySelectorAll('.pt-width').forEach(b => {
    b.classList.toggle('active', parseFloat(b.dataset.width) === w);
  });
}

function setPenOpacity(val) {
  penState.opacity = val / 100;
}

whenDomReady(initPenToolbar);


// ═══════════════════════════════════════════════════
// CONTEXT MENU
// ═══════════════════════════════════════════════════

let ctxTargetId   = null;
let ctxTargetType = null;

function showContextMenu(e) {
  e.preventDefault();

  // find what was right-clicked
  const stickyEl = e.target.closest('.sticky-note');
  const textEl   = e.target.closest('.canvas-text');
  const shapeEl  = e.target.closest('.shape-obj');
  const imageEl  = e.target.closest('.image-obj');

  const el = stickyEl || textEl || shapeEl || imageEl;

  if (!el) {
    // right-clicked on empty canvas — hide menu
    hideContextMenu();
    return;
  }

  ctxTargetId = el.dataset.objId;
  const obj   = state.objects.find(o => o.id === ctxTargetId);
  if (!obj) return;

  ctxTargetType = obj.type;

  // update lock label
  const lockLabel = document.getElementById('ctx-lock-label');
  if (lockLabel) lockLabel.textContent = obj.locked ? 'Unlock' : 'Lock';

  const canEdit = canEditObject(obj);

  // disable front/back for strokes (they're in SVG, z-order works differently)
  document.getElementById('ctx-front').classList.toggle('disabled', obj.type === 'stroke' || !canEdit);
  document.getElementById('ctx-back').classList.toggle('disabled', obj.type === 'stroke' || !canEdit);
  document.getElementById('ctx-lock')?.classList.toggle('disabled', !canEdit);
  document.getElementById('ctx-delete')?.classList.toggle('disabled', !canEdit);
  document.getElementById('ctx-copy')?.classList.remove('disabled');
  document.getElementById('ctx-duplicate')?.classList.remove('disabled');

  // position menu — keep inside viewport
  const menu = document.getElementById('ctx-menu');
  menu.classList.add('visible');

  requestAnimationFrame(() => {
    const mw = menu.offsetWidth  || 180;
    const mh = menu.offsetHeight || 200;
    let left = e.clientX + 4;
    let top  = e.clientY + 4;
    if (left + mw > window.innerWidth  - 8) left = e.clientX - mw - 4;
    if (top  + mh > window.innerHeight - 8) top  = e.clientY - mh - 4;
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top  = Math.max(60, top) + 'px';
  });

  // select only when the current user can edit it
  if (canEdit && typeof selectObject === 'function') selectObject(ctxTargetId, false);
}

function hideContextMenu() {
  document.getElementById('ctx-menu')?.classList.remove('visible');
  ctxTargetId   = null;
  ctxTargetType = null;
}

// close on any click outside
document.addEventListener('mousedown', e => {
  if (!e.target.closest('#ctx-menu')) hideContextMenu();
});
document.addEventListener('scroll', hideContextMenu, true);

// ── Context menu actions
function ctxAction(action) {
  // save id BEFORE hideContextMenu clears ctxTargetId
  const id = ctxTargetId;
  hideContextMenu();
  if (!id) return;
  const obj = state.objects.find(o => o.id === id);
  if (!obj) return;

  switch (action) {

    case 'copy': {
      copyObjectsToClipboard([id]);
      showToast('Copied — press Ctrl+V to paste');
      break;
    }

    case 'duplicate': {
      const copy = cloneObjectWithNewOwner(obj, 20, 20);
      state.objects.push(copy);
      updateObjectCount();
      renderObjectFromData(copy);
      History.push(); saveToStorage();
      showToast('Duplicated to your work');
      break;
    }

    case 'front': {
      if (!guardEditObject(obj)) break;
      // bring to front: assign highest zIndex among all DOM objects
      const allEls = canvasWorld.querySelectorAll(
        '.sticky-note, .canvas-text, .shape-obj, .image-obj'
      );
      let maxZ = 10;
      allEls.forEach(e => { const z = parseInt(e.style.zIndex||0); if(z>maxZ) maxZ=z; });
      const frontZ = maxZ + 1;
      obj.zIndex = frontZ;
      const frontEl = canvasWorld.querySelector(`[data-obj-id="${id}"]`);
      if (frontEl) frontEl.style.zIndex = frontZ;
      // reorder in state array too
      state.objects = state.objects.filter(o => o.id !== id);
      state.objects.push(obj);
      History.push(); saveToStorage();
      showToast('Brought to front');
      break;
    }

    case 'back': {
      if (!guardEditObject(obj)) break;
      // send to back: assign lowest zIndex
      const backEls = canvasWorld.querySelectorAll(
        '.sticky-note, .canvas-text, .shape-obj, .image-obj'
      );
      let minZ = Infinity;
      backEls.forEach(e => { const z = parseInt(e.style.zIndex||10); if(z<minZ) minZ=z; });
      const backZ = Math.max(1, minZ - 1);
      obj.zIndex = backZ;
      const backEl = canvasWorld.querySelector(`[data-obj-id="${id}"]`);
      if (backEl) backEl.style.zIndex = backZ;
      // reorder in state array
      state.objects = state.objects.filter(o => o.id !== id);
      state.objects.unshift(obj);
      History.push(); saveToStorage();
      showToast('Sent to back');
      break;
    }

    case 'lock': {
      if (!guardEditObject(obj)) break;
      obj.locked = !obj.locked;
      const lockEl = canvasWorld.querySelector(`[data-obj-id="${id}"]`);
      if (lockEl) {
        if (obj.locked) {
          applyLockStyle(lockEl);
        } else {
          lockEl.dataset.locked = '';
          lockEl.style.opacity = '';
          lockEl.querySelectorAll('.lock-badge').forEach(b => b.remove());
        }
      }
      History.push(); saveToStorage();
      showToast(obj.locked ? '🔒 Locked — right-click to unlock' : '🔓 Unlocked');
      break;
    }

    case 'delete': {
      if (!guardEditObject(obj)) break;
      const el = canvasWorld.querySelector(`[data-obj-id="${id}"]`);
      if (el) el.remove();
      document.querySelector(`path[data-obj-id="${id}"]`)?.remove();
      state.objects = state.objects.filter(o => o.id !== id);
      updateObjectCount();
      if (typeof clearAllSelections === 'function') clearAllSelections();
      History.push(); saveToStorage();
      showToast('Deleted');
      break;
    }
  }
}

// ── Also prevent default context menu on sticky notes, shapes, images
['sticky-note','canvas-text','shape-obj','image-obj'].forEach(cls => {
  document.addEventListener('contextmenu', e => {
    if (e.target.closest('.' + cls)) {
      e.preventDefault();
      showContextMenu(e);
    }
  });
});


// ═══════════════════════════════════════════════════
// AI GENERATION — STEP 9
// ═══════════════════════════════════════════════════

const AI_PROMPT_MAX_CHARS = 500;
const AI_MAX_OBJECTS = 25;
const AI_MAX_STICKY_CHARS = 280;
const AI_MAX_TEXT_CHARS = 120;
const AI_MAX_LABEL_CHARS = 60;

const AI_BLOCKED_PROMPT_PATTERNS = [
  /\b(html|css|javascript|typescript|python|java|c\+\+|c#|php|ruby|go\s*lang|kotlin|swift)\b/i,
  /\b(chat\s*bot|chatbot|web\s*app|webapp|website|web\s*site|landing\s*page)\b/i,
  /\b(full\s+(app|application|code|program|software)|complete\s+(app|application|html|code|program))\b/i,
  /\b(runnable|executable|deployable|production[\s-]ready)\b/i,
  /\b(mobile\s*app|android\s*app|ios\s*app|desktop\s*app)\b/i,
  /<!DOCTYPE|<html[\s>]|<head[\s>]|<body[\s>]|<script[\s>]|<style[\s>]|<div[\s>]|<form[\s>]/i,
  /\b(write|generate|create|build|make|develop|code|program)\b[^.]{0,40}\b(app|application|software|program|script|bot|chatbot|website|html|api)\b/i,
  /\b(api\s+endpoint|rest\s+api|graphql|database\s+schema|sql\s+query|backend|frontend)\b/i,
  /\b(spring\s*boot|django|flask|express\.js|next\.js|laravel|react\s*native|vue\.js|angular)\b/i,
  /\b(saas|microservice|docker|kubernetes|npm\s+install|package\.json|node_modules)\b/i,
  /\bcode\s+for\b|\bapp\s+for\b|\bbot\s+for\b|\bprogram\s+for\b/i,
];

const AI_ALLOWED_INTENT_PATTERNS = [
  /\b(flow\s*chart|flowchart|diagram|process|workflow|procedure)\b/i,
  /\b(brainstorm|mind\s*map|mindmap|idea|ideation|think\s*of)\b/i,
  /\b(matrix|grid|quadrant|2\s*x\s*2|priority|funnel|pyramid)\b/i,
  /\b(journey|roadmap|timeline|swimlane|kanban|sprint|retro|retrospective)\b/i,
  /\b(checklist|template|agenda|outline|framework|structure|organize)\b/i,
  /\b(sticky|stickies|note|notes|post[\s-]it)\b/i,
  /\b(step|steps|phase|phases|stage|stages|sequence)\b/i,
  /\b(onboarding|training|workshop|meeting|session|lesson|module)\b/i,
  /\b(summary|summarize|overview|plan|strategy|goals|objectives)\b/i,
  /\b(team|group|cluster|categor|sort|compare|pros\s+and\s+cons)\b/i,
  /\b(customer|user|employee|stakeholder|learner|participant)\b/i,
  /\b(chart|map|layout|visual|draw|sketch|design\s+on\s+the\s+board)\b/i,
];

const AI_CODE_LIKE_OUTPUT = [
  /<!DOCTYPE/i,
  /<html[\s>]/i,
  /<head[\s>]/i,
  /<body[\s>]/i,
  /<script[\s>]/i,
  /<\/script>/i,
  /<style[\s>]/i,
  /<div[\s>]/i,
  /<form[\s>]/i,
  /<input[\s>]/i,
  /<button[\s>]/i,
  /function\s+\w+\s*\(/,
  /import\s+.+from\s+['"]/,
  /export\s+default/,
  /document\.(getElementById|querySelector)/,
  /addEventListener\s*\(/,
];

function evaluateAiPrompt(prompt) {
  const trimmed = (prompt || '').trim();
  if (!trimmed) return { allowed: false, reason: 'Prompt is required' };
  if (trimmed.length > AI_PROMPT_MAX_CHARS) {
    return { allowed: false, reason: `Prompt too long (max ${AI_PROMPT_MAX_CHARS} characters)` };
  }
  for (const pattern of AI_BLOCKED_PROMPT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { allowed: false, reason: 'Board AI is for flowcharts, diagrams, and brainstorming — not code or full applications.' };
    }
  }
  const hasAllowedIntent = AI_ALLOWED_INTENT_PATTERNS.some((pattern) => pattern.test(trimmed));
  if (!hasAllowedIntent) {
    return { allowed: false, reason: 'Board AI only creates diagrams, flowcharts, brainstorm stickies, and templates. Try: "create a 5-step onboarding flowchart".' };
  }
  return { allowed: true };
}

function getAiBlockedPromptReason(text) {
  const result = evaluateAiPrompt(text);
  return result.allowed ? null : result.reason;
}

function truncateAiText(text, maxLen) {
  if (!text || typeof text !== 'string') return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function aiOutputLooksLikeCode(text) {
  if (!text || typeof text !== 'string') return false;
  if (AI_CODE_LIKE_OUTPUT.some((pattern) => pattern.test(text))) return true;
  return (text.match(/<[a-z][a-z0-9]*[\s>]/gi) || []).length >= 2;
}

function sanitizeAiBoardResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') return { title: '', objects: [] };
  const allowedTypes = new Set(['sticky', 'text', 'shape']);
  const objects = Array.isArray(parsed.objects) ? parsed.objects.slice(0, AI_MAX_OBJECTS) : [];
  const sanitized = [];
  let codeLikeCount = 0;

  objects.forEach((obj) => {
    if (!obj || !allowedTypes.has(obj.type)) return;

    if (obj.type === 'sticky') {
      const raw = obj.text || '';
      if (aiOutputLooksLikeCode(raw)) codeLikeCount += 1;
      let text = truncateAiText(raw, AI_MAX_STICKY_CHARS);
      if (aiOutputLooksLikeCode(raw)) {
        text = 'Content trimmed — board AI creates diagrams and stickies, not code. Try a flowchart prompt.';
      }
      sanitized.push({ ...obj, text });
      return;
    }

    if (obj.type === 'text') {
      const raw = obj.content || '';
      if (aiOutputLooksLikeCode(raw)) codeLikeCount += 1;
      let content = truncateAiText(raw, AI_MAX_TEXT_CHARS);
      if (aiOutputLooksLikeCode(raw)) {
        content = 'Use board AI for short labels, not code.';
      }
      sanitized.push({ ...obj, content });
      return;
    }

    if (obj.type === 'shape') {
      const raw = obj.label || '';
      if (aiOutputLooksLikeCode(raw)) codeLikeCount += 1;
      sanitized.push({ ...obj, label: truncateAiText(raw, AI_MAX_LABEL_CHARS) });
    }
  });

  if (codeLikeCount > 0 && sanitized.length > 1) {
    return {
      title: '',
      objects: [{
        type: 'sticky',
        color: 'orange',
        text: 'Board AI is for diagrams, flowcharts, and brainstorming — not full code or apps. Try: create a 5-step onboarding flowchart',
        x: 100,
        y: 100,
        w: 300,
        h: 160,
      }],
    };
  }

  return {
    title: truncateAiText(parsed.title || '', 80),
    objects: sanitized,
  };
}

/** Same-origin API in production; never use localhost on a public HTTPS site. */
function getApiBase() {
  if (typeof window !== 'undefined' && window.__LPA_API_BASE__ != null) {
    return String(window.__LPA_API_BASE__);
  }
  return '';
}

async function postGenerateBoard(body) {
  const url = `${getApiBase()}/api/generate-board`;
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const hint =
      url.includes('localhost') || url.includes('127.0.0.1')
        ? ' Hard-refresh the page (Ctrl+Shift+R) — an old script may still call localhost.'
        : ' Check that Railway is running "npm start" and ANTHROPIC_API_KEY is set.';
    throw new Error((err.message || 'Failed to fetch') + hint);
  }
}

// ── Quick prompt chips
function setAiPrompt(text) {
  document.getElementById('ai-input').value = text;
  document.getElementById('ai-input').focus();
}

// ── Key handler
function handleAiKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitAiPrompt();
  }
  if (e.key === 'Escape') {
    document.getElementById('ai-input').value = '';
    document.getElementById('ai-input').blur();
  }
}

// ── Show/hide loading
function showAiLoading(text) {
  document.getElementById('ai-loading-text').textContent = text || 'Generating your board…';
  document.getElementById('ai-loading').classList.add('visible');
  document.getElementById('ai-send-btn').disabled = true;
}
function hideAiLoading() {
  document.getElementById('ai-loading').classList.remove('visible');
  document.getElementById('ai-send-btn').disabled = false;
}

function extractFirstJsonObject(text) {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function parseAiJsonResponse(rawText) {
  const raw = (rawText || '').trim();
  if (!raw) throw new Error('Empty AI response');

  const candidates = [];
  const strippedFence = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  candidates.push(strippedFence);
  const extracted = extractFirstJsonObject(strippedFence);
  if (extracted) candidates.push(extracted);
  const extractedFromRaw = extractFirstJsonObject(raw);
  if (extractedFromRaw) candidates.push(extractedFromRaw);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch (_e) {}
  }

  throw new Error('Could not parse AI response JSON. Try a shorter prompt or ask AI to return fewer objects.');
}

// ── Main submit
async function submitAiPrompt() {
  if (isReadOnlyMode()) {
    showToast('View-only link: editing disabled');
    return;
  }
  const prompt = document.getElementById('ai-input').value.trim();
  if (!prompt) { document.getElementById('ai-input').focus(); return; }

  const blockReason = getAiBlockedPromptReason(prompt);
  if (blockReason) {
    showToast(blockReason);
    return;
  }

  /* API key check removed for backend proxy */

  showAiLoading('Thinking…');

  try {
    let startX = Math.round(-state.panX / state.zoom + 100);
    let startY = Math.round(-state.panY / state.zoom + 100);
    if (state.objects.length > 0) {
      const bounds = getBoardBounds();
      startX = Math.round(bounds.x + bounds.w + 120);
      startY = Math.round(bounds.y);
    }

    showAiLoading('Generating your board…');

    const response = await postGenerateBoard({
      prompt,
      mode: 'generate',
      context: {
        startX,
        startY,
        objectCount: state.objects.length,
      },
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg =
        err.error ||
        (response.status === 404
          ? 'API route not found — is the server running npm start?'
          : `Server error ${response.status}`);
      throw new Error(msg);
    }

    const data = await response.json();
    const rawText = data.content[0]?.text || '';

    const parsed = sanitizeAiBoardResponse(parseAiJsonResponse(rawText));

    if (!parsed.objects || !Array.isArray(parsed.objects) || !parsed.objects.length) {
      throw new Error('No board objects returned — try a flowchart or brainstorm prompt');
    }

    // ── Render all objects onto the board
    showAiLoading('Placing objects…');
    await renderAiObjects(parsed.objects);

    // update board name if title provided and board is empty
    if (isBoardAdmin() && parsed.title && state.objects.length <= parsed.objects.length) {
      state.boardName = parsed.title;
      document.getElementById('boardName').value = parsed.title;
    }

    document.getElementById('ai-input').value = '';
    History.push();
    saveToStorage();
    hideAiLoading();

    // fit all new objects in view
    setTimeout(() => {
      fitAll();
      showToast('✦ AI generated ' + parsed.objects.length + ' objects');
    }, 100);

  } catch(err) {
    hideAiLoading();
    console.error('AI error:', err);
    showToast('AI error: ' + err.message);
  }
}

// ── Render objects from AI response
async function renderAiObjects(objects) {
  for (const obj of objects) {
    const id = uid();

    if (obj.type === 'sticky') {
      const sObj = {
        id, type: 'sticky',
        x: obj.x || 100, y: obj.y || 100,
        w: obj.w || 220, h: obj.h || 180,
        color: normalizeStickyColorName(obj.color || 'yellow'),
        text: obj.text || '',
        zIndex: nextZIndex(),
      };
      stampOwner(sObj);
      state.objects.push(sObj);
      renderStickyFromObj(sObj);

    } else if (obj.type === 'text') {
      const tObj = stampOwner({
        id, type: 'text',
        x: obj.x || 100, y: obj.y || 100,
        content: obj.content || '',
        fontSize: obj.fontSize || 18,
        fontWeight: obj.fontWeight || '500',
        fontStyle: obj.fontStyle || 'normal',
        color: obj.color || '#141414',
      });
      state.objects.push(tObj);
      addTextToCanvas(tObj);

    } else if (obj.type === 'shape') {
      const isLine = obj.shapeType === 'arrow' || obj.shapeType === 'line';
      const sObj = isLine ? {
        id, type: 'shape',
        shapeType: obj.shapeType,
        x: obj.x || 100, y: obj.y || 100,
        x2: obj.x2 || 300, y2: obj.y2 || 100,
        fill: 'none', stroke: obj.stroke || '#141414',
        strokeWidth: obj.strokeWidth || 2,
        label: '',
      } : {
        id, type: 'shape',
        shapeType: obj.shapeType || 'rect',
        x: obj.x || 100, y: obj.y || 100,
        w: obj.w || 160, h: obj.h || 80,
        fill: obj.fill || '#fbfbfb',
        stroke: obj.stroke || '#141414',
        strokeWidth: obj.strokeWidth || 1.5,
        label: obj.label || '',
      };
      stampOwner(sObj);
      state.objects.push(sObj);
      renderShapeObj(sObj);
    }

    updateObjectCount();
    // small delay so browser doesn't freeze on large generations
    await new Promise(r => setTimeout(r, 8));
  }
}

function showSelectionAiPrompt() {
  const popup = document.getElementById('sel-ai-popup');
  if (!popup) return;

  popup.style.display = 'block';
  requestAnimationFrame(() => {
    const anchorEl = getActiveSelectionToolbarEl();
    const anchorRect = anchorEl
      ? anchorEl.getBoundingClientRect()
      : getSelectionAnchorRect();
    if (anchorRect) {
      positionFloatingPanel(popup, {
        anchorRect,
        excludeIds: ['sel-ai-popup'],
      });
    }
  });

  setTimeout(() => document.getElementById('sel-ai-input')?.focus(), 50);

  // close on outside click
  setTimeout(() => {
    document.addEventListener('mousedown', function closeSelAi(e) {
      if (!e.target.closest('#sel-ai-popup')
        && !e.target.closest('#sel-toolbar')
        && !e.target.closest('#shape-toolbar')
        && !e.target.closest('#text-toolbar')
        && !e.target.closest('#image-toolbar')) {
        document.getElementById('sel-ai-popup').style.display = 'none';
        document.removeEventListener('mousedown', closeSelAi);
      }
    });
  }, 100);
}

function handleSelAiKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); submitSelectionAi(); }
  if (e.key === 'Escape') { document.getElementById('sel-ai-popup').style.display = 'none'; }
}

async function submitSelectionAi() {
  if (isReadOnlyMode()) {
    showToast('View-only link: editing disabled');
    return;
  }
  const prompt = document.getElementById('sel-ai-input').value.trim();
  if (!prompt) return;

  const blockReason = getAiBlockedPromptReason(prompt);
  if (blockReason) {
    showToast(blockReason);
    return;
  }

  /* API key check removed for backend proxy */
  if (selectedIds.size === 0) { showToast('Select some objects first'); return; }

  document.getElementById('sel-ai-popup').style.display = 'none';
  showAiLoading('Modifying selection…');

  // gather selected objects data
  const selObjs = state.objects.filter(o => selectedIds.has(o.id));
  const selBounds = (() => {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    selObjs.forEach(o => {
      const x=o.x||0, y=o.y||0;
      const w=o.w||200, h=o.h||100;
      minX=Math.min(minX,x); minY=Math.min(minY,y);
      maxX=Math.max(maxX,x+w); maxY=Math.max(maxY,y+h);
    });
    return { x:minX, y:minY, w:maxX-minX, h:maxY-minY };
  })();

  try {
    const resp = await postGenerateBoard({
      prompt,
      mode: 'selection',
      selection: {
        objects: selObjs,
        bounds: {
          x: Math.round(selBounds.x),
          y: Math.round(selBounds.y),
          w: Math.round(selBounds.w),
          h: Math.round(selBounds.h),
        },
      },
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${resp.status}`);
    }
    const data = await resp.json();
    const raw  = data.content[0]?.text || '';
    const parsed = sanitizeAiBoardResponse(parseAiJsonResponse(raw));

    if (!parsed.objects || !parsed.objects.length) throw new Error('No objects returned');

    // delete selected objects
    selectedIds.forEach(id => {
      canvasWorld.querySelector(`[data-obj-id="${id}"]`)?.remove();
      document.querySelector(`path[data-obj-id="${id}"]`)?.remove();
      state.objects = state.objects.filter(o => o.id !== id);
    });
    clearAllSelections();

    // render new objects
    await renderAiObjects(parsed.objects);

    History.push(); saveToStorage();
    hideAiLoading();
    showToast('✦ Selection modified by AI');
    document.getElementById('sel-ai-input').value = '';

  } catch(err) {
    hideAiLoading();
    console.error(err);
    showToast('AI error: ' + err.message);
  }
}


// ═══════════════════════════════════════════════════
// MORE OPTIONS MENU
// ═══════════════════════════════════════════════════

function toggleMoreMenu(btn) {
  const menu = document.getElementById('more-menu');
  if (menu.classList.contains('visible')) { hideMoreMenu(); return; }
  menu.classList.add('visible');
  // position to right of the toolbar button
  requestAnimationFrame(() => {
    const r  = btn.getBoundingClientRect();
    const mh = menu.offsetHeight || 300;
    let top  = r.top;
    if (top + mh > window.innerHeight - 8) top = window.innerHeight - mh - 8;
    menu.style.top  = Math.max(60, top) + 'px';
    menu.style.left = (r.right + 8) + 'px';
  });
}

function hideMoreMenu() {
  document.getElementById('more-menu')?.classList.remove('visible');
}

document.addEventListener('mousedown', e => {
  if (!e.target.closest('#more-menu') && !e.target.closest('#more-btn')) {
    hideMoreMenu();
  }
});

// ── Background color
const BG_CONFIGS = {
  white: { bg: '#fbfbfb', dot: 'rgba(20,20,20,0.13)', uiBg: '#141414', name: 'white' },
  gray:  { bg: '#fbfbfb', dot: 'rgba(20,20,20,0.22)', uiBg: '#141414', name: 'gray'  },
  dark:  { bg: '#141414', dot: 'rgba(251,251,251,0.10)', uiBg: '#141414', name: 'dark' },
};
let currentBg = localStorage.getItem('lpa-canvas-bg') || 'white';

function setBoardBg(name) {
  currentBg = name;
  localStorage.setItem('lpa-canvas-bg', name);
  applyBoardBg();
  // update active swatch
  document.querySelectorAll('.mm-bg-swatch').forEach(s => {
    s.classList.toggle('active', s.id === 'bg-' + name);
  });
}

function applyBoardBg() {
  const cfg = BG_CONFIGS[currentBg] || BG_CONFIGS.white;
  document.documentElement.style.setProperty('--canvas-bg', cfg.bg);
  document.documentElement.style.setProperty('--dot-color', cfg.dot);
  // dark mode text color adjustment
  if (currentBg === 'dark') {
    document.documentElement.style.setProperty('--text-on-canvas', '#fbfbfb');
  } else {
    document.documentElement.style.setProperty('--text-on-canvas', '#141414');
  }
  // update active swatch
  document.querySelectorAll('.mm-bg-swatch').forEach(s => {
    s.classList.toggle('active', s.id === 'bg-' + currentBg);
  });
}

// ── Full screen
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      showToast('Fullscreen not available in this browser');
    });
    showToast('Press Escape to exit full screen');
  } else {
    document.exitFullscreen();
  }
}

// ── Clear board
function clearBoard() {
  const count = state.objects.length;
  if (count === 0) { showToast('Board is already empty'); return; }
  if (!confirm(`Clear the entire board? This will delete all ${count} objects and cannot be undone.`)) return;
  // remove all DOM elements
  canvasWorld.querySelectorAll('.sticky-note, .canvas-text, .shape-obj, .image-obj').forEach(el => el.remove());
  const svg = document.getElementById('drawing-layer');
  if (svg) svg.innerHTML = '';
  state.objects = [];
  clearAllSelections();
  updateObjectCount();
  History.baseline();
  saveToStorage();
  showToast('Board cleared');
}

// ── Board info
function showBoardInfo() {
  const counts = { sticky:0, text:0, shape:0, image:0, stroke:0 };
  state.objects.forEach(o => { if (counts[o.type] !== undefined) counts[o.type]++; });
  const created = localStorage.getItem('lpa-board-created') || 'Unknown';
  const saved   = localStorage.getItem('lpa-board-saved')   || 'Not saved yet';

  document.getElementById('bip-content').innerHTML = `
    <div class="bip-row"><span class="bip-label">BOARD NAME</span><span class="bip-value">${state.boardName || 'Untitled'}</span></div>
    <div class="bip-row"><span class="bip-label">TOTAL OBJECTS</span><span class="bip-value">${state.objects.length}</span></div>
    <div class="bip-row"><span class="bip-label">STICKY NOTES</span><span class="bip-value">${counts.sticky}</span></div>
    <div class="bip-row"><span class="bip-label">SHAPES & ARROWS</span><span class="bip-value">${counts.shape}</span></div>
    <div class="bip-row"><span class="bip-label">TEXT NODES</span><span class="bip-value">${counts.text}</span></div>
    <div class="bip-row"><span class="bip-label">IMAGES</span><span class="bip-value">${counts.image}</span></div>
    <div class="bip-row"><span class="bip-label">PEN STROKES</span><span class="bip-value">${counts.stroke}</span></div>
    <div class="bip-row"><span class="bip-label">BACKGROUND</span><span class="bip-value">${currentBg.charAt(0).toUpperCase() + currentBg.slice(1)}</span></div>
  `;

  document.getElementById('panel-backdrop').style.display = 'block';
  document.getElementById('board-info-panel').classList.add('visible');
}

// ── About
function showAbout() {
  document.getElementById('panel-backdrop').style.display = 'block';
  document.getElementById('about-panel').classList.add('visible');
}

// ── Close all panels
function closeAllPanels() {
  document.getElementById('panel-backdrop').style.display = 'none';
  document.getElementById('board-info-panel').classList.remove('visible');
  document.getElementById('about-panel').classList.remove('visible');
  document.getElementById('share-dialog').classList.remove('visible');
  closeActivityPanel();
}

// ── Track board creation date
if (!localStorage.getItem('lpa-board-created')) {
  localStorage.setItem('lpa-board-created', new Date().toLocaleDateString('en-IN', {
    day:'numeric', month:'short', year:'numeric'
  }));
}

// ── Apply bg on load
whenDomReady(() => {
  applyBoardBg();
});

// ═══════════════════════════════════════════════════
// STICKY NOTES — STEP 2
// ═══════════════════════════════════════════════════

const STICKY_COLORS = [
  { name:'yellow',  cls:'sn-yellow'  },
  { name:'orange',  cls:'sn-orange'  },
  { name:'pink',    cls:'sn-pink'    },
  { name:'red',     cls:'sn-red'     },
  { name:'teal',    cls:'sn-teal'    },
  { name:'blue',    cls:'sn-blue'    },
  { name:'purple',  cls:'sn-purple'  },
  { name:'green',   cls:'sn-green'   },
  { name:'white',   cls:'sn-white'   },
  { name:'charcoal',cls:'sn-charcoal'},
];

const STICKY_BG = {
  yellow:'#FFF176', orange:'#FFCC80', pink:'#F48FB1', red:'#EF9A9A',
  teal:'#80DEEA', blue:'#90CAF9', purple:'#CE93D8', green:'#A5D6A7',
  white:'#FAFAFA', charcoal:'#424242',
};

/** Map AI / saved values to a palette name so CSS classes (.sn-*) match. */
function normalizeStickyColorName(raw) {
  if (raw == null || raw === '') return 'yellow';
  const s = String(raw).trim();
  const lower = s.toLowerCase();
  if (STICKY_COLORS.some((c) => c.name === lower)) return lower;
  const hex = lower.startsWith('#') ? lower : `#${lower}`;
  const found = STICKY_COLORS.find((c) => (STICKY_BG[c.name] || '').toLowerCase() === hex);
  if (found) return found.name;
  // Boards saved during brand-palette era (hex values)
  const brandHexMap = {
    '#2e9d91': 'green',
    '#f2541d': 'orange',
    '#4f71f2': 'blue',
    '#fbfbfb': 'white',
    '#141414': 'charcoal',
  };
  if (brandHexMap[hex]) return brandHexMap[hex];
  return 'yellow';
}

let stickyLastColor = 'yellow';
let selectedStickyId = null;
let stickyPickerTargetId = null;

// ── Build color picker swatches once
function initStickyColorPicker() {
  const wrap = document.getElementById('scp-swatches');
  if (!wrap || wrap.dataset.initialized === '1') return;
  wrap.dataset.initialized = '1';
  wrap.innerHTML = '';
  STICKY_COLORS.forEach(c => {
    const s = document.createElement('div');
    s.className = 'scp-swatch';
    s.style.background = STICKY_BG[c.name];
    if (c.name === 'white') s.style.border = '1px solid rgba(20,20,20,0.18)';
    s.title = c.name;
    s.dataset.color = c.name;
    s.addEventListener('click', ev => {
      ev.stopPropagation();
      applyColorToSticky(stickyPickerTargetId, c.name);
      updatePickerSwatchActive(c.name);
      stickyLastColor = c.name;
    });
    wrap.appendChild(s);
  });
}

function updatePickerSwatchActive(colorName) {
  document.querySelectorAll('.scp-swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color === colorName);
  });
}

// ── Place a new sticky on canvas click
function placeSticky(e) {
  e.preventDefault();
  const wp = screenToWorld(e.clientX, e.clientY);
  // center the note on click point
  const W = 220, H = 180;
  const obj = stampOwner({
    id: uid(),
    type: 'sticky',
    x: wp.x - W/2,
    y: wp.y - H/2,
    w: W,
    h: H,
    color: stickyLastColor,
    text: '',
    zIndex: nextZIndex(),
  });
  state.objects.push(obj);
  updateObjectCount();
  // Don't push history here — wait for blur so place+type = 1 undo step
  const el = renderStickyFromObj(obj);
  // auto-focus text area
  setTimeout(() => {
    const ta = el.querySelector('.sticky-text');
    if (ta) ta.focus();
  }, 50);
  // switch back to select after placing
  setTool('select');
}

let _zCounter = 10;
function nextZIndex() { return ++_zCounter; }

// ── Render a sticky DOM element from an object
function renderStickyFromObj(obj) {
  bindBoardDom();
  if (!canvasWorld) return null;
  const colorName = normalizeStickyColorName(obj.color);
  if (obj.color !== colorName) obj.color = colorName;
  const el = document.createElement('div');
  el.className = `sticky-note ${STICKY_COLORS.find((c) => c.name === colorName)?.cls || 'sn-yellow'}`;
  el.dataset.objId = obj.id;
  el.style.cssText = `
    left:${obj.x}px; top:${obj.y}px;
    width:${obj.w}px; height:${obj.h}px;
    z-index:${obj.zIndex || 10};
    position:absolute;
  `;

  el.innerHTML = `
    <div class="sticky-handle" data-drag="true">
      <div class="sticky-handle-dots">
        <div class="sticky-handle-dot"></div>
        <div class="sticky-handle-dot"></div>
        <div class="sticky-handle-dot"></div>
      </div>
      <button class="sticky-menu-btn" title="Options">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="2.5" r="1.2" fill="currentColor"/>
          <circle cx="7" cy="7" r="1.2" fill="currentColor"/>
          <circle cx="7" cy="11.5" r="1.2" fill="currentColor"/>
        </svg>
      </button>
    </div>
    <div class="sticky-body">
      <textarea class="sticky-text" placeholder="Type something…" spellcheck="true">${escapeHtml(obj.text)}</textarea>
    </div>
    <div class="sticky-resize" title="Resize">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M2 9L9 2M5 9L9 5M9 9" stroke="rgba(0,0,0,0.3)" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
    </div>
  `;

  // ── DRAG via handle OR select tool dragging anywhere on note
  const handle = el.querySelector('.sticky-handle');
  handle.addEventListener('mousedown', ev => {
    if (ev.target.closest('.sticky-menu-btn')) return;
    if (obj.locked) { showToast('🔒 Locked — right-click to unlock'); ev.stopPropagation(); return; }
    ev.stopPropagation();
    ev.preventDefault();
    obj.zIndex = nextZIndex();
    el.style.zIndex = obj.zIndex;
    if (state.tool === 'select') {
      selectObject(obj.id, ev.ctrlKey || ev.metaKey);
      startObjDrag(ev, obj.id);
    } else {
      startStickyDrag(ev, el, obj);
    }
  });

  // ── SELECT on click anywhere on note
  el.addEventListener('mousedown', ev => {
    ev.stopPropagation();
    obj.zIndex = nextZIndex();
    el.style.zIndex = obj.zIndex;
    if (state.tool === 'select') {
      if (!ev.target.closest('.sticky-resize') && !ev.target.closest('.sticky-text')) {
        selectObject(obj.id, ev.ctrlKey || ev.metaKey);
        startObjDrag(ev, obj.id);
      }
    } else if (!ev.target.closest('.sticky-resize') && !ev.target.closest('.sticky-text')) {
      selectedStickyId = obj.id;
    }
  });

  // ── TEXT editing
  const ta = el.querySelector('.sticky-text');
  ta.addEventListener('mousedown', ev => ev.stopPropagation());
  ta.addEventListener('focus', () => {
    if (!canEditObject(obj)) {
      ta.blur();
      notifyNotYourWork();
    }
  });
  ta.addEventListener('input', () => {
    if (!canEditObject(obj)) return;
    obj.text = ta.value;
    // auto-grow height
    if (ta.scrollHeight > ta.clientHeight + 4) {
      const newH = Math.max(obj.h, obj.h + (ta.scrollHeight - ta.clientHeight) + 10);
      obj.h = newH;
      el.style.height = newH + 'px';
    }
  });
  ta.addEventListener('blur', () => {
    obj.text = ta.value; // always sync text
    History.push();      // one push covers both place + type as single undo step
    saveToStorage();
  });
  ta.addEventListener('focus', () => selectSticky(obj.id));

  // ── MENU button
  const menuBtn = el.querySelector('.sticky-menu-btn');
  menuBtn.addEventListener('click', ev => {
    ev.stopPropagation();
    ev.preventDefault();
    if (!guardEditObject(obj)) return;
    selectSticky(obj.id);
    showStickyPicker(obj.id, ev.clientX, ev.clientY);
  });

  // ── RESIZE handle
  const resizeHandle = el.querySelector('.sticky-resize');
  resizeHandle.addEventListener('mousedown', ev => {
    ev.stopPropagation();
    ev.preventDefault();
    if (!guardEditObject(obj)) return;
    startStickyResize(ev, el, obj);
  });

  appendToCanvasWorld(el);
  return el;
}

// ── Apply lock visual to any DOM element
function applyLockStyle(el) {
  el.dataset.locked = '1';
  el.style.opacity = '0.6';
  el.querySelectorAll('.lock-badge').forEach(b => b.remove());
  const badge = document.createElement('div');
  badge.className = 'lock-badge';
  badge.style.cssText = 'position:absolute;top:3px;left:3px;font-size:10px;pointer-events:none;z-index:200;line-height:1;';
  badge.textContent = '🔒';
  el.appendChild(badge);
}

function escapeHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── SELECT
function selectSticky(id) {
  const obj = state.objects.find((o) => o.id === id);
  if (!obj || !canSelectObjectForEdit(obj)) {
    notifyNotYourWork();
    return;
  }
  // use unified selectObject if available
  if (typeof selectObject === 'function') {
    selectObject(id, false);
  } else {
    if (selectedStickyId && selectedStickyId !== id) {
      const prev = document.querySelector(`.sticky-note[data-obj-id="${selectedStickyId}"]`);
      if (prev) prev.classList.remove('selected');
    }
    selectedStickyId = id;
    const el = document.querySelector(`.sticky-note[data-obj-id="${id}"]`);
    if (el) el.classList.add('selected');
  }
}

function deselectAllStickies() {
  if (selectedStickyId) {
    const el = document.querySelector(`.sticky-note[data-obj-id="${selectedStickyId}"]`);
    if (el) el.classList.remove('selected');
    selectedStickyId = null;
  }
  hideStickyPicker();
}

// click on canvas background deselects
document.addEventListener('mousedown', (e) => {
  if (!isEventOnCanvas(e)) return;
  // only deselect if clicking truly empty canvas (not an object)
  const isOnObject = e.target.closest('.sticky-note') ||
                     e.target.closest('.canvas-text') ||
                     e.target.closest('.sel-handles');
  if (!isOnObject) {
    deselectAll();
  }
});

// ── DRAG
function startStickyDrag(e, el, obj) {
  if (!guardEditObject(obj)) return;
  if (obj.locked) { showToast('🔒 Locked — right-click to unlock'); return; }
  // if this sticky is part of a multi-selection, use group drag
  if (selectedIds.size > 1 && selectedIds.has(obj.id)) {
    startObjDrag(e, obj.id);
    return;
  }
  const startMouseX = e.clientX;
  const startMouseY = e.clientY;
  const startX = obj.x;
  const startY = obj.y;
  let hasMoved = false;

  el.classList.add('dragging');

  function onMove(ev) {
    const dx = (ev.clientX - startMouseX) / state.zoom;
    const dy = (ev.clientY - startMouseY) / state.zoom;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasMoved = true;
    obj.x = startX + dx;
    obj.y = startY + dy;
    el.style.left = obj.x + 'px';
    el.style.top  = obj.y + 'px';
  }

  function onUp() {
    el.classList.remove('dragging');
    if (hasMoved) { History.push(); saveToStorage(); }
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── RESIZE
function startStickyResize(e, el, obj) {
  const startMouseX = e.clientX;
  const startMouseY = e.clientY;
  const startW = obj.w;
  const startH = obj.h;
  let hasResized = false;

  function onMove(ev) {
    const dx = (ev.clientX - startMouseX) / state.zoom;
    const dy = (ev.clientY - startMouseY) / state.zoom;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) hasResized = true;
    obj.w = Math.max(140, startW + dx);
    obj.h = Math.max(120, startH + dy);
    el.style.width  = obj.w + 'px';
    el.style.height = obj.h + 'px';
  }

  function onUp() {
    if (hasResized) { History.push(); saveToStorage(); }
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// ── COLOR PICKER popup
function showStickyPicker(id, cx, cy) {
  const obj = state.objects.find(o => o.id === id);
  if (!guardEditObject(obj)) return;
  stickyPickerTargetId = id;
  if (obj) updatePickerSwatchActive(normalizeStickyColorName(obj.color));

  const picker = document.getElementById('sticky-color-picker');
  picker.style.display = 'flex';

  // position near the click, keep inside viewport
  const pw = 160, ph = 160;
  let left = cx + 8;
  let top  = cy - 10;
  if (left + pw > window.innerWidth  - 8) left = cx - pw - 8;
  if (top  + ph > window.innerHeight - 8) top  = window.innerHeight - ph - 8;
  picker.style.left = left + 'px';
  picker.style.top  = top  + 'px';
}

function hideStickyPicker() {
  document.getElementById('sticky-color-picker').style.display = 'none';
  stickyPickerTargetId = null;
}

// close picker on outside click — use 'click' not 'mousedown'
// so swatch clicks fire their handler BEFORE this closes the picker
document.addEventListener('click', e => {
  const picker = document.getElementById('sticky-color-picker');
  if (picker.style.display === 'none' || !picker.style.display) return;
  // don't close if clicking inside picker or on the menu button that opened it
  if (e.target.closest('#sticky-color-picker') || e.target.closest('.sticky-menu-btn')) return;
  hideStickyPicker();
});

// ── APPLY COLOR
function applyColorToSticky(id, colorName) {
  if (!id) return;
  const obj = state.objects.find(o => o.id === id);
  if (!guardEditObject(obj)) return;
  obj.color = colorName;
  const el = document.querySelector(`.sticky-note[data-obj-id="${id}"]`);
  if (!el) return;
  // remove all color classes
  STICKY_COLORS.forEach(c => el.classList.remove(c.cls));
  // add new
  const found = STICKY_COLORS.find(c => c.name === colorName);
  if (found) el.classList.add(found.cls);
  saveToStorage();
}

// ── DUPLICATE
function duplicateSelected() {
  if (!stickyPickerTargetId) return;
  const obj = state.objects.find(o => o.id === stickyPickerTargetId);
  if (!obj) return;
  const offset = 20 / state.zoom;
  const copy = cloneObjectWithNewOwner(obj, offset, offset);
  state.objects.push(copy);
  updateObjectCount();
  renderStickyFromObj(copy);
  selectSticky(copy.id);
  hideStickyPicker();
  saveToStorage();
  showToast('Duplicated!');
}

// ── DELETE selected sticky
function deleteSelectedSticky() {
  const id = stickyPickerTargetId || selectedStickyId;
  if (!id) return;
  const obj = state.objects.find(o => o.id === id);
  if (!guardEditObject(obj)) return;
  const el = document.querySelector(`.sticky-note[data-obj-id="${id}"]`);
  if (el) el.remove();
  state.objects = state.objects.filter(o => o.id !== id);
  updateObjectCount();
  hideStickyPicker();
  selectedStickyId = null;
  stickyPickerTargetId = null;
  saveToStorage();
  showToast('Deleted');
}

// ── Delete key support for selected sticky
document.addEventListener('keydown', ev => {
  const isEditing = document.activeElement.tagName === 'TEXTAREA'
    || document.activeElement.tagName === 'INPUT'
    || document.activeElement.isContentEditable;
  if (!isEditing && (ev.key === 'Delete' || ev.key === 'Backspace') && selectedStickyId) {
    ev.preventDefault();
    deleteSelectedSticky();
  }
  // Escape deselects
  if (ev.key === 'Escape') deselectAllStickies();
}, true); // capture phase so it fires before the global keydown

// ── Init picker when this script runs (board_vanilla loads after DOMContentLoaded)
function scheduleInitStickyColorPicker() {
  const run = () => {
    try {
      initStickyColorPicker();
    } catch (e) {
      console.error('initStickyColorPicker', e);
    }
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}
scheduleInitStickyColorPicker();

window.__LPA_BOARD_VANILLA_LOADED__ = true;

let boardBooted = false;

window.__LPA_BOARD_RELOAD_STATE__ = function reloadBoardStateFromServer() {
  bindBoardDom();
  bindUiDom();
  loadFromStorage();
  applyAccessModeUi();
  updateGridToggleUi();
  initRealtimeBoardSync();
  initRealtimePresence();
  pullLatestBoardStateFromSupabase();
};

window.__LPA_BOARD_REINIT__ = function reinitBoardAfterDomRemount() {
  bindBoardDom();
  bindUiDom();
  ensureCanvasMountedOnBody();
  loadFromStorage();
  restoreCanvasIfDomWasCleared();
  applyTransform();
  scheduleBoardRedraw();
  applyAccessModeUi();
  updateGridToggleUi();
  initRealtimeBoardSync();
  initRealtimePresence();
  initActivityPanel();
  pullLatestBoardStateFromSupabase();
  if (activityPanelOpen) renderActivityPanel();
};

window.__LPA_BOARD_BOOT__ = function bootBoard() {
  bindBoardDom();
  bindUiDom();
  ensureCanvasEvents();
  ensureCanvasMountedOnBody();
  if (!boardBooted) {
    boardBooted = true;
    init();
    return;
  }
  window.__LPA_BOARD_REINIT__();
};

