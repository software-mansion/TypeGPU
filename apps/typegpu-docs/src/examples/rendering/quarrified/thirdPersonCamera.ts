import * as m from 'wgpu-matrix';
import { d } from 'typegpu';

export interface MovementInput {
  forward: number;
  right: number;
  jump: boolean;
}

// TODO: review this
export function setupThirdPersonCamera(canvas: HTMLCanvasElement) {
  let yaw = 0;
  let targetYaw = 0;
  let pitch = 0.3;
  let targetPitch = 0.3;
  let distance = 8;

  const pressedKeys = new Set<string>();

  const onMouseDown = () => canvas.requestPointerLock();

  const onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    targetYaw -= e.movementX * 0.005;
    targetPitch += e.movementY * 0.005;
    targetPitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, targetPitch));
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    distance = Math.max(2, Math.min(20, distance * (1 + e.deltaY * 0.001)));
  };

  const onKeyDown = (e: KeyboardEvent) => pressedKeys.add(e.key.toLowerCase());
  const onKeyUp = (e: KeyboardEvent) => pressedKeys.delete(e.key.toLowerCase());

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const resizeObserver = new ResizeObserver(() => {});
  resizeObserver.observe(canvas);

  function getMovementInput(): MovementInput {
    if (document.pointerLockElement !== canvas) {
      return { forward: 0, right: 0, jump: false };
    }
    let forward = 0;
    let right = 0;
    if (pressedKeys.has('w')) forward += 1;
    if (pressedKeys.has('s')) forward -= 1;
    if (pressedKeys.has('a')) right -= 1;
    if (pressedKeys.has('d')) right += 1;
    return { forward, right, jump: pressedKeys.has(' ') };
  }

  function getYaw(): number {
    return yaw;
  }

  function updateCamera(playerPos: d.v3f): { view: d.m4x4f; projection: d.m4x4f } {
    const lerpFactor = 0.15;
    yaw += (targetYaw - yaw) * lerpFactor;
    pitch += (targetPitch - pitch) * lerpFactor;

    const camX = playerPos.x - Math.sin(yaw) * Math.cos(pitch) * distance;
    const camY = playerPos.y + 1.0 + Math.sin(pitch) * distance;
    const camZ = playerPos.z - Math.cos(yaw) * Math.cos(pitch) * distance;

    const view = m.mat4.lookAt(
      [camX, camY, camZ],
      [playerPos.x, playerPos.y + 1.0, playerPos.z],
      [0, 1, 0],
      d.mat4x4f(),
    );
    const projection = m.mat4.perspective(
      Math.PI / 4,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
      d.mat4x4f(),
    );

    return { view, projection };
  }

  function cleanup() {
    canvas.removeEventListener('mousedown', onMouseDown);
    canvas.removeEventListener('mousemove', onMouseMove);
    canvas.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    resizeObserver.unobserve(canvas);
  }

  return { getMovementInput, getYaw, updateCamera, cleanup };
}
