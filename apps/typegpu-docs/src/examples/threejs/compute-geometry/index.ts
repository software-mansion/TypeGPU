/*
 * Based on: https://github.com/mrdoob/three.js/blob/master/examples/webgpu_compute_geometry.html
 */
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as t3 from '@typegpu/three';
import { d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const camera = new THREE.PerspectiveCamera(
  50,
  canvas.clientWidth / canvas.clientHeight,
  0.1,
  10,
);
camera.position.set(0, 0, 1);

const scene = new THREE.Scene();

const bgColor = TSL.screenUV.y.mix(TSL.color(0x9f87f7), TSL.color(0xf2cdcd));
const bgVignette = TSL.screenUV.distance(0.5).remapClamp(0.3, 0.8).oneMinus();
const bgIntensity = 4;
scene.backgroundNode = bgColor.mul(
  bgVignette.mul(TSL.color(0xa78ff6).mul(bgIntensity)),
);

const pointerPosition = t3.uniform(TSL.vec4(0), d.vec4f);
const elasticity = t3.uniform(0.4, d.f32);
const damping = t3.uniform(0.94, d.f32);
const brushSize = t3.uniform(0.25, d.f32);
const brushStrength = t3.uniform(0.22, d.f32);

const jelly = TSL.Fn(({ renderer, geometry, object }) => {
  const count = geometry.attributes.position.count;

  const positionStorageBufferAttribute = new THREE.StorageBufferAttribute(
    count,
    3,
  );
  geometry.setAttribute('storagePosition', positionStorageBufferAttribute);

  const basePositionAccessor = t3.fromTSL(
    TSL.storage(
      geometry.attributes.position as THREE.BufferAttribute,
      'vec3',
      count,
    ),
    d.arrayOf(d.vec3f),
  );
  const positionAccessor = t3.fromTSL(
    TSL.storage(
      positionStorageBufferAttribute,
      'vec3',
      count,
    ),
    d.arrayOf(d.vec3f),
  );
  const speedAccessor = t3.fromTSL(
    TSL.storage(
      new THREE.StorageBufferAttribute(count, 3),
      'vec3',
      count,
    ),
    d.arrayOf(d.vec3f),
  );

  const computeInit = t3.toTSL(() => {
    'use gpu';
    positionAccessor.$[t3.instanceIndex.$] =
      basePositionAccessor.$[t3.instanceIndex.$];
  }).compute(count).setName('Init Mesh');

  const modelMatrixAccessor = t3.fromTSL(
    TSL.objectWorldMatrix(object),
    d.mat4x4f,
  );

  const computeUpdate = t3.toTSL(() => {
    'use gpu';
    const instanceIdx = t3.instanceIndex.$;
    const basePosition = basePositionAccessor.$[instanceIdx];
    let position = positionAccessor.$[instanceIdx];

    if (pointerPosition.$.w === 1) {
      const worldPosition = (modelMatrixAccessor.$ * d.vec4f(position, 1)).xyz;
      const dist = std.distance(worldPosition, pointerPosition.$.xyz);
      const direction = std.normalize(pointerPosition.$.xyz - worldPosition);
      const power = std.max(brushSize.$ - dist, 0) * brushStrength.$;

      positionAccessor.$[instanceIdx] = position + direction * power;
      position = positionAccessor.$[instanceIdx];
    }

    const dist = std.distance(basePosition, position);
    const force = (basePosition - position) * elasticity.$ * dist;
    const speed = (speedAccessor.$[instanceIdx] + force) * damping.$;

    speedAccessor.$[instanceIdx] = d.vec3f(speed);
    positionAccessor.$[instanceIdx] = position.add(speed);
  }).compute(count).setName('Update Jelly');

  computeUpdate.onInit(() => renderer.compute(computeInit));

  return computeUpdate;
});

new GLTFLoader().load(
  '/TypeGPU/assets/threejs/compute-geometry/LeePerrySmith.glb',
  // on successful load
  (gltf: GLTF) => {
    const material = new THREE.MeshNormalNodeMaterial();
    material.geometryNode = jelly() as unknown as () => THREE.Node;
    material.positionNode = TSL.attribute('storagePosition'); // global

    const mesh = gltf.scene.children[0] as THREE.Mesh;
    mesh.scale.setScalar(0.1);
    mesh.material = material;
    scene.add(mesh);
    document.querySelector('.loading')?.classList.add('loaded');
  },
);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const onPointerMove = (event: PointerEvent) => {
  const rect = canvas.getBoundingClientRect();
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );

  raycaster.setFromCamera(pointer, camera);

  const intersects = raycaster.intersectObject(scene);

  if (intersects.length > 0) {
    const { point } = intersects[0];
    pointerPosition.node.value.copy(new THREE.Vector4(...point, 1));
    pointerPosition.node.value.w = 1; // enable
  } else {
    pointerPosition.node.value.w = 0; // disable
  }
};
canvas.addEventListener('pointermove', onPointerMove);

const resizeObserver = new ResizeObserver(() => {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
});
resizeObserver.observe(canvas);

const orbitControls = new OrbitControls(camera, canvas);
orbitControls.minDistance = 0.7;
orbitControls.maxDistance = 2;
if ('ontouchstart' in window) {
  orbitControls.enableRotate = false; // disable rotation on mobile
}

function animate() {
  renderer.render(scene, camera);
}
void renderer.setAnimationLoop(animate);

// #region Example controls and cleanup
export const controls = defineControls({
  elasticity: {
    initial: 0.4,
    min: 0,
    max: 0.5,
    step: 0.01,
    onSliderChange: (value) => {
      elasticity.node.value = value;
    },
  },
  damping: {
    initial: 0.94,
    min: 0.9,
    max: 0.98,
    step: 0.01,
    onSliderChange: (value) => {
      damping.node.value = value;
    },
  },
  'brush size': {
    initial: 0.25,
    min: 0.1,
    max: 0.5,
    step: 0.01,
    onSliderChange: (value) => {
      brushSize.node.value = value;
    },
  },
  'brush strength': {
    initial: 0.22,
    min: 0.1,
    max: 0.3,
    step: 0.01,
    onSliderChange: (value) => {
      brushStrength.node.value = value;
    },
  },
});

export function onCleanup() {
  renderer.dispose();
  resizeObserver.unobserve(canvas);
}

// #endregion
