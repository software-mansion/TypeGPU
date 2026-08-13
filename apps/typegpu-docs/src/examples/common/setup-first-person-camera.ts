import * as m from 'wgpu-matrix';
import { d, std } from 'typegpu';

export const Camera = d.struct({
  pos: d.vec4f,
  targetPos: d.vec4f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
  viewInverse: d.mat4x4f,
  projectionInverse: d.mat4x4f,
});

export interface CameraOptions {
  initPos?: d.v3f;
  target?: d.v3f;
  /** Vertical field of view in radians. */
  fov?: number;
  /** Distance to the near clipping plane. */
  near?: number;
  /** Distance to the far clipping plane. */
  far?: number;
  /**
   * Scrolling accelerates/decelerates the movement.
   * `d.vec3f(minimum, initial, maximum)`
   */
  speed?: d.v3f;
}

const cameraDefaults: Partial<CameraOptions> = {
  initPos: d.vec3f(0, 0, 0),
  target: d.vec3f(0, 1, 0),
  fov: Math.PI / 4,
  near: 0.1,
  far: 1000,
  speed: d.vec3f(1, 1, 1),
};
const maxPitch = Math.PI / 2 - 0.01;

/**
 * Sets up a first person camera.
 * Calls the callback on scroll events, canvas clicks/touches and resizes.
 * Also, calls the callback during the setup with an initial camera.
 */
export function setupFirstPersonCamera(
  canvas: HTMLCanvasElement,
  partialOptions: CameraOptions,
  callback: (updatedProps: Partial<d.Infer<typeof Camera>>) => void,
) {
  const options = { ...cameraDefaults, ...partialOptions } as Required<CameraOptions>;
  const targetDirection = options.target.sub(options.initPos);
  const initialDirection =
    Math.hypot(targetDirection.x, targetDirection.y, targetDirection.z) > 1e-6
      ? targetDirection
      : d.vec3f(0, 0, 1);

  // `runCallback` creates a Camera object based on the `cameraState` and passes it to the callback
  const cameraState = {
    pos: options.initPos,
    yaw: Math.atan2(initialDirection.x, initialDirection.z),
    pitch: std.clamp(
      Math.atan2(initialDirection.y, Math.hypot(initialDirection.x, initialDirection.z)),
      -maxPitch,
      maxPitch,
    ),
  };

  function runCallback() {
    const position = cameraState.pos;
    const pitch = cameraState.pitch;
    const yaw = cameraState.yaw;
    const target = position.add(
      d.vec3f(std.cos(pitch) * std.sin(yaw), std.sin(pitch), std.cos(pitch) * std.cos(yaw)),
    );

    const view = calculateView(position, target);
    const projection = calculateProj(
      canvas.clientWidth / canvas.clientHeight,
      options.fov,
      options.near,
      options.far,
    );

    callback(
      Camera({
        pos: d.vec4f(position, 1),
        targetPos: d.vec4f(target, 1),
        view,
        projection,
        viewInverse: invertMat(view),
        projectionInverse: invertMat(projection),
      }),
    );
  }

  function rotateCamera(dx: number, dy: number) {
    const orbitSensitivity = 0.005;
    cameraState.yaw += -dx * orbitSensitivity;
    cameraState.pitch -= dy * orbitSensitivity;
    cameraState.pitch = std.clamp(cameraState.pitch, -maxPitch, maxPitch);

    runCallback();
  }

  // resize observer
  const resizeObserver = new ResizeObserver(() => {
    runCallback();
  });
  resizeObserver.observe(canvas);

  // Variables for interaction.
  const pressedKeys = new Set<string>();
  let moveSpeed = options.speed.y;

  // keyboard events
  const keyDownEventListener = (event: KeyboardEvent) => {
    pressedKeys.add(event.key.toLowerCase());
  };
  window.addEventListener('keydown', keyDownEventListener);

  const keyUpEventListener = (event: KeyboardEvent) => {
    pressedKeys.delete(event.key.toLowerCase());
  };
  window.addEventListener('keyup', keyUpEventListener);

  // mouse events
  canvas.addEventListener('mousedown', () => {
    void canvas.requestPointerLock();
  });

  canvas.addEventListener('mousemove', (event: MouseEvent) => {
    if (document.pointerLockElement !== canvas) {
      return;
    }
    const dx = event.movementX;
    const dy = event.movementY;
    rotateCamera(dx, dy);
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      moveSpeed = std.clamp(moveSpeed * (1 - e.deltaY * 0.0005), options.speed.x, options.speed.z);
    },
    { passive: false },
  );

  function cleanupCamera() {
    window.removeEventListener('keydown', keyDownEventListener);
    window.removeEventListener('keyup', keyUpEventListener);
    resizeObserver.unobserve(canvas);
  }

  // update position function
  const updatePosition = () => {
    if (document.pointerLockElement !== canvas) {
      return;
    }

    const forward = std
      .normalize(d.vec3f(std.sin(cameraState.yaw), 0, std.cos(cameraState.yaw)))
      .mul(moveSpeed);
    const left = d.vec3f(forward.z, 0, -forward.x);

    if (pressedKeys.has('w')) {
      cameraState.pos = cameraState.pos.add(forward);
    }
    if (pressedKeys.has('s')) {
      cameraState.pos = cameraState.pos.sub(forward);
    }
    if (pressedKeys.has('a')) {
      cameraState.pos = cameraState.pos.add(left);
    }
    if (pressedKeys.has('d')) {
      cameraState.pos = cameraState.pos.sub(left);
    }
    if (pressedKeys.has('shift')) {
      cameraState.pos.y -= moveSpeed;
    }
    if (pressedKeys.has(' ')) {
      cameraState.pos.y += moveSpeed;
    }

    runCallback();
  };

  runCallback();
  return { cleanupCamera, updatePosition };
}

function calculateView(position: d.v3f, target: d.v3f) {
  return m.mat4.lookAt(position, target, d.vec3f(0, 1, 0), d.mat4x4f());
}

function calculateProj(aspectRatio: number, fov: number, near: number, far: number) {
  return m.mat4.perspective(fov, aspectRatio, near, far, d.mat4x4f());
}

function invertMat(matrix: d.m4x4f) {
  return m.mat4.invert(matrix, d.mat4x4f());
}
