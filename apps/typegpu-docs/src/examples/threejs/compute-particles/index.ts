/*
 * Based on: https://github.com/mrdoob/three.js/blob/master/examples/webgpu_compute_particles.html
 */
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as t3 from '@typegpu/three';
import { d, std } from 'typegpu';
import { randf } from '@typegpu/noise';
import { defineControls } from '../../common/defineControls.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.setClearColor(0x000000);
await renderer.init();

const particleCount = 200000;
let isOrbitControlsActive = false;

const gravity = t3.uniform(-0.00098, d.f32);
const bounce = t3.uniform(0.8, d.f32);
const friction = t3.uniform(0.99, d.f32);
const size = t3.uniform(0.12, d.f32);
const clickPosition = t3.uniform(new THREE.Vector3(), d.vec3f);

const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
camera.position.set(0, 10, 20);

const scene = new THREE.Scene();

const positions = t3.instancedArray(particleCount, d.vec3f);
const velocities = t3.instancedArray(particleCount, d.vec3f);
const colors = t3.instancedArray(particleCount, d.vec3f);
const separation = 0.2;
const amount = Math.sqrt(particleCount);
const offset = amount / 2;

const computeInit = t3
  .toTSL(() => {
    'use gpu';
    const instanceIdx = t3.instanceIndex.$;
    const position = positions.$[instanceIdx];
    const color = colors.$[instanceIdx];

    const x = instanceIdx % d.u32(amount);
    const z = instanceIdx / amount;

    position.x = (offset - d.f32(x)) * separation;
    position.z = (offset - d.f32(z)) * separation;
    positions.$[instanceIdx] = d.vec3f(position);

    randf.seed(d.f32(instanceIdx / amount));
    color.x = randf.sample();
    color.y = randf.sample();
    colors.$[instanceIdx] = d.vec3f(color);
  })
  .compute(particleCount)
  .setName('Init Particles TypeGPU');
void renderer.compute(computeInit);

const computeAccessor = t3
  .toTSL(() => {
    'use gpu';
    const instanceIdx = t3.instanceIndex.$;
    let position = positions.$[instanceIdx];
    let velocity = velocities.$[instanceIdx];

    velocity.y += gravity.$;
    position += velocity;
    velocity *= friction.$;

    if (position.y < 0) {
      position.y = 0;
      velocity.y = -velocity.y * bounce.$;
      velocity *= d.vec3f(0.9, 1, 0.9);
    }

    positions.$[instanceIdx] = d.vec3f(position);
    velocities.$[instanceIdx] = d.vec3f(velocity);
  })
  .compute(particleCount)
  .setName('Update Particles TypeGPU');

const material = new THREE.SpriteNodeMaterial();
material.colorNode = t3.toTSL(() => {
  'use gpu';
  const iidx = t3.instanceIndex.$;
  return d.vec4f(t3.uv().$ * colors.$[iidx].xy, 0, 1);
});
material.positionNode = positions.node.toAttribute();
material.scaleNode = size.node;
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

const plane = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
scene.add(plane);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const computeHit = t3
  .toTSL(() => {
    'use gpu';
    const instanceIdx = t3.instanceIndex.$;
    const position = positions.$[instanceIdx];
    let velocity = velocities.$[instanceIdx];

    const dist = std.distance(position, clickPosition.$);
    const dir = std.normalize(position - clickPosition.$);
    const distArea = std.max(0, 3 - dist);

    const power = distArea * 0.01;
    randf.seed(d.f32(instanceIdx / amount));
    const relativePower = power * (1.5 * randf.sample() + 0.5);

    velocity += dir * relativePower;
    velocities.$[instanceIdx] = d.vec3f(velocity);
  })
  .compute(particleCount)
  .setName('Hit Particles TypeGPU');

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

    clickPosition.node.value.copy(point);
    clickPosition.node.value.y = -1;

    void renderer.compute(computeHit);
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

  void renderer.compute(computeAccessor);
  renderer.render(scene, camera);
};

void renderer.setAnimationLoop(animate);

// #region Example controls and cleanup
export const controls = defineControls({
  gravity: {
    initial: -0.00098,
    min: -0.00098,
    max: 0,
    step: 0.0001,
    onSliderChange: (value) => {
      gravity.node.value = value;
    },
  },
  bounce: {
    initial: 0.8,
    min: 0.1,
    max: 2,
    step: 0.02,
    onSliderChange: (value) => {
      bounce.node.value = value;
    },
  },
  friction: {
    initial: 0.99,
    min: 0.5,
    max: 0.99,
    step: 0.01,
    onSliderChange: (value) => {
      friction.node.value = value;
    },
  },
  size: {
    initial: 0.12,
    min: 0.05,
    max: 0.5,
    step: 0.01,
    onSliderChange: (value) => {
      size.node.value = value;
    },
  },
});

export function onCleanup() {
  renderer.dispose();
  resizeObserver.unobserve(canvas);
}
// #endregion
