import * as m from 'wgpu-matrix';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const Camera = d.struct({
  position: d.vec4f,
  targetPos: d.vec4f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

export interface CameraOptions {
  initPos: d.v4f;
  target?: d.v4f;
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

/**
 * Sets up an orbit camera.
 * Calls the callback on scroll events, canvas clicks/touches and resizes.
 * Also, calls the callback during the setup with an initial camera.
 */
export function setupOrbitCamera(
  canvas: HTMLCanvasElement,
  partialOptions: CameraOptions,
  callback: (updatedProps: Partial<d.Infer<typeof Camera>>) => void,
) {
  const options = { ...cameraDefaults, ...partialOptions } as Required<
    CameraOptions
  >;

  // orbit variables storing the current camera position
  const cameraState = {
    target: d.vec4f(),
    radius: 0,
    pitch: 0,
    yaw: 0,
  };

  // initialize the camera
  targetCamera(options.initPos, options.target);

  function targetCamera(newPos: d.v4f, newTarget?: d.v4f) {
    const tgt = newTarget ?? cameraState.target;
    const cameraVector = newPos.sub(tgt);
    cameraState.radius = std.length(cameraVector);
    cameraState.yaw = Math.atan2(cameraVector.x, cameraVector.z);
    cameraState.pitch = Math.asin(cameraVector.y / cameraState.radius);
    cameraState.target = tgt;

    callback(Camera({
      position: newPos,
      targetPos: cameraState.target,
      view: calculateView(newPos, cameraState.target),
      projection: calculateProj(canvas.clientWidth / canvas.clientHeight),
    }));
  }

  function rotateCamera(dx: number, dy: number) {
    const orbitSensitivity = 0.005;
    cameraState.yaw += -dx * orbitSensitivity * (options.invertCamera ? -1 : 1);
    cameraState.pitch += dy * orbitSensitivity *
      (options.invertCamera ? -1 : 1);
    cameraState.pitch = std.clamp(
      cameraState.pitch,
      -Math.PI / 2 + 0.01,
      Math.PI / 2 - 0.01,
    );

    const newCameraPos = calculatePos(
      cameraState.target,
      cameraState.radius,
      cameraState.pitch,
      cameraState.yaw,
    );

    callback({
      view: calculateView(newCameraPos, cameraState.target),
      position: newCameraPos,
    });
  }

  function zoomCamera(delta: number) {
    cameraState.radius += delta * 0.05;
    cameraState.radius = std.clamp(
      cameraState.radius,
      options.minZoom,
      options.maxZoom,
    );

    const newPos = calculatePos(
      cameraState.target,
      cameraState.radius,
      cameraState.pitch,
      cameraState.yaw,
    );
    const newView = calculateView(newPos, cameraState.target);

    callback({ view: newView, position: newPos });
  }

  // resize observer
  const resizeObserver = new ResizeObserver(() => {
    const projection = calculateProj(canvas.clientWidth / canvas.clientHeight);
    callback({ projection });
  });
  resizeObserver.observe(canvas);

  // Variables for mouse/touch interaction.
  let isDragging = false;
  let prevX = 0;
  let prevY = 0;

  // mouse/touch events
  canvas.addEventListener('wheel', (event: WheelEvent) => {
    event.preventDefault();
    zoomCamera(event.deltaY);
  }, { passive: false });

  canvas.addEventListener('mousedown', (event) => {
    isDragging = true;
    prevX = event.clientX;
    prevY = event.clientY;
  });

  canvas.addEventListener('touchstart', (event) => {
    event.preventDefault();
    if (event.touches.length === 1) {
      isDragging = true;
      prevX = event.touches[0].clientX;
      prevY = event.touches[0].clientY;
    }
  }, { passive: false });

  const mouseUpEventListener = () => {
    isDragging = false;
  };
  window.addEventListener('mouseup', mouseUpEventListener);

  const touchEndEventListener = () => {
    isDragging = false;
  };
  window.addEventListener('touchend', touchEndEventListener);

  const mouseMoveEventListener = (event: MouseEvent) => {
    const dx = event.clientX - prevX;
    const dy = event.clientY - prevY;
    prevX = event.clientX;
    prevY = event.clientY;

    if (isDragging) {
      rotateCamera(dx, dy);
    }
  };
  window.addEventListener('mousemove', mouseMoveEventListener);

  const touchMoveEventListener = (event: TouchEvent) => {
    if (isDragging && event.touches.length === 1) {
      event.preventDefault();
      const dx = event.touches[0].clientX - prevX;
      const dy = event.touches[0].clientY - prevY;
      prevX = event.touches[0].clientX;
      prevY = event.touches[0].clientY;

      rotateCamera(dx, dy);
    }
  };
  window.addEventListener('touchmove', touchMoveEventListener, {
    passive: false,
  });

  function cleanupCamera() {
    window.removeEventListener('mouseup', mouseUpEventListener);
    window.removeEventListener('mousemove', mouseMoveEventListener);
    window.removeEventListener('touchmove', touchMoveEventListener);
    window.removeEventListener('touchend', touchEndEventListener);
    resizeObserver.unobserve(canvas);
  }

  return { cleanupCamera, targetCamera };
}

function calculatePos(
  target: d.v4f,
  radius: number,
  pitch: number,
  yaw: number,
) {
  const newX = radius * Math.sin(yaw) * Math.cos(pitch);
  const newY = radius * Math.sin(pitch);
  const newZ = radius * Math.cos(yaw) * Math.cos(pitch);
  const displacement = d.vec4f(newX, newY, newZ, 0);
  return target.add(displacement);
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
