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
  target: d.v4f;
  minZoom?: number;
  maxZoom?: number;
  // orbitSensitivity AAA put it here, add default values for everything
}

const cameraDefaults: Partial<CameraOptions> = {
  target: d.vec4f(0, 0, 0, 1),
  minZoom: 1,
  maxZoom: 100,
};

/**
 * Sets up an orbit camera and returns a cleanup function.
 * Calls the callback on scroll events, canvas clicks/touches and resizes.
 * Also, calls the callback during the setup with an initial camera.
 */
export function setupOrbitCamera(
  callback: (updatedProps: Partial<d.Infer<typeof Camera>>) => void,
  canvas: HTMLCanvasElement,
  partialOptions: CameraOptions,
) {
  const options = { ...cameraDefaults, ...partialOptions } as Required<
    CameraOptions
  >;

  callback(Camera({
    position: options.initPos,
    targetPos: options.target,
    view: recalculateCameraView(options.initPos, options.target),
    projection: recalculateCameraProjection(
      canvas.clientWidth / canvas.clientHeight,
    ),
  }));

  const resizeObserver = new ResizeObserver(() => {
    const projection = recalculateCameraProjection(
      canvas.clientWidth / canvas.clientHeight,
    );
    callback({ projection });
  });
  resizeObserver.observe(canvas);

  const initialVec = options.initPos.sub(options.target);

  // Variables for mouse/touch interaction.
  let isDragging = false;
  let prevX = 0;
  let prevY = 0;
  let orbitRadius = std.length(initialVec);

  // Yaw and pitch angles facing the origin.
  let orbitYaw = Math.atan2(initialVec.x, initialVec.z);
  let orbitPitch = Math.asin(initialVec.y / orbitRadius);

  function updateCameraOrbit(dx: number, dy: number) {
    const orbitSensitivity = 0.005;
    orbitYaw += -dx * orbitSensitivity;
    orbitPitch += dy * orbitSensitivity;
    // Clamp pitch to avoid flipping
    orbitPitch = std.clamp(orbitPitch, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);

    const newCameraPos = recalculateCameraPosition(
      options.target,
      orbitRadius,
      orbitPitch,
      orbitYaw,
    );
    const newView = recalculateCameraView(newCameraPos, options.target);

    callback({ view: newView, position: newCameraPos });
  }

  canvas.addEventListener('wheel', (event: WheelEvent) => {
    event.preventDefault();
    const zoomSensitivity = 0.05;
    orbitRadius = std.clamp(
      orbitRadius + event.deltaY * zoomSensitivity,
      3,
      100,
    );
    const newPos = recalculateCameraPosition(
      options.target,
      orbitRadius,
      orbitPitch,
      orbitYaw,
    );
    const newView = recalculateCameraView(newPos, options.target);
    callback({ view: newView, position: newPos });
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
      updateCameraOrbit(dx, dy);
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

      updateCameraOrbit(dx, dy);
    }
  };
  window.addEventListener('touchmove', touchMoveEventListener, {
    passive: false,
  });

  const cameraCleanup = () => {
    window.removeEventListener('mouseup', mouseUpEventListener);
    window.removeEventListener('mousemove', mouseMoveEventListener);
    window.removeEventListener('touchmove', touchMoveEventListener);
    window.removeEventListener('touchend', touchEndEventListener);
    resizeObserver.unobserve(canvas);
  };

  return {
    cameraCleanup,
  };
}

function recalculateCameraPosition(
  target: d.v4f,
  radius: number,
  pitch: number,
  yaw: number,
) {
  const newX = radius * Math.sin(yaw) * Math.cos(pitch);
  const newY = radius * Math.sin(pitch);
  const newZ = radius * Math.cos(yaw) * Math.cos(pitch);
  const displacement = d.vec4f(newX, newY, newZ, 1);
  return target.add(displacement);
}

function recalculateCameraView(position: d.v4f, target: d.v4f) {
  return m.mat4.lookAt(
    position,
    target,
    d.vec3f(0, 1, 0),
    d.mat4x4f(),
  );
}

function recalculateCameraProjection(aspectRatio: number) {
  return m.mat4.perspective(Math.PI / 4, aspectRatio, 0.1, 1000, d.mat4x4f());
}
