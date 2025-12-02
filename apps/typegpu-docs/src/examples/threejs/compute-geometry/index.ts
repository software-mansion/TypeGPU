/*
 * Based on: https://github.com/mrdoob/three.js/blob/master/examples/webgpu_compute_geometry.html
 */
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fromTSL, toTSL } from '@typegpu/three';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

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

// top left is (0,0) - just recalling
const bgColor = TSL.screenUV.y.mix(TSL.color(0x9f87f7), TSL.color(0xf2cdcd));
const bgVignette = TSL.screenUV.distance(0.5).remapClamp(0.3, 0.8).oneMinus();
const bgIntensity = 4;
scene.backgroundNode = bgColor.mul(
  bgVignette.mul(TSL.color(0xa78ff6).mul(bgIntensity)),
);

const pointerPosition = TSL.uniform(TSL.vec4(0));
const elasticity = TSL.uniform(0.4);
const damping = TSL.uniform(0.94);
const brushSize = TSL.uniform(0.25);
const brushStrength = TSL.uniform(0.22);
const pointerPositionUniform = fromTSL(pointerPosition, { type: d.vec4f });
const elasticityUniform = fromTSL(elasticity, { type: d.f32 });
const dampingUniform = fromTSL(damping, { type: d.f32 });
const brushSizeUniform = fromTSL(brushSize, { type: d.f32 });
const brushStrengthUniform = fromTSL(brushStrength, { type: d.f32 });

const jelly = TSL.Fn(({ renderer, geometry, object }) => {
  const count = geometry.attributes.position.count;

  // Create storage buffer attribute for modified position.

  const positionBaseAttribute = geometry.attributes.position;
  const positionStorageBufferAttribute = new THREE.StorageBufferAttribute(
    count,
    3,
  );
  const speedBufferAttribute = new THREE.StorageBufferAttribute(count, 3);

  geometry.setAttribute('storagePosition', positionStorageBufferAttribute);

  // Attributes

  const positionAttribute = TSL.storage(
    positionBaseAttribute as THREE.BufferAttribute,
    'vec3',
    count,
  );
  const positionStorageAttribute = TSL.storage(
    positionStorageBufferAttribute,
    'vec3',
    count,
  );

  const speedAttribute = TSL.storage(speedBufferAttribute, 'vec3', count);

  // Vectors

  // Base vec3 position of the mesh vertices.
  const basePosition = positionAttribute.element(TSL.instanceIndex);
  // Mesh vertices after compute modification.
  const currentPosition = positionStorageAttribute.element(TSL.instanceIndex);
  // Speed of each mesh vertex.
  const currentSpeed = speedAttribute.element(TSL.instanceIndex);

  const computeInit = TSL.Fn(() => {
    // Modified storage position starts out the same as the base position.

    currentPosition.assign(basePosition);
  })().compute(count);

  const computeUpdate = TSL.Fn(() => {
    // pinch

    TSL.If(pointerPosition.w.equal(1), () => {
      const worldPosition = TSL.objectWorldMatrix(object).mul(currentPosition);

      const dist = worldPosition.distance(pointerPosition.xyz);
      const direction = pointerPosition.xyz.sub(worldPosition).normalize();

      const power = brushSize.sub(dist).max(0).mul(brushStrength);

      currentPosition.addAssign(direction.mul(power));
    });

    // compute ( jelly )

    const distance = basePosition.distance(currentPosition);
    const force = elasticity
      .mul(distance)
      .mul(basePosition.sub(currentPosition));

    currentSpeed.addAssign(force);
    currentSpeed.mulAssign(damping);

    currentPosition.addAssign(currentSpeed);
  })()
    .compute(count)
    .setName('Update Jelly');

  // initialize the storage buffer with the base position

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
    pointerPosition.value.copy(new THREE.Vector4(...point, 1));
    pointerPosition.value.w = 1; // enable
  } else {
    pointerPosition.value.w = 0; // disable
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

function animate() {
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// #region Example controls and cleanup
export const controls = {
  elasticity: {
    initial: 0.4,
    min: 0,
    max: 0.5,
    step: 0.01,
    onSliderChange: (value: number) => {
      elasticity.value = value;
    },
  },
  damping: {
    initial: 0.94,
    min: 0.9,
    max: 0.98,
    step: 0.01,
    onSliderChange: (value: number) => {
      damping.value = value;
    },
  },
  'brush size': {
    initial: 0.25,
    min: 0.1,
    max: 0.5,
    step: 0.01,
    onSliderChange: (value: number) => {
      brushSize.value = value;
    },
  },
  'brush strength': {
    initial: 0.22,
    min: 0.1,
    max: 0.3,
    step: 0.01,
    onSliderChange: (value: number) => {
      brushStrength.value = value;
    },
  },
};

export function onCleanup() {
  renderer.dispose();
  resizeObserver.unobserve(canvas);
}

// #endregion
