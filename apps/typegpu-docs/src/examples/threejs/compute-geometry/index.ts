import * as THREE from 'three/webgpu';
import {
  attribute,
  color,
  Fn,
  If,
  instanceIndex,
  objectWorldMatrix,
  screenUV,
  storage,
  uniform,
  vec4,
} from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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
const bgColor = screenUV.y.mix(color(0x9f87f7), color(0xf2cdcd));
const bgVignette = screenUV.distance(.5).remapClamp(0.3, .8).oneMinus();
const bgIntensity = 4;
scene.backgroundNode = bgColor.mul(
  bgVignette.mul(color(0xa78ff6).mul(bgIntensity)),
);

const pointerPosition = uniform(vec4(0));
const elasticity = uniform(.4); // elasticity ( how "strong" the spring is )
const damping = uniform(.94); // damping factor ( energy loss )
const brushSize = uniform(.25);
const brushStrength = uniform(.22);

const jelly = Fn(({ renderer, geometry, object }) => {
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

  const positionAttribute = storage(
    // @ts-ignore
    positionBaseAttribute,
    'vec3',
    count,
  );
  const positionStorageAttribute = storage(
    positionStorageBufferAttribute,
    'vec3',
    count,
  );

  const speedAttribute = storage(speedBufferAttribute, 'vec3', count);

  // Vectors

  // Base vec3 position of the mesh vertices.
  const basePosition = positionAttribute.element(instanceIndex);
  // Mesh vertices after compute modification.
  const currentPosition = positionStorageAttribute.element(instanceIndex);
  // Speed of each mesh vertex.
  const currentSpeed = speedAttribute.element(instanceIndex);

  const computeInit = Fn(() => {
    // Modified storage position starts out the same as the base position.

    currentPosition.assign(basePosition);
  })().compute(count);

  const computeUpdate = Fn(() => {
    // pinch

    If(pointerPosition.w.equal(1), () => {
      const worldPosition = objectWorldMatrix(object).mul(currentPosition);

      const dist = worldPosition.distance(pointerPosition.xyz);
      const direction = pointerPosition.xyz.sub(worldPosition).normalize();

      const power = brushSize.sub(dist).max(0).mul(brushStrength);

      currentPosition.addAssign(direction.mul(power));
    });

    // compute ( jelly )

    const distance = basePosition.distance(currentPosition);
    const force = elasticity.mul(distance).mul(
      basePosition.sub(currentPosition),
    );

    currentSpeed.addAssign(force);
    currentSpeed.mulAssign(damping);

    currentPosition.addAssign(currentSpeed);
  })().compute(count).setName('Update Jelly');

  // initialize the storage buffer with the base position

  computeUpdate.onInit(() => renderer.compute(computeInit));

  return computeUpdate;
});

new GLTFLoader().load(
  '/TypeGPU/assets/threejs/compute-geometry/LeePerrySmith.glb',
  function (gltf) {
    const material = new THREE.MeshNormalNodeMaterial();
    // @ts-ignore
    material.geometryNode = jelly();
    material.positionNode = attribute('storagePosition');

    // apply the material to the mesh

    const mesh = gltf.scene.children[0];
    mesh.scale.setScalar(.1);
    // @ts-ignore
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

const controls = new OrbitControls(camera, canvas);
controls.minDistance = .7;
controls.maxDistance = 2;

function animate() {
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

// #region Example controls and cleanup

// gui.add(elasticity, 'value', 0, .5).name('elasticity');
// gui.add(damping, 'value', .9, .98).name('damping');
// gui.add(brushSize, 'value', .1, .5).name('brush size');
// gui.add(brushStrength, 'value', .1, .3).name('brush strength');

export function onCleanup() {
  renderer.dispose();
  resizeObserver.unobserve(canvas);
}

// #endregion
