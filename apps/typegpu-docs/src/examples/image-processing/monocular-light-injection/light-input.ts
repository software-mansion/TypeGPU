import { LIGHT_Z_MAX, LIGHT_Z_MIN, defaultRelightingSettings } from './renderer.ts';

const ORBIT_SPEED = 0.00024;
const ORBIT_RADIUS = 0.26;
const WHEEL_STEP_LIMIT = 60;
const WHEEL_SENSITIVITY = 0.0015;
const PINCH_SENSITIVITY = 0.004;
const LIGHT_GRAB_RADIUS = 0.08;
const TAP_SLOP = 0.012;

const LightControl = {
  ORBIT: 'orbit',
  CURSOR: 'cursor',
  PINNED: 'pinned',
} as const;
type LightControl = (typeof LightControl)[keyof typeof LightControl];

type Gesture =
  | { readonly kind: 'none' }
  | { readonly kind: 'press'; readonly grabbed: boolean; readonly x: number; readonly y: number }
  | { readonly kind: 'drag' }
  | { readonly kind: 'pinch'; span: number };

export interface LightUpdate {
  lightPosition?: [number, number];
  lightZ?: number;
}

export interface LightInput {
  readonly lightPosition: [number, number];
  readonly lightZ: number;
  /** Advances the idle orbit; call once per rendered frame */
  orbitTick(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Hovering steers the light, tap or drag pins it, scroll and pinch push it in depth */
export function setupLightInput(
  canvas: HTMLCanvasElement,
  onChange: (update: LightUpdate) => void,
  signal: AbortSignal,
): LightInput {
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: Gesture = { kind: 'none' };
  let control: LightControl = LightControl.ORBIT;
  let lightPosition: [number, number] = [...defaultRelightingSettings.lightPosition];
  let lightZ = defaultRelightingSettings.lightZ;

  function placeLight(x: number, y: number): void {
    lightPosition = [clamp(x, 0, 1), clamp(y, 0, 1)];
    onChange({ lightPosition });
  }

  function pushLight(amount: number): void {
    lightZ = clamp(lightZ + amount, LIGHT_Z_MIN, LIGHT_Z_MAX);
    onChange({ lightZ });
  }

  function pinLight(pinned: boolean): void {
    control = pinned ? LightControl.PINNED : LightControl.CURSOR;
  }

  function canvasFraction(event: PointerEvent): { x: number; y: number } | undefined {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return undefined;
    }
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }

  function overLight(point: { x: number; y: number }): boolean {
    return Math.hypot(point.x - lightPosition[0], point.y - lightPosition[1]) <= LIGHT_GRAB_RADIUS;
  }

  function pinchSpan(): number {
    const [first, second] = [...pointers.values()];
    if (!first || !second) {
      return 0;
    }
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  /** A touch defers placement to the drag or the release, so a pinch's first finger cannot fling the light */
  function beginGesture(event: PointerEvent): void {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      gesture = { kind: 'pinch', span: pinchSpan() };
      return;
    }
    const point = canvasFraction(event);
    if (!point) {
      return;
    }
    const grabbed = overLight(point);
    gesture = { kind: 'press', grabbed, x: point.x, y: point.y };
    if (!grabbed && event.pointerType !== 'touch') {
      placeLight(point.x, point.y);
      pinLight(true);
    }
  }

  function continueGesture(event: PointerEvent): void {
    if (pointers.has(event.pointerId)) {
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (gesture.kind === 'pinch') {
      const span = pinchSpan();
      if (gesture.span > 0) {
        pushLight((span - gesture.span) * PINCH_SENSITIVITY);
      }
      gesture.span = span;
      return;
    }

    const point = canvasFraction(event);
    if (!point) {
      return;
    }
    switch (gesture.kind) {
      case 'press':
        if (Math.hypot(point.x - gesture.x, point.y - gesture.y) > TAP_SLOP) {
          gesture = { kind: 'drag' };
          pinLight(true);
          placeLight(point.x, point.y);
        }
        break;
      case 'drag':
        placeLight(point.x, point.y);
        break;
      case 'none':
        canvas.style.cursor = overLight(point) ? 'grab' : 'crosshair';
        if (control === LightControl.CURSOR) {
          placeLight(point.x, point.y);
        }
        break;
    }
  }

  function endGesture(event: PointerEvent): void {
    pointers.delete(event.pointerId);
    if (gesture.kind === 'pinch') {
      gesture.span = pinchSpan();
    }
    if (pointers.size > 0) {
      return;
    }
    if (gesture.kind === 'press' && event.type === 'pointerup') {
      if (gesture.grabbed) {
        pinLight(control !== LightControl.PINNED);
      } else if (event.pointerType === 'touch') {
        placeLight(gesture.x, gesture.y);
        pinLight(true);
      }
    }
    gesture = { kind: 'none' };
  }

  function enterCanvas(): void {
    if (control !== LightControl.PINNED) {
      control = LightControl.CURSOR;
    }
  }

  function leaveCanvas(): void {
    if (control !== LightControl.PINNED) {
      control = LightControl.ORBIT;
    }
    canvas.style.cursor = 'crosshair';
  }

  function pushLightFromWheel(event: WheelEvent): void {
    event.preventDefault();
    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta *= 16;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      delta *= canvas.clientHeight;
    }
    delta = Math.sign(delta) * Math.min(Math.abs(delta), WHEEL_STEP_LIMIT);
    pushLight(delta * WHEEL_SENSITIVITY);
  }

  canvas.addEventListener('pointerdown', beginGesture, { signal });
  canvas.addEventListener('pointermove', continueGesture, { signal });
  canvas.addEventListener('pointerup', endGesture, { signal });
  canvas.addEventListener('pointercancel', endGesture, { signal });
  canvas.addEventListener('pointerenter', enterCanvas, { signal });
  canvas.addEventListener('pointerleave', leaveCanvas, { signal });
  canvas.addEventListener('wheel', pushLightFromWheel, { passive: false, signal });

  return {
    get lightPosition() {
      return lightPosition;
    },
    get lightZ() {
      return lightZ;
    },
    orbitTick() {
      if (control !== LightControl.ORBIT) {
        return;
      }
      const phase = performance.now() * ORBIT_SPEED;
      placeLight(
        0.5 + Math.cos(phase) * ORBIT_RADIUS,
        0.44 + Math.sin(phase * 1.37) * ORBIT_RADIUS * 0.8,
      );
    },
  };
}
