export interface InputState {
  drawPos: { x: number; y: number } | null;
  lastDrawPos: { x: number; y: number } | null;
  zoomLevel: number;
  zoomCenter: { x: number; y: number };
  zoomLocked: boolean;
  zoomSensitivity: number;
}

export function setupInput(canvas: HTMLCanvasElement): InputState {
  const state: InputState = {
    drawPos: null,
    lastDrawPos: null,
    zoomLevel: 1,
    zoomCenter: { x: 0.5, y: 0.5 },
    zoomLocked: false,
    zoomSensitivity: 0.3,
  };

  const isZoomed = () => state.zoomLevel > 1;
  const screenToUv = (sx: number, sy: number) => ({
    x: (sx - 0.5) / state.zoomLevel + state.zoomCenter.x,
    y: (sy - 0.5) / state.zoomLevel + state.zoomCenter.y,
  });
  const toScreen = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (clientY - r.top) / r.height)),
    };
  };

  const clampCenter = () => {
    const half = 0.5 / state.zoomLevel;
    state.zoomCenter.x = Math.min(1 - half, Math.max(half, state.zoomCenter.x));
    state.zoomCenter.y = Math.min(1 - half, Math.max(half, state.zoomCenter.y));
  };

  const applyZoom = (delta: number) => {
    state.zoomLevel = Math.max(1, Math.min(32, state.zoomLevel + delta));
    if (state.zoomLevel <= 1) {
      state.zoomLevel = 1;
      state.zoomLocked = false;
    }
    clampCenter();
  };

  let pointerDown = false;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return; // handled by touch events
    if (e.button === 2) {
      state.zoomLocked = !state.zoomLocked;
      return;
    }
    pointerDown = true;
    const s = toScreen(e.clientX, e.clientY);
    const uv = screenToUv(s.x, s.y);
    state.drawPos = uv;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const s = toScreen(e.clientX, e.clientY);

    if (!state.zoomLocked && isZoomed()) {
      state.zoomCenter = { x: s.x, y: s.y };
      clampCenter();
    }

    if (pointerDown) {
      state.drawPos = screenToUv(s.x, s.y);
    }
  });

  const stopPointer = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    pointerDown = false;
    state.drawPos = null;
    state.lastDrawPos = null;
  };
  canvas.addEventListener('pointerup', stopPointer);
  canvas.addEventListener('pointerleave', stopPointer);
  canvas.addEventListener('pointercancel', stopPointer);

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0
        ? -state.zoomSensitivity
        : state.zoomSensitivity;
      applyZoom(delta);
    },
    { passive: false },
  );

  let lastPinchDist = 0;
  let lastTouchPos = { x: 0, y: 0 };
  let touchMode: 'none' | 'pan' | 'draw' = 'none';

  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        const s = toScreen(e.touches[0].clientX, e.touches[0].clientY);
        lastTouchPos = s;
        if (isZoomed()) {
          touchMode = 'pan';
        } else {
          touchMode = 'draw';
          state.drawPos = screenToUv(s.x, s.y);
        }
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        if (isZoomed()) {
          touchMode = 'draw';
          const mid = toScreen(
            (e.touches[0].clientX + e.touches[1].clientX) / 2,
            (e.touches[0].clientY + e.touches[1].clientY) / 2,
          );
          state.drawPos = screenToUv(mid.x, mid.y);
        } else {
          touchMode = 'none';
        }
      }
    },
    { passive: false },
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && touchMode === 'pan') {
        // Pan: move zoom center by drag delta
        const s = toScreen(e.touches[0].clientX, e.touches[0].clientY);
        const dx = (s.x - lastTouchPos.x) / state.zoomLevel;
        const dy = (s.y - lastTouchPos.y) / state.zoomLevel;
        state.zoomCenter.x -= dx;
        state.zoomCenter.y -= dy;
        clampCenter();
        lastTouchPos = s;
      } else if (e.touches.length === 1 && touchMode === 'draw') {
        const s = toScreen(e.touches[0].clientX, e.touches[0].clientY);
        state.drawPos = screenToUv(s.x, s.y);
      } else if (e.touches.length === 2) {
        // Pinch zoom
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const pinchDist = Math.sqrt(dx * dx + dy * dy);
        const delta = (pinchDist - lastPinchDist) * 0.02;
        applyZoom(delta);
        lastPinchDist = pinchDist;

        if (touchMode === 'draw') {
          const mid = toScreen(
            (e.touches[0].clientX + e.touches[1].clientX) / 2,
            (e.touches[0].clientY + e.touches[1].clientY) / 2,
          );
          state.drawPos = screenToUv(mid.x, mid.y);
        }
      }
    },
    { passive: false },
  );

  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) {
      touchMode = 'none';
      state.drawPos = null;
      state.lastDrawPos = null;
    }
  });

  return state;
}
