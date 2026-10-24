export function trackPointer(canvas: HTMLCanvasElement, gridSize: () => number) {
  const pointer = { down: false, x: 0, y: 0, prevX: 0, prevY: 0 };
  let activePointerId: number | undefined;

  const track = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return;
    }
    const size = gridSize();
    pointer.x = ((e.clientX - rect.left) / rect.width) * size;
    pointer.y = ((e.clientY - rect.top) / rect.height) * size;
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
