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
  initPos?: d.v4f;
  target?: d.v4f;
}

const cameraDefaults: Partial<CameraOptions> = {
  initPos: d.vec4f(0, 0, 0, 1),
  target: d.vec4f(0, 1, 0, 1),
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

  function targetCamera(newPos: d.v4f, yaw: number, pitch: number) {
    const position = newPos;
    const target = position.add(d.vec4f(
      std.cos(pitch) * std.sin(yaw),
      std.sin(pitch),
      std.cos(pitch) * std.cos(yaw),
      0,
    ));

    const view = calculateView(position, target);
    const projection = calculateProj(canvas.clientWidth / canvas.clientHeight);

    callback(Camera({
      position: position,
      targetPos: target,
      view,
      projection,
      viewInverse: invertMat(view),
      projectionInverse: invertMat(projection),
    }));
  }

  function rotateCamera(dx: number, dy: number) {
    const orbitSensitivity = 0.005;
    cameraState.pos.y -= 0.01;
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

  // Variables for mouse/touch interaction.
  let isInsideWindow = false;
  let prevX = 0;
  let prevY = 0;

  // mouse/touch events
  canvas.addEventListener('mousedown', () => {
    isInsideWindow = true;
  });

  const mouseMoveEventListener = (event: MouseEvent) => {
    const dx = event.clientX - prevX;
    const dy = event.clientY - prevY;
    prevX = event.clientX;
    prevY = event.clientY;

    if (isInsideWindow) {
      rotateCamera(dx, dy);
    }
  };
  window.addEventListener('mousemove', mouseMoveEventListener);

  function cleanupCamera() {
    window.removeEventListener('mousemove', mouseMoveEventListener);
    resizeObserver.unobserve(canvas);
  }

  return { cleanupCamera, targetCamera };
}

function calculateView(position: d.v4f, target: d.v4f) {
  return m.mat4.lookAt(
    position,
    target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
}

function calculateProj(aspectRatio: number) {
  return m.mat4.perspective(Math.PI / 4, aspectRatio, 0.1, 1000, d.mat4x4f());
}

function invertMat(matrix: d.m4x4f) {
  return m.mat4.invert(matrix, d.mat4x4f());
}
