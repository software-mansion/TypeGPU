import * as m from 'wgpu-matrix';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { TgpuRoot } from 'typegpu';

export const Camera = d.struct({
  position: d.vec4f,
  targetPos: d.vec4f,
  view: d.mat4x4f,
  projection: d.mat4x4f,
});

interface CameraOptions {
  initPos: d.v4f;
  target: d.v4f;
  minZoom?: number;
  maxZoom?: number;
}

/**
 * Setups an orbit camera and returns a `cameraUniform` and a cleanup function.
 * On scroll events or canvas clicks/touches, updates the `cameraUniform`.
 */
export function setupOrbitCamera(
  root: TgpuRoot,
  canvas: HTMLCanvasElement,
  options: CameraOptions,
) {
  const camera = Camera({
    position: options.initPos,
    targetPos: options.target,
    view: m.mat4.lookAt(
      options.initPos,
      options.target,
      d.vec3f(0, 1, 0),
      d.mat4x4f(),
    ),
    projection: m.mat4.perspective(
      Math.PI / 4,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
      d.mat4x4f(),
    ),
  });
  const cameraUniform = root.createUniform(Camera, camera);

  const resizeObserver = new ResizeObserver(() => {
    camera.projection = m.mat4.perspective(
      Math.PI / 4,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
      d.mat4x4f(),
    );
  });
  resizeObserver.observe(canvas);

  // Variables for mouse interaction.
  let isDragging = false;
  let prevX = 0;
  let prevY = 0;
  let orbitRadius = std.length(options.initPos);

  // Yaw and pitch angles facing the origin.
  let orbitYaw = Math.atan2(options.initPos.x, options.initPos.z);
  let orbitPitch = Math.asin(options.initPos.y / orbitRadius);

  function updateCameraOrbit(dx: number, dy: number) {
    const orbitSensitivity = 0.005;
    orbitYaw += -dx * orbitSensitivity;
    orbitPitch += dy * orbitSensitivity;
    // Clamp pitch to avoid flipping
    const maxPitch = Math.PI / 2 - 0.01;
    if (orbitPitch > maxPitch) orbitPitch = maxPitch;
    if (orbitPitch < -maxPitch) orbitPitch = -maxPitch;
    // Convert spherical coordinates to cartesian coordinates
    const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
    const newCamY = orbitRadius * Math.sin(orbitPitch);
    const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
    const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);

    const newView = m.mat4.lookAt(
      newCameraPos,
      d.vec3f(0, 0, 0),
      d.vec3f(0, 1, 0),
      d.mat4x4f(),
    );
    cameraUniform.writePartial({ view: newView, position: newCameraPos });
  }

  canvas.addEventListener('wheel', (event: WheelEvent) => {
    event.preventDefault();
    const zoomSensitivity = 0.05;
    orbitRadius = std.clamp(
      orbitRadius + event.deltaY * zoomSensitivity,
      3,
      100,
    );
    const newCamX = orbitRadius * Math.sin(orbitYaw) * Math.cos(orbitPitch);
    const newCamY = orbitRadius * Math.sin(orbitPitch);
    const newCamZ = orbitRadius * Math.cos(orbitYaw) * Math.cos(orbitPitch);
    const newCameraPos = d.vec4f(newCamX, newCamY, newCamZ, 1);
    const newView = m.mat4.lookAt(
      newCameraPos,
      d.vec3f(0, 0, 0),
      d.vec3f(0, 1, 0),
      d.mat4x4f(),
    );
    cameraUniform.writePartial({ view: newView, position: newCameraPos });
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
    cameraUniform,
    cameraCleanup,
  };
}
