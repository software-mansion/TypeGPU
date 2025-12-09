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
// renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setClearColor(0x000000);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const camera = new THREE.PerspectiveCamera(
  60,
  canvas.clientWidth / canvas.clientHeight,
  .1,
  100,
);
camera.position.set(40, 20, 40);
camera.layers.enable(2); // renders only objects within layer 2
camera.lookAt(0, 40, 0);

const scene = new THREE.Scene();
// scene.fog = o.fog;
scene.add(o.dirLight);
scene.add(o.hemisphereLight);

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
}).compute(maxParticleCount).setName('Init');

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
collisionCamera.layers.disableAll();
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
collisionPosMaterial.colorNode = TSL.vec4(5);

const surfaceOffset = .2;
const speed = .4;

const computeUpdate = TSL.Fn(() => {
  const position = positionBuffer.element(TSL.instanceIndex);
  const particleData = dataBuffer.element(TSL.instanceIndex);

  const velocity = particleData.y;
  const random = particleData.w;

  const terrainHeight = TSL.texture(
    collisionPosRT.texture,
    position.xz.add(50).div(100),
  ).y;

  position.y.assign(terrainHeight);

  // TSL.If(position.y.greaterThan(terrainHeight), () => {
  //   // position.x = particleData.x.add(
  //   //   TSL.time.mul(random.mul(random)).mul(speed).sin().mul(3),
  //   // );
  //   // position.z = particleData.z.add(
  //   //   TSL.time.mul(random).mul(speed).cos().mul(random.mul(10)),
  //   // );

  //   position.y.addAssign(velocity);
  // }).Else(() => {
  //   staticPositionBuffer.element(TSL.instanceIndex).assign(position);
  // });
});

const computeParticles = computeUpdate().compute(maxParticleCount);
computeParticles.name = 'Update Particles';

// rain

const geometry = new THREE.SphereGeometry(surfaceOffset, 5, 5);
function particle(staticParticles?: boolean) {
  const posBuffer = staticParticles ? staticPositionBuffer : positionBuffer;
  const layer = staticParticles ? 1 : 2;

  const staticMaterial = new THREE.MeshStandardNodeMaterial({
    color: 0xeeeeee,
    roughness: .9,
    metalness: 0,
  });

  staticMaterial.positionNode = TSL.positionLocal.add(
    posBuffer.element(TSL.instanceIndex),
  );

  const rainParticles = new THREE.InstancedMesh(
    geometry,
    staticMaterial,
    maxParticleCount,
  );
  rainParticles.castShadow = true;
  rainParticles.layers.disableAll();
  rainParticles.layers.enable(2);

  return rainParticles;
}

const dynamicParticles = particle();
const staticParticles = particle(true);

// scene.add(staticParticles);

// floor geometry

const floorGeometry = new THREE.PlaneGeometry(100, 100);
floorGeometry.rotateX(-Math.PI / 2);

const plane = new THREE.Mesh(
  floorGeometry,
  new THREE.MeshStandardMaterial({
    color: 0x0c1e1e,
    roughness: .5,
    metalness: 0,
    transparent: false,
  }),
);

plane.material.opacityNode = TSL.positionLocal.xz.mul(.05).distance(0)
  .saturate()
  .oneMinus();

plane.position.y = 0;

plane.layers.disableAll();
plane.layers.enable(1);
plane.layers.enable(2);

scene.add(plane);

// tree

function tree(count = 1) {
  const coneMaterial = new THREE.MeshStandardNodeMaterial({
    color: 0x0d492c,
    roughness: .6,
    metalness: 0,
  });

  const object = new THREE.Group();

  // for (let i = 0; i < count; i++) {
  //   const radius = 1 + i;

  //   const coneGeometry = new THREE.ConeGeometry(
  //     radius * 0.95,
  //     radius * 1.25,
  //     32,
  //   );

  //   const cone = new THREE.Mesh(coneGeometry, coneMaterial);
  //   cone.castShadow = true;
  //   cone.position.y = ((count - i) * 1.5) + (count * .6);
  //   object.add(cone);
  // }

  const geometry = new THREE.CylinderGeometry(5, 5, 10, 32);
  const cylinder = new THREE.Mesh(geometry, coneMaterial);
  cylinder.position.y = 0;
  cylinder.layers.disableAll();
  cylinder.layers.enable(1);
  cylinder.layers.enable(2);
  object.add(cylinder);

  return object;
}

const teapotTree = new THREE.Mesh(
  new TeapotGeometry(.5, 18),
  new THREE.MeshBasicNodeMaterial({
    color: 0xfcfb9e,
  }),
);

teapotTree.name = 'Teapot Pass';
teapotTree.position.y = 18;
teapotTree.layers.disableAll();
teapotTree.layers.enable(2);

scene.add(tree());
// scene.add(teapotTree);

// scene.backgroundNode = TSL.screenUV.distance(.5).mul(2).mix(
//   TSL.color(0x0f4140),
//   TSL.color(0x060a0d),
// );

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 10, 0);
controls.minDistance = 1;
controls.maxDistance = 100;
controls.maxPolarAngle = Math.PI / 1.7;
// controls.autoRotate = true;
// controls.autoRotateSpeed = -0.7;
controls.update();

// post processing

const scenePass = TSL.pass(scene, camera);
const scenePassColor = scenePass.getTextureNode();
const vignette = TSL.screenUV.distance(.5).mul(1.35).clamp().oneMinus();

const teapotTreePass = TSL.pass(teapotTree, camera).getTextureNode();
const teapotTreePassBlurred = gaussianBlur(teapotTreePass, TSL.vec2(1), 6);
teapotTreePassBlurred.resolutionScale = 1;

const scenePassColorBlurred = gaussianBlur(scenePassColor);
scenePassColorBlurred.resolutionScale = 1;
scenePassColorBlurred.directionNode = TSL.vec2(1);

// compose

let totalPass = scenePass.toInspector('Scene');
// totalPass = totalPass.add(scenePassColorBlurred.mul(.1));
// totalPass = totalPass.mul(vignette);
// totalPass = totalPass.add(
// teapotTreePass.mul(10).add(teapotTreePassBlurred).toInspector(
// 'Teapot Blur',
// ),
// );

const postProcessing = new THREE.PostProcessing(renderer, totalPass);

function animate() {
  controls.update();

  renderer.compute(computeParticles);

  scene.overrideMaterial = null;
  renderer.setRenderTarget(null);

  renderer.render(scene, camera);
}

const resizeObserver = new ResizeObserver(() => {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
});
resizeObserver.observe(canvas);

await renderer.init();
renderer.compute(computeInit);
scene.overrideMaterial = collisionPosMaterial;
renderer.setRenderTarget(collisionPosRT);
renderer.render(scene, camera);

scene.add(dynamicParticles);

// debug height
const debugGeo = new THREE.PlaneGeometry(20, 20);

// 2. Create a TSL Material
const debugMat = new THREE.MeshBasicNodeMaterial();
debugMat.side = THREE.DoubleSide;

// 3. Read the texture
// We multiply by a small number (e.g., 0.02) to squash big height values
// (like 50.0) down to visible colors (like 1.0).
// Adjust '0.02' until you see a nice gradient.
const rawHeight = TSL.texture(collisionPosRT.texture);
debugMat.colorNode = TSL.mix(
  TSL.vec3(1, 0, 0), // Red (Low)
  TSL.vec3(0, 1, 0), // Green (High)
  rawHeight.mul(0.04), // Scale and clamp 0 to 1
);

// 4. Place it in the world
const debugPlane = new THREE.Mesh(debugGeo, debugMat);
debugPlane.position.set(0, 10, 10); // Move it to the side of your tree
scene.add(debugPlane);

// end of debug

renderer.setAnimationLoop(animate);

// #region Example controls and cleanup

export function onCleanup() {
  renderer.dispose();
  resizeObserver.unobserve(canvas);
}

// #endregion
