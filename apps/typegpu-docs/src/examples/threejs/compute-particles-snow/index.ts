/*
 * Based on: https://github.com/mrdoob/three.js/blob/master/examples/webgpu_compute_particles_snow.html
 */
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { TeapotGeometry } from 'three/addons/geometries/TeapotGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fromTSL, toTSL } from '@typegpu/three';
import * as d from 'typegpu/data';
import * as o from './sceneObjects.ts';
import { randf } from '@typegpu/noise';

const maxParticleCount = 100000;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setClearColor(0x000000);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const camera = new THREE.PerspectiveCamera(
  60,
  canvas.clientWidth / canvas.clientHeight,
  .1,
  1000,
);
camera.position.set(40, 20, 40);
camera.lookAt(0, 0, 0);
camera.layers.enable(2);

const scene = new THREE.Scene();

const positionBuffer = TSL.instancedArray(maxParticleCount, 'vec3');
const scaleBuffer = TSL.instancedArray(maxParticleCount, 'vec3');
const staticPositionBuffer = TSL.instancedArray(maxParticleCount, 'vec3');
const dataBuffer = TSL.instancedArray(maxParticleCount, 'vec4');

const positionBufferAccessor = fromTSL(positionBuffer, {
  type: d.arrayOf(d.vec3f),
});
const scaleBufferAccessor = fromTSL(scaleBuffer, { type: d.arrayOf(d.vec3f) });
const staticPositionAccessor = fromTSL(staticPositionBuffer, {
  type: d.arrayOf(d.vec3f),
});
const dataBufferAccessor = fromTSL(dataBuffer, { type: d.arrayOf(d.vec4f) });
const instanceIndexAccessor = fromTSL(TSL.instanceIndex, { type: d.u32 });

const computeInit = toTSL(() => {
  'use gpu';
  const instanceIdx = instanceIndexAccessor.$;

  randf.seed(instanceIdx / maxParticleCount);
  const rand = d.vec3f(randf.sample(), randf.sampleExclusive(), randf.sample());
  const randPos = rand.mul(d.vec3f(100, 500, 100))
    .add(d.vec3f(-50, 3, -50));
  positionBufferAccessor.$[instanceIdx] = d.vec3f(randPos);

  scaleBufferAccessor.$[instanceIdx] = d.vec3f(randf.sample() * 0.8 + 0.2);

  staticPositionAccessor.$[instanceIdx] = d.vec3f(1000, 10000, 1000);

  dataBufferAccessor.$[instanceIdx] = d.vec4f(
    randPos.x,
    -0.05,
    randPos.z,
    rand.x,
  );
}).compute(maxParticleCount).setName('Init Partciles');

const collisionCamera = new THREE.OrthographicCamera(
  -50,
  50,
  50,
  -50,
  .1,
  1000,
);
collisionCamera.position.y = 50;
collisionCamera.lookAt(0, 0, 0);
collisionCamera.up.set(0, 0, 1); // probably doesn't matter
collisionCamera.layers.enable(1);

const collisionPosRT = new THREE.RenderTarget(2048, 2048, {
  type: THREE.FloatType,
  minFilter: THREE.NearestFilter,
  magFilter: THREE.NearestFilter,
  colorSpace: THREE.NoColorSpace,
  generateMipmaps: false,
});

const collisionPosMaterial = new THREE.MeshBasicNodeMaterial();
collisionPosMaterial.fog = false;
collisionPosMaterial.toneMapped = false;
// collisionPosMaterial.colorNode = TSL.C;

const computeUpdate = TSL.Fn(() => {
  const position = positionBuffer.element(TSL.instanceIndex);

  const terrainHeight = TSL.texture(
    collisionPosRT.texture,
    position.xz.add(50).div(100),
  ).y;

  position.y.assign(terrainHeight);
})().compute(maxParticleCount).setName('Update Particles');

const ambientLight = new THREE.AmbientLight(0xffffff, 5);
scene.add(ambientLight);

const floorGeometry = new THREE.PlaneGeometry(100, 100);
floorGeometry.rotateX(-Math.PI / 2);
const plane = new THREE.Mesh(
  floorGeometry,
  new THREE.MeshStandardMaterial({
    color: 0xff0000,
    roughness: .5,
    metalness: 0,
    transparent: false,
  }),
);
plane.position.y = -2;
plane.layers.enable(1);
plane.layers.enable(2);

scene.add(plane);

const coneMaterial = new THREE.MeshStandardNodeMaterial({
  color: 0x00ff00,
  roughness: .6,
  metalness: 0,
});
const cylinderGeometry = new THREE.CylinderGeometry(5, 5, 10, 32);
const cylinder = new THREE.Mesh(cylinderGeometry, coneMaterial);
cylinder.position.y = 0;
cylinder.layers.enable(1);
cylinder.layers.enable(2);

scene.add(cylinder);

const surfaceOffset = 0.2;
const sphereGeometry = new THREE.SphereGeometry(surfaceOffset, 5, 5);
function particle() {
  const posBuffer = positionBuffer;

  const material = new THREE.MeshStandardNodeMaterial({
    color: 0xeeeeee,
    roughness: .9,
    metalness: 0,
  });

  material.positionNode = TSL.positionLocal.add(
    posBuffer.element(TSL.instanceIndex),
  );

  const rainParticles = new THREE.InstancedMesh(
    sphereGeometry,
    material,
    maxParticleCount,
  );

  rainParticles.layers.disableAll();
  rainParticles.layers.enable(2);

  return rainParticles;
}

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 10, 0);
controls.minDistance = 1;
controls.maxDistance = 100;
controls.maxPolarAngle = Math.PI / 1.7;
controls.update();

const resizeObserver = new ResizeObserver(() => {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
});
resizeObserver.observe(canvas);

function animate() {
  controls.update();

  renderer.compute(computeUpdate);

  scene.overrideMaterial = null;
  renderer.setRenderTarget(null);

  renderer.render(scene, camera);
}

await renderer.init();
renderer.compute(computeInit);
scene.overrideMaterial = collisionPosMaterial;
renderer.setRenderTarget(collisionPosRT);
renderer.render(scene, collisionCamera);

scene.add(particle());
renderer.setAnimationLoop(animate);

// #region Example controls and cleanup

export function onCleanup() {
  renderer.dispose();
  resizeObserver.unobserve(canvas);
}

// #endregion
