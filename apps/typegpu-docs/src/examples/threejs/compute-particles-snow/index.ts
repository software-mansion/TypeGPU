/*
 * Based on: https://github.com/mrdoob/three.js/blob/master/examples/webgpu_compute_particles_snow.html
 */
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

import * as t3 from '@typegpu/three';
import { d, std } from 'typegpu';
import { randf } from '@typegpu/noise';

import * as e from './entities.ts';

const maxParticleCount = 100000;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setClearColor(0x000000);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
camera.position.set(20, 2, 20);
camera.lookAt(0, 40, 0);
camera.layers.enable(2);

const collisionCamera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
collisionCamera.position.y = 50;
collisionCamera.lookAt(0, 0, 0);
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
collisionPosMaterial.outputNode = TSL.vec4(
  TSL.positionWorld.y,
  TSL.positionWorld.y,
  TSL.positionWorld.y,
  1,
);

const positionBuffer = t3.instancedArray(maxParticleCount, d.vec3f);
const scaleBuffer = t3.instancedArray(maxParticleCount, d.vec3f);
const staticPositionBuffer = t3.instancedArray(maxParticleCount, d.vec3f);
const dataBuffer = t3.instancedArray(maxParticleCount, d.vec4f);

const computeInit = t3
  .toTSL(() => {
    'use gpu';
    const instanceIdx = t3.instanceIndex.$;

    randf.seed(instanceIdx / maxParticleCount);
    const rand = d.vec3f(randf.sample(), randf.sample(), randf.sample());
    const randPos = rand * d.vec3f(100, 500, 100) + d.vec3f(-50, 3, -50);

    positionBuffer.$[instanceIdx] = d.vec3f(randPos);
    scaleBuffer.$[instanceIdx] = d.vec3f(randf.sample() * 0.8 + 0.2);
    staticPositionBuffer.$[instanceIdx] = d.vec3f(1000, 10000, 1000);

    dataBuffer.$[instanceIdx] = d.vec4f(randPos.x, -0.01 * rand.y - 0.02, randPos.z, rand.x);
  })
  .compute(maxParticleCount)
  .setName('Init Partciles');

const surfaceOffset = 0.2;
const speed = 0.4;
const terrainTextureAccess = t3.fromTSL(
  TSL.texture(
    collisionPosRT.texture,
    positionBuffer.node.element(TSL.instanceIndex).xz.add(50).div(100),
  ),
  d.vec4f,
);

const computeUpdate = t3
  .toTSL(() => {
    'use gpu';
    const instanceIdx = t3.instanceIndex.$;
    const velocity = dataBuffer.$[instanceIdx].y;
    const random = dataBuffer.$[instanceIdx].w;

    const terrainHeight = terrainTextureAccess.$.y + scaleBuffer.$[instanceIdx].x * surfaceOffset;

    if (positionBuffer.$[instanceIdx].y > terrainHeight) {
      positionBuffer.$[instanceIdx].x =
        dataBuffer.$[instanceIdx].x + 3 * std.sin(t3.time.$ * (random * random) * speed);
      positionBuffer.$[instanceIdx].z =
        dataBuffer.$[instanceIdx].z + 10 * random * std.cos(t3.time.$ * speed);
      positionBuffer.$[instanceIdx].y += velocity;
    } else {
      staticPositionBuffer.$[instanceIdx] = positionBuffer.$[instanceIdx];
    }
  })
  .compute(maxParticleCount)
  .setName('Update Particles');

const sphereGeometry = new THREE.SphereGeometry(surfaceOffset, 5, 5);
function particles(isStatic: boolean = false) {
  const posBuffer = isStatic ? staticPositionBuffer : positionBuffer;
  const layer = isStatic ? 1 : 2;

  const material = new THREE.MeshStandardNodeMaterial({
    color: 0xeeeeee,
    roughness: 0.9,
    metalness: 0,
  });

  material.positionNode = t3.toTSL(() => {
    'use gpu';
    const iidx = t3.instanceIndex.$;
    const localPos = t3.fromTSL(TSL.positionLocal, d.vec3f).$;
    return localPos * scaleBuffer.$[iidx] + posBuffer.$[iidx];
  });

  const rainParticles = new THREE.Mesh(sphereGeometry, material);
  rainParticles.count = maxParticleCount;
  rainParticles.castShadow = true;
  rainParticles.layers.disableAll();
  rainParticles.layers.enable(layer);

  return rainParticles;
}

const scene = new THREE.Scene();
scene.fog = e.fog;
scene.add(e.dirLight);
scene.add(e.hemisphereLight);

const dynamicParticles = particles();
const staticParticles = particles(true);
scene.add(dynamicParticles);
scene.add(staticParticles);

scene.add(e.floor);
scene.add(e.xmasTree);
scene.add(e.teapot);

scene.backgroundNode = t3.toTSL(() => {
  'use gpu';
  const ratio = std.saturate(std.distance(t3.fromTSL(TSL.screenUV, d.vec2f).$, d.vec2f(0.5)) / 0.5);
  // 0.25 multiplier is empirical
  return std.mix(
    d.vec4f(d.vec3f(0.059, 0.255, 0.251).mul(0.25), 1),
    d.vec4f(d.vec3f(0.024, 0.039, 0.051).mul(0.25), 1),
    ratio,
  );
});

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 10, 0);
controls.minDistance = 20;
controls.maxDistance = 35;
controls.maxPolarAngle = Math.PI / 1.7;
controls.autoRotate = true;
controls.autoRotateSpeed = -0.7;
controls.update();

const scenePass = TSL.pass(scene, camera);
const scenePassColor = scenePass.getTextureNode();
const vignette = t3.toTSL(() => {
  'use gpu';
  return 1 - std.saturate(std.distance(t3.fromTSL(TSL.screenUV, d.vec2f).$, d.vec2f(0.5)) * 1.35);
});

const teapotPass = TSL.pass(e.teapot, camera).getTextureNode();
const teapotPassBlurred = gaussianBlur(teapotPass, TSL.vec2(1), 6);
teapotPassBlurred.resolutionScale = 0.2;

const scenePassColorBlurred = gaussianBlur(scenePassColor);
scenePassColorBlurred.resolutionScale = 0.5;
scenePassColorBlurred.directionNode = TSL.vec2(1);

const totalPass = scenePass
  .add(scenePassColorBlurred.mul(0.1))
  .mul(vignette)
  .add(teapotPass.mul(10).add(teapotPassBlurred));

const postProcessing = new THREE.PostProcessing(renderer);
postProcessing.outputNode = totalPass;

const resizeObserver = new ResizeObserver(() => {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
});
resizeObserver.observe(canvas);

function animate() {
  controls.update();

  scene.overrideMaterial = collisionPosMaterial;
  renderer.setRenderTarget(collisionPosRT);
  renderer.render(scene, collisionCamera);
  void renderer.compute(computeUpdate);

  scene.overrideMaterial = null;
  renderer.setRenderTarget(null);

  postProcessing.render();
}

await renderer.init();
void renderer.compute(computeInit);
void renderer.setAnimationLoop(animate);

// #region Example controls and cleanup

export function onCleanup() {
  renderer.dispose();
  resizeObserver.unobserve(canvas);
}

// #endregion
