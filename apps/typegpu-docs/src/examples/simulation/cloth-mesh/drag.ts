import { d } from 'typegpu';
import type { Pointer } from './cloth.ts';

const grabRadius = 24;

function suppressMenu(event: Event) {
  event.preventDefault();
}

export function setupClothDrag(
  canvas: HTMLCanvasElement,
  {
    onGrab,
    onMove,
    onRelease,
  }: {
    onGrab: (pointer: d.Infer<typeof Pointer>) => void;
    onMove: (position: d.v2f) => void;
    onRelease: () => void;
  },
) {
  const originalCursor = canvas.style.cursor;
  let pointer: number | undefined;

  function pointerAt(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
      position: d.vec2f(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      radius: d.vec2f((2 * grabRadius) / rect.width, (2 * grabRadius) / rect.height),
    };
  }

  function grab(event: PointerEvent) {
    if (event.pointerType === 'touch' && !event.isPrimary) {
      release();
      return;
    }
    if (pointer !== undefined || event.button !== 0 || event.shiftKey || !event.isPrimary) return;
    event.preventDefault();
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    canvas.style.cursor = 'grabbing';
    onGrab(pointerAt(event));
  }

  function move(event: PointerEvent) {
    if (event.pointerId === pointer) onMove(pointerAt(event).position);
  }

  function release() {
    if (pointer === undefined) return;
    const id = pointer;
    pointer = undefined;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    canvas.style.cursor = 'grab';
    onRelease();
  }

  function end(event: PointerEvent) {
    if (event.pointerId === pointer) release();
  }

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', grab);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('lostpointercapture', end);
  canvas.addEventListener('contextmenu', suppressMenu);
  window.addEventListener('blur', release);

  return {
    get active() {
      return pointer !== undefined;
    },
    release,
    cleanup() {
      release();
      canvas.removeEventListener('pointerdown', grab);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointercancel', end);
      canvas.removeEventListener('lostpointercapture', end);
      canvas.removeEventListener('contextmenu', suppressMenu);
      window.removeEventListener('blur', release);
      canvas.style.cursor = originalCursor;
    },
  };
}
