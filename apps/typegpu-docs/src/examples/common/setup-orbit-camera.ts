import { mat4 } from 'wgpu-matrix';
import { d, std } from 'typegpu';

export type Vec4 = [number, number, number, number];
type Mat4 = Float32Array<ArrayBuffer>;

export interface CameraState {
  readonly position: Vec4;
  readonly targetPos: Vec4;
  readonly view: Mat4;
  readonly projection: Mat4;
  readonly viewInverse: Mat4;
  readonly projectionInverse: Mat4;
  readonly viewProjection: Mat4;
  readonly viewProjectionInverse: Mat4;
}

export interface CameraOptions {
  initPos: d.v4f | Vec4;
  target?: d.v4f | Vec4;
  minZoom?: number;
  maxZoom?: number;
  invertCamera?: boolean;
}

const cameraDefaults: Partial<CameraOptions> = {
  target: d.vec4f(0, 0, 0, 1),
  minZoom: 1,
  maxZoom: 100,
  invertCamera: false,
};

const up = [0, 1, 0];
const maxPitch = Math.PI / 2 - 0.01;

const source = () => ({ value: new Float32Array(16), version: 0 });

function derived(sources: { version: number }[], compute: (dst: Mat4) => void) {
  const value = new Float32Array(16);
  let seen = -1;
  return () => {
    const stamp = sources.reduce((sum, { version }) => sum + version, 0);
    if (stamp !== seen) {
      compute(value);
      seen = stamp;
    }
    return value;
  };
}

/**
 * Calls back immediately and after camera changes with the same object, updated in place.
 * Derived matrices are cached and computed only when read.
 */
export function setupOrbitCamera(
  canvas: HTMLCanvasElement,
  partialOptions: CameraOptions,
  callback: (camera: CameraState) => void,
) {
  const options = { ...cameraDefaults, ...partialOptions } as Required<CameraOptions>;
  const sensitivity = options.invertCamera ? -0.005 : 0.005;

  const view = source();
  const projection = source();
  const viewInverse = derived([view], (dst) => mat4.inverse(view.value, dst));
  const projectionInverse = derived([projection], (dst) => mat4.inverse(projection.value, dst));
  const viewProjection = derived([view, projection], (dst) =>
    mat4.mul(projection.value, view.value, dst),
  );

  const viewProjectionInverse = derived([view, projection], (dst) =>
    mat4.inverse(viewProjection(), dst),
  );

  const camera: CameraState = {
    position: [0, 0, 0, 1],
    targetPos: [0, 0, 0, 1],
    view: view.value,
    projection: projection.value,
    get viewInverse() {
      return viewInverse();
    },
    get projectionInverse() {
      return projectionInverse();
    },
    get viewProjection() {
      return viewProjection();
    },
    get viewProjectionInverse() {
      return viewProjectionInverse();
    },
  };

  const orbit = { radius: 0, pitch: 0, yaw: 0 };

  function updateView() {
    const { position, targetPos } = camera;
    const planar = orbit.radius * Math.cos(orbit.pitch);
    position[0] = targetPos[0] + planar * Math.sin(orbit.yaw);
    position[1] = targetPos[1] + orbit.radius * Math.sin(orbit.pitch);
    position[2] = targetPos[2] + planar * Math.cos(orbit.yaw);
    mat4.lookAt(position, targetPos, up, view.value);
    view.version++;
    callback(camera);
  }

  function updateProjection() {
    const aspect = canvas.clientWidth / canvas.clientHeight;
    mat4.perspective(Math.PI / 4, aspect, 0.1, 1000, projection.value);
    projection.version++;
  }

  function targetCamera(newPos: d.v4f | Vec4, newTarget?: d.v4f | Vec4) {
    const { targetPos } = camera;
    if (newTarget) {
      [targetPos[0], targetPos[1], targetPos[2]] = newTarget;
    }
    const [x, y, z] = [0, 1, 2].map((i) => newPos[i] - targetPos[i]);
    orbit.radius = Math.hypot(x, y, z);
    orbit.yaw = Math.atan2(x, z);
    orbit.pitch = Math.asin(y / orbit.radius);
    updateView();
  }

  function rotateCamera(dx: number, dy: number) {
    orbit.yaw -= dx * sensitivity;
    orbit.pitch = std.clamp(orbit.pitch + dy * sensitivity, -maxPitch, maxPitch);
    updateView();
  }

  function zoomCamera(delta: number) {
    orbit.radius = std.clamp(orbit.radius + delta * 0.05, options.minZoom, options.maxZoom);
    updateView();
  }

  updateProjection();
  targetCamera(options.initPos, options.target);

  const resizeObserver = new ResizeObserver(() => {
    updateProjection();
    callback(camera);
  });
  resizeObserver.observe(canvas);

  const listeners = new AbortController();
  const { signal } = listeners;

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const unit: Record<number, number> = {
        [WheelEvent.DOM_DELTA_LINE]: 16,
        [WheelEvent.DOM_DELTA_PAGE]: canvas.clientHeight,
      };
      // Chrome reports ~100px per mouse wheel notch, which would jump
      zoomCamera(std.clamp(event.deltaY * (unit[event.deltaMode] ?? 1), -60, 60));
    },
    { passive: false, signal },
  );

  const pointers = new Map<number, { x: number; y: number }>();
  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const previousTouchAction = canvas.style.touchAction;
  canvas.style.touchAction = 'none';

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    },
    { signal },
  );

  canvas.addEventListener(
    'pointermove',
    (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) {
        return;
      }
      const current = { x: event.clientX, y: event.clientY };
      const before = pointers.size === 2 ? pinchDistance() : 0;
      pointers.set(event.pointerId, current);
      if (pointers.size === 1) {
        rotateCamera(current.x - previous.x, current.y - previous.y);
      } else if (pointers.size === 2) {
        zoomCamera((before - pinchDistance()) * 0.5);
      }
    },
    { signal },
  );

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    canvas.addEventListener(type, (event) => pointers.delete(event.pointerId), { signal });
  }

  function cleanupCamera() {
    listeners.abort();
    resizeObserver.disconnect();
    canvas.style.touchAction = previousTouchAction;
  }

  return { cleanupCamera, targetCamera };
}
