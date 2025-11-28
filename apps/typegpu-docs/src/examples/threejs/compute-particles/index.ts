/*
 * Based on: https://github.com/mrdoob/three.js/blob/master/examples/webgpu_compute_particles.html
 */
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fromTSL, toTSL, uv } from '@typegpu/three';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { randf } from '@typegpu/noise';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.setClearColor(0X000000);
await renderer.init();

const particleCount = 200000;
let isOrbitControlsActive = false;

const gravity = TSL.uniform(-0.00098);
const bounce = TSL.uniform(0.8);
const friction = TSL.uniform(0.99);
const size = TSL.uniform(0.12);
const clickPosition = TSL.uniform(new THREE.Vector3());
const gravityUniform = fromTSL(gravity, { type: d.f32 });
const bounceUniform = fromTSL(bounce, { type: d.f32 });
const frictionUniform = fromTSL(friction, { type: d.f32 });
const clickPositionUniform = fromTSL(clickPosition, { type: d.vec3f });

const camera = new THREE.PerspectiveCamera(
  50,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  1000,
);
camera.position.set(0, 10, 20);

const scene = new THREE.Scene();

const positions = TSL.instancedArray(particleCount, 'vec3');
const velocities = TSL.instancedArray(particleCount, 'vec3');
const colors = TSL.instancedArray(particleCount, 'vec3');
const separation = 0.2;
const amount = Math.sqrt(particleCount);
const offset = amount / 2;

const instanceIndex = fromTSL(TSL.instanceIndex, { type: d.u32 });
const positionsBuffer = fromTSL(positions, { type: d.arrayOf(d.vec3f) });
const colorsBuffer = fromTSL(colors, { type: d.arrayOf(d.vec3f) });

const computeInit = toTSL(() => {
  'use gpu';
  const instanceIdx = instanceIndex.$;
  const position = positionsBuffer.$[instanceIdx];
  const color = colorsBuffer.$[instanceIdx];

  const x = instanceIdx % d.u32(amount);
  const z = instanceIdx / amount;

  position.x = (offset - d.f32(x)) * separation;
  position.z = (offset - d.f32(z)) * separation;
  positionsBuffer.$[instanceIdx] = d.vec3f(position);

  randf.seed(d.f32(instanceIdx / amount));
  color.x = randf.sample();
  randf.seed(d.f32(instanceIdx / amount) + 2);
  color.y = randf.sample();
  colorsBuffer.$[instanceIdx] = d.vec3f(color);
}).compute(particleCount).setName('Init Particles TypeGPU');
renderer.compute(computeInit);

const velocitiesBuffer = fromTSL(velocities, { type: d.arrayOf(d.vec3f) });
const computeParticles = toTSL(() => {
  'use gpu';
  const instanceIdx = instanceIndex.$;
  let position = positionsBuffer.$[instanceIdx];
  let velocity = velocitiesBuffer.$[instanceIdx];

  velocity = velocity.add(d.vec3f(0, gravityUniform.$, 0));
  position = position.add(velocity);
  velocity = velocity.mul(frictionUniform.$);

  if (position.y < 0) {
    position.y = 0;
    velocity.y = -velocity.y * bounceUniform.$;
    velocity = velocity.mul(d.vec3f(0.9, 1, 0.9));
  }

  positionsBuffer.$[instanceIdx] = d.vec3f(position);
  velocitiesBuffer.$[instanceIdx] = d.vec3f(velocity);
}).compute(particleCount).setName('Update Particles TypeGPU');

const material = new THREE.SpriteNodeMaterial();
material.colorNode = toTSL(() => {
  'use gpu';
  return d.vec4f(uv().$.mul(colorsBuffer.$[instanceIndex.$].xy), 0, 1);
});
material.positionNode = positions.toAttribute();
material.scaleNode = size;
material.opacityNode = TSL.shapeCircle();
material.alphaToCoverage = true;
material.transparent = true;

const particles = new THREE.Sprite(material);
particles.count = particleCount;
particles.frustumCulled = false;
scene.add(particles);

const helper = new THREE.GridHelper(90, 45, 0x303030, 0x303030);
scene.add(helper);

const geometry = new THREE.PlaneGeometry(200, 200);
geometry.rotateX(-Math.PI / 2);

const plane = new THREE.Mesh(
  geometry,
  new THREE.MeshBasicMaterial({ visible: false }),
);
scene.add(plane);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const computeHit = toTSL(() => {
  'use gpu';
  const instanceIdx = instanceIndex.$;
  const position = positionsBuffer.$[instanceIdx];
  let velocity = velocitiesBuffer.$[instanceIdx];

  const dist = std.distance(position, clickPositionUniform.$);
  const dir = std.normalize(position.sub(clickPositionUniform.$));
  const distArea = std.max(0, 3 - dist);

  const power = distArea * 0.01;
  randf.seed(d.f32(instanceIdx / amount));
  const relativePower = power * (1.5 * randf.sample() + 0.5);

  velocity = velocity.add(dir.mul(relativePower));
  velocitiesBuffer.$[instanceIdx] = d.vec3f(velocity);
}).compute(particleCount).setName('Hit Particles TypeGPU');

function onMove(event: PointerEvent) {
  if (isOrbitControlsActive) return;

  const rect = canvas.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );

  raycaster.setFromCamera(pointer, camera);

  const intersects = raycaster.intersectObject(plane, false);

  if (intersects.length > 0) {
    const { point } = intersects[0];

    clickPosition.value.copy(point);
    clickPosition.value.y = -1;

    renderer.compute(computeHit);
  }
}

canvas.addEventListener('pointermove', onMove);

const cameraControls = new OrbitControls(camera, canvas);
cameraControls.enableDamping = true;
cameraControls.minDistance = 5;
cameraControls.maxDistance = 200;
cameraControls.target.set(0, -8, 0);
cameraControls.update();

cameraControls.addEventListener('start', () => {
  isOrbitControlsActive = true;
});
cameraControls.addEventListener('end', () => {
  isOrbitControlsActive = false;
});

cameraControls.touches = {
  ONE: null,
  TWO: THREE.TOUCH.DOLLY_PAN,
};

const resizeObserver = new ResizeObserver(() => {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
});
resizeObserver.observe(canvas);

const animate = () => {
  cameraControls.update();

  renderer.compute(computeParticles);
  renderer.render(scene, camera);
};

renderer.setAnimationLoop(animate);

// #region Example controls and cleanup
export const controls = {
  'gravity': {
    initial: -0.00098,
    min: -0.00098,
    max: 0,
    step: 0.0001,
    onSliderChange: (value: number) => {
      gravity.value = value;
    },
  },
  'bounce': {
    initial: 0.8,
    min: 0.1,
    max: 2,
    step: 0.02,
    onSliderChange: (value: number) => {
      bounce.value = value;
    },
  },
  'friction': {
    initial: 0.99,
    min: 0.5,
    max: 0.99,
    step: 0.01,
    onSliderChange: (value: number) => {
      friction.value = value;
    },
  },
  'size': {
    initial: 0.12,
    min: 0.05,
    max: 0.5,
    step: 0.01,
    onSliderChange: (value: number) => {
      size.value = value;
    },
  },
};

export function onCleanup() {
  renderer.dispose();
  resizeObserver.unobserve(canvas);
}
// #endregion
