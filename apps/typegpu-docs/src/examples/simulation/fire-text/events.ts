export function trackPointer(canvas: HTMLCanvasElement, gridSize: () => number) {
  const pointer = { down: false, x: 0, y: 0, prevX: 0, prevY: 0 };
  let activePointerId: number | undefined;

  const track = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    // The canvas is letterboxed with `object-contain`, so map into the drawn square.
    const side = Math.min(rect.width, rect.height);
    const left = rect.left + (rect.width - side) / 2;
    const top = rect.top + (rect.height - side) / 2;
    const size = gridSize();
    pointer.x = ((e.clientX - left) / side) * size;
    pointer.y = ((e.clientY - top) / side) * size;
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (activePointerId !== undefined) {
      return;
    }
    canvas.setPointerCapture(e.pointerId);
    activePointerId = e.pointerId;
    pointer.down = true;
    track(e);
    pointer.prevX = pointer.x;
    pointer.prevY = pointer.y;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === activePointerId) {
      track(e);
    }
  });

  const release = (e: PointerEvent) => {
    if (e.pointerId === activePointerId) {
      pointer.down = false;
      activePointerId = undefined;
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);

  return pointer;
}
