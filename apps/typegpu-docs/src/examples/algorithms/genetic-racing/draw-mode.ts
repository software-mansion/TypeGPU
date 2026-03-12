import { createTrackOverlay } from './overlay.ts';

const MAX_CONTROL_POINTS = 512;

type DrawModeControllerOptions = {
  canvas: HTMLCanvasElement;
  onEnter?: () => void;
  onExit?: () => void;
  onPreviewTrack: (points: Float32Array) => void;
  onClearPreview?: () => void;
};

export function createDrawModeController({
  canvas,
  onEnter,
  onExit,
  onPreviewTrack,
  onClearPreview,
}: DrawModeControllerOptions) {
  const overlay = createTrackOverlay(canvas);
  const controlPoints = new Float32Array(MAX_CONTROL_POINTS * 2);

  let active = false;
  let pointCount = 0;
  let dragIndex: number | null = null;

  function currentPoints() {
    return controlPoints.subarray(0, pointCount * 2);
  }

  function render() {
    overlay.render(controlPoints, pointCount, dragIndex);
  }

  function clearPoints() {
    pointCount = 0;
    dragIndex = null;
  }

  function refreshPreview() {
    if (!active) {
      return;
    }
    render();
    if (pointCount < 4) {
      return;
    }
    onPreviewTrack(currentPoints());
  }

  function enter() {
    if (active) {
      return;
    }
    active = true;
    clearPoints();
    onEnter?.();
    onClearPreview?.();
    canvas.style.cursor = 'crosshair';
    overlay.show();
    render();
  }

  function exit() {
    if (!active) {
      return;
    }
    active = false;
    dragIndex = null;
    canvas.style.cursor = '';
    overlay.hide();
    onExit?.();
  }

  function confirm() {
    if (!active || pointCount < 4) {
      return null;
    }
    return new Float32Array(currentPoints());
  }

  function handleAspectChange() {
    if (!active) {
      return;
    }
    clearPoints();
    onClearPreview?.();
    render();
  }

  const handleMouseDown = (event: MouseEvent) => {
    if (!active || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const [trackX, trackY] = overlay.clientToTrack(event.clientX, event.clientY);
    const hitIndex = overlay.findNearest(controlPoints, pointCount, trackX, trackY);
    if (hitIndex !== null) {
      dragIndex = hitIndex;
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (pointCount >= MAX_CONTROL_POINTS) {
      return;
    }
    controlPoints[pointCount * 2] = trackX;
    controlPoints[pointCount * 2 + 1] = trackY;
    pointCount++;
    dragIndex = null;
    refreshPreview();
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!active) {
      return;
    }
    const [trackX, trackY] = overlay.clientToTrack(event.clientX, event.clientY);
    if (dragIndex !== null) {
      controlPoints[dragIndex * 2] = trackX;
      controlPoints[dragIndex * 2 + 1] = trackY;
      refreshPreview();
      return;
    }
    canvas.style.cursor =
      overlay.findNearest(controlPoints, pointCount, trackX, trackY) !== null
        ? 'grab'
        : 'crosshair';
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (!active || event.button !== 0) {
      return;
    }
    dragIndex = null;
    canvas.style.cursor = 'crosshair';
  };

  const handleContextMenu = (event: MouseEvent) => {
    if (!active) {
      return;
    }
    event.preventDefault();
    if (pointCount === 0) {
      return;
    }
    pointCount--;
    refreshPreview();
  };

  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('contextmenu', handleContextMenu);

  return {
    get active() {
      return active;
    },

    get pointCount() {
      return pointCount;
    },

    enter,
    exit,
    confirm,
    refreshPreview,
    handleAspectChange,

    destroy() {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      overlay.destroy();
    },
  };
}
