import * as m from 'wgpu-matrix';
import { d, std } from 'typegpu';

export const Camera = d.struct({
  position: d.vec4f,
  targetPos: d.vec4f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
  viewInverse: d.mat4x4f,
  projectionInverse: d.mat4x4f,
});

export interface CameraOptions {
  initPos?: d.v3f;
  target?: d.v3f;
}

const cameraDefaults: Partial<CameraOptions> = {
  initPos: d.vec3f(0, 0, 0),
  target: d.vec3f(0, 1, 0),
};

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
  const options = { ...cameraDefaults, ...partialOptions } as Required<
    CameraOptions
  >;

  // orbit variables storing the current camera position
  const cameraState = {
    pos: options.initPos,
    yaw: 0,
    pitch: 0,
  };

  // initialize the camera
  targetCamera(cameraState.pos, cameraState.yaw, cameraState.pitch);

  function targetCamera(newPos: d.v3f, yaw: number, pitch: number) {
    const position = newPos;
    const target = position.add(d.vec3f(
      std.cos(pitch) * std.sin(yaw),
      std.sin(pitch),
      std.cos(pitch) * std.cos(yaw),
    ));

    const view = calculateView(position, target);
    const projection = calculateProj(canvas.clientWidth / canvas.clientHeight);

    callback(Camera({
      position: d.vec4f(position, 1),
      targetPos: d.vec4f(target, 1),
      view,
      projection,
      viewInverse: invertMat(view),
      projectionInverse: invertMat(projection),
    }));
  }

  function rotateCamera(dx: number, dy: number) {
    const orbitSensitivity = 0.005;
    cameraState.yaw += -dx * orbitSensitivity;
    cameraState.pitch -= dy * orbitSensitivity;
    cameraState.pitch = std.clamp(
      cameraState.pitch,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01,
    );

    targetCamera(cameraState.pos, cameraState.yaw, cameraState.pitch);
  }

  // resize observer
  const resizeObserver = new ResizeObserver(() => {
    targetCamera(cameraState.pos, cameraState.yaw, cameraState.pitch);
  });
  resizeObserver.observe(canvas);

  // Variables for interaction.
  const pressedKeys = new Set<string>();
  const moveSpeed = 0.1;

  // keyboard events
  window.addEventListener('keydown', (event) => {
    pressedKeys.add(event.key.toLowerCase());
  });

  window.addEventListener('keyup', (event) => {
    pressedKeys.delete(event.key.toLowerCase());
  });

  // mouse events
  canvas.addEventListener('mousedown', () => {
    canvas.requestPointerLock();
  });

  const mouseMoveEventListener = (event: MouseEvent) => {
    if (document.pointerLockElement !== canvas) {
      return;
    }
    const dx = event.movementX;
    const dy = event.movementY;
    rotateCamera(dx, dy);
  };
  window.addEventListener('mousemove', mouseMoveEventListener);

  function cleanupCamera() {
    window.removeEventListener('mousemove', mouseMoveEventListener);
    resizeObserver.unobserve(canvas);
  }

  // update position function
  const updatePosition = () => {
    if (document.pointerLockElement !== canvas) {
      return;
    }

    const forward = std.normalize(d.vec3f(
      std.sin(cameraState.yaw),
      0,
      std.cos(cameraState.yaw),
    )).mul(moveSpeed);
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

    targetCamera(cameraState.pos, cameraState.yaw, cameraState.pitch);
  };

  return { cleanupCamera, targetCamera, updatePosition };
}

function calculateView(position: d.v3f, target: d.v3f) {
  return m.mat4.lookAt(
    d.vec4f(position, 1),
    d.vec4f(target, 1),
    d.vec4f(0, 1, 0, 1),
    d.mat4x4f(),
  );
}

function calculateProj(aspectRatio: number) {
  return m.mat4.perspective(Math.PI / 4, aspectRatio, 0.1, 1000, d.mat4x4f());
}

function invertMat(matrix: d.m4x4f) {
  return m.mat4.invert(matrix, d.mat4x4f());
}
