import { tgpu } from 'typegpu';
import { mat4, vec2, vec3, type Vec2, type Vec3 } from 'math';
import { perlin2d } from 'math/noise';
import { createBirds } from './birds.ts';
import { createCamera } from './camera.ts';
import { createParticles } from './particles.ts';
import { createSonar } from './sonar.ts';
import { createRenderer } from './render.ts';
import { createRig } from './rig.ts';
import { createTerrain } from './terrain.ts';
import { createTrees } from './trees.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

// #region Scene

const terrain = createTerrain(root);
terrain.follow(0, 0);
const trees = createTrees(root, terrain);

const camera = createCamera(canvas, terrain, [0, terrain.heightAt(0, 0) + 8, 0]);
const particles = createParticles(root, terrain);
const sonar = createSonar();
const rig = createRig(terrain, (strength, at) => {
  camera.stomp(strength, at);
  particles.burst(at, strength);
});
const birds = createBirds(root, terrain, [60, rig.headPosition[1] + 20, 0]);
const renderer = createRenderer(
  root,
  context,
  canvas,
  terrain,
  trees,
  birds,
  particles,
  rig.partsByShape,
);

// #endregion

// #region Input

const keys = new Set<string>();
let pingRequested = false;
let autopilot = true;
let destination: Vec3 | undefined;

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

function onKeyDown(event: KeyboardEvent) {
  if (isTyping(event.target)) {
    return;
  }
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    event.preventDefault();
    autopilot = false;
    destination = undefined;
  }
  if (key === ' ') {
    event.preventDefault();
    pingRequested = true;
  }
  keys.add(key);
}
const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
const onBlur = () => keys.clear();
window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('blur', onBlur);

let drag: { id: number; x: number; y: number; moved: number } | undefined;
canvas.addEventListener('pointerdown', (event) => {
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 };
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
  if (drag?.id !== event.pointerId) {
    return;
  }
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  drag.x = event.clientX;
  drag.y = event.clientY;
  camera.rotate(dx, dy);
});
canvas.addEventListener('pointerup', (event) => {
  // A tap (as opposed to a drag) sends the walker to that spot.
  if (drag?.id === event.pointerId && drag.moved < 6) {
    const hit = camera.pick(event.clientX, event.clientY);
    if (hit) {
      destination = hit;
      autopilot = false;
    }
  }
  drag = undefined;
});
canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    camera.zoomBy(event.deltaY);
  },
  { passive: false },
);

const wander = perlin2d.create(99);
const AUTO_PING_INTERVAL = 6;
let lastAutoPing = -AUTO_PING_INTERVAL + 2;
const direction: Vec2 = [0, 0];

function steer(time: number): { direction: Vec2; run: boolean } {
  vec2.zero(direction);
  if (autopilot) {
    const { goal } = sonar;
    if (goal.active && goal.revealed) {
      // Head for the goal once a pulse has found it, sprinting while it's still far away.
      vec2.set(direction, goal.position[0] - rig.position[0], goal.position[2] - rig.position[2]);
      const distance = vec2.length(direction);
      vec2.scale(direction, direction, 1 / Math.max(distance, 0.001));
      return { direction, run: distance > 40 };
    }
    // Otherwise meander along a noise-driven heading, pinging every so often.
    if (time - lastAutoPing > AUTO_PING_INTERVAL) {
      lastAutoPing = time;
      pingRequested = true;
    }
    const angle = perlin2d.sample(wander, time * 0.04, 0.5) * Math.PI * 2.5;
    vec2.set(direction, Math.sin(angle), Math.cos(angle));
    return { direction, run: false };
  }
  if (destination) {
    vec2.set(direction, destination[0] - rig.position[0], destination[2] - rig.position[2]);
    const distance = vec2.length(direction);
    if (distance < 2.5) {
      destination = undefined;
      vec2.zero(direction);
    } else {
      vec2.scale(direction, direction, Math.min(1, distance / 6) / distance);
    }
    return { direction, run: distance > 30 };
  }
  const forward =
    +(keys.has('w') || keys.has('arrowup')) - +(keys.has('s') || keys.has('arrowdown'));
  const right =
    +(keys.has('d') || keys.has('arrowright')) - +(keys.has('a') || keys.has('arrowleft'));
  camera.toWorld(direction, right, forward);
  if (vec2.length(direction) > 1) {
    vec2.normalize(direction, direction);
  }
  return { direction, run: keys.has('shift') };
}

// #endregion

// #region Frame

let sunAzimuth = 0.6;
let boilRate = 4;
let wobble = 1;
let hatching = true;

const sun = vec3.create();
const lightView = mat4.create();
const lightProjection = mat4.create();
const lightViewProj = mat4.create();
const lightSpaceFocus = vec3.create();

/** A sun-aligned orthographic frustum around `focus`, snapped to whole shadow-map texels. */
function updateLight(focus: Vec3) {
  vec3.normalize(sun, [Math.sin(sunAzimuth), 0.75, Math.cos(sunAzimuth)]);
  mat4.lookAt(lightView, sun, [0, 0, 0], [0, 1, 0]);
  vec3.transformMat4(lightSpaceFocus, focus, lightView);
  const extent = renderer.shadowExtent;
  const texel = (extent * 2) / renderer.shadowMapSize;
  const x = Math.round(lightSpaceFocus[0] / texel) * texel;
  const y = Math.round(lightSpaceFocus[1] / texel) * texel;
  const z = -lightSpaceFocus[2];
  mat4.orthoZO(lightProjection, x - extent, x + extent, y - extent, y + extent, z - 150, z + 150);
  mat4.multiply(lightViewProj, lightProjection, lightView);
}

const FLOCK_LOOP = 30; // seconds for one full figure-eight
const flockGoal = vec3.create();

/**
 * The flock chases a point that traces a figure-eight around the walker's head. The figure
 * crosses itself right in front of the visor, so the birds sweep past twice every loop.
 */
function updateFlockGoal(time: number) {
  const angle = (time / FLOCK_LOOP) * Math.PI * 2;
  const x = Math.sin(angle) * 70;
  const z = Math.sin(angle) * Math.cos(angle) * 45;
  const heading = rig.heading;
  // Rotate the figure to follow the walker's heading, and pass a little in front of it.
  flockGoal[0] = rig.headPosition[0] + x * Math.cos(heading) + (z + 5) * Math.sin(heading);
  flockGoal[2] = rig.headPosition[2] - x * Math.sin(heading) + (z + 5) * Math.cos(heading);
  flockGoal[1] = rig.headPosition[1] + 1.5 + Math.sin(angle * 3) * 3;
}

let lastTime = performance.now();
let elapsed = 0;

function frame(now: number) {
  const dt = Math.min((now - lastTime) / 1000, 1 / 20);
  lastTime = now;
  elapsed += dt;

  rig.update(dt, steer(elapsed));
  rig.setMarker(destination);
  terrain.follow(rig.position[0], rig.position[2]);

  if (autopilot) {
    // Show off the walker from a three-quarter front view.
    camera.follow(dt, rig.heading, 0.9);
  }
  camera.update(dt, rig.chestPosition);
  updateLight(rig.position);
  trees.update(camera.eye[0], camera.eye[1], camera.eye[2]);
  updateFlockGoal(elapsed);
  birds.update(dt, flockGoal, rig.colliders, camera.eye, rig.chestPosition);
  particles.update(dt, elapsed);

  if (pingRequested) {
    sonar.ping(rig.antennaTip, elapsed);
    pingRequested = false;
  }
  sonar.update(elapsed, dt, rig.position, rig.antennaTip);
  rig.setBeaconGlow(sonar.flashing);
  rig.setGoal(sonar.goal.active ? sonar.goal.position : undefined, sonar.goal.orb, sonar.pillar[3]);

  renderer.frame.write({
    viewProj: camera.viewProj,
    view: camera.view,
    invViewProj: camera.invViewProj,
    lightViewProj,
    cameraPosition: camera.eye,
    time: elapsed,
    sunDirection: sun,
    walker: rig.position,
    // Lines re-draw themselves in discrete jumps rather than continuously.
    sketchStep: Math.floor(elapsed * boilRate),
    resolution: [canvas.width, canvas.height],
    wobble,
    hatching: hatching ? 1 : 0,
    pixelRatio: Math.max(1, canvas.width / canvas.clientWidth),
    pulses: sonar.pulses,
    pillar: sonar.pillar,
    flash: sonar.flash,
  });
  renderer.render();

  frameId = requestAnimationFrame(frame);
}

let frameId = requestAnimationFrame(frame);

const resizeObserver = new ResizeObserver(() => renderer.resize());
resizeObserver.observe(canvas);

// #endregion

// #region Example controls and cleanup

export const controls = defineControls({
  'Sonar ping': {
    onButtonClick() {
      pingRequested = true;
    },
  },
  Autopilot: {
    initial: autopilot,
    onToggleChange(value) {
      autopilot = value;
      destination = undefined;
    },
  },
  'Sun direction': {
    initial: sunAzimuth,
    min: -Math.PI,
    max: Math.PI,
    step: 0.01,
    onSliderChange(value) {
      sunAzimuth = value;
    },
  },
  'Sketch boil (fps)': {
    initial: boilRate,
    min: 0,
    max: 12,
    step: 1,
    onSliderChange(value) {
      boilRate = value;
    },
  },
  'Line wobble': {
    initial: wobble,
    min: 0,
    max: 3,
    step: 0.1,
    onSliderChange(value) {
      wobble = value;
    },
  },
  Hatching: {
    initial: hatching,
    onToggleChange(value) {
      hatching = value;
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  resizeObserver.disconnect();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  root.destroy();
}

// #endregion
