/*
 * Based on: https://github.com/mrdoob/three.js/blob/master/examples/webgpu_compute_particles.html
 */

import * as THREE from 'three/webgpu';
import {
  float,
  Fn,
  hash,
  If,
  instancedArray,
  instanceIndex,
  shapeCircle,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.setClearColor(0X000000);
await renderer.init();

const particleCount = 200000;
const gravity = uniform(-.00098);
const bounce = uniform(.8);
const friction = uniform(.99);
const size = uniform(.12);
const clickPosition = uniform(new THREE.Vector3());
let isOrbitControlsActive = false;

const camera = new THREE.PerspectiveCamera(
  50,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  1000,
);
camera.position.set(0, 5, 20);

const scene = new THREE.Scene();

const positions = instancedArray(particleCount, 'vec3');
const velocities = instancedArray(particleCount, 'vec3');
const colors = instancedArray(particleCount, 'vec3');
const separation = 0.2;
const amount = Math.sqrt(particleCount);
const offset = float(amount / 2);

const computeInit = Fn(() => {
  const position = positions.element(instanceIndex);
  const color = colors.element(instanceIndex);

  const x = instanceIndex.mod(amount);
  const z = instanceIndex.div(amount);

  position.x = offset.sub(x).mul(separation);
  position.z = offset.sub(z).mul(separation);

  color.x = hash(instanceIndex);
  color.y = hash(instanceIndex.add(2));
})().compute(particleCount).setName('Init Particles');
renderer.compute(computeInit);

const computeUpdate = Fn(() => {
  const position = positions.element(instanceIndex);
  const velocity = velocities.element(instanceIndex);

  velocity.addAssign(vec3(0.00, gravity, 0.00));
  position.addAssign(velocity);

  velocity.mulAssign(friction);

  If(position.y.lessThan(0), () => {
    position.y.assign(0);
    velocity.y = velocity.y.negate().mul(bounce);

    velocity.x = velocity.x.mul(.9);
    velocity.z = velocity.z.mul(.9);
  });
});

const computeParticles = computeUpdate().compute(particleCount).setName(
  'Update Particles',
);

const material = new THREE.SpriteNodeMaterial();
material.colorNode = uv().mul(colors.element(instanceIndex));
material.positionNode = positions.toAttribute();
material.scaleNode = size;
material.opacityNode = shapeCircle();
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

const computeHit = Fn(() => {
  const position = positions.element(instanceIndex);
  const velocity = velocities.element(instanceIndex);

  const dist = position.distance(clickPosition);
  const direction = position.sub(clickPosition).normalize();
  const distArea = float(3).sub(dist).max(0);

  const power = distArea.mul(.01);
  const relativePower = power.mul(hash(instanceIndex).mul(1.5).add(.5));

  velocity.assign(velocity.add(direction.mul(relativePower)));
})().compute(particleCount).setName('Hit Particles');

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

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 5;
controls.maxDistance = 200;
controls.target.set(0, -8, 0);
controls.update();

controls.addEventListener('start', () => {
  isOrbitControlsActive = true;
});
controls.addEventListener('end', () => {
  isOrbitControlsActive = false;
});

controls.touches = {
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
  controls.update();

  renderer.compute(computeParticles);
  renderer.render(scene, camera);
};

renderer.setAnimationLoop(animate);

export function onCleanup() {
  resizeObserver.unobserve(canvas);
  renderer.dispose();
}
