/*
 * Based on: https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_water.html
 */

import * as THREE from 'three/webgpu';
import * as t3 from '@typegpu/three';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as TSL from 'three/tsl';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { BOUNDS, limit, WIDTH } from './consts.ts';
import { noise } from './utils.ts';
import { createGpuHelpers } from './gpuHelpers.ts';

// Struct schemas for GPU function return types

if (WebGPU.isAvailable() === false) {
  document.body.appendChild(WebGPU.getErrorMessage());
  throw new Error('No WebGPU support');
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const canvasResizeContainer = canvas.parentElement
  ?.parentElement as HTMLDivElement;

const getTargetSize = () =>
  [canvasResizeContainer.clientWidth, canvasResizeContainer.clientHeight] as [
    number,
    number,
  ];
const initialSize = getTargetSize();
const renderer = new THREE.WebGPURenderer({ antialias: true, canvas });
await renderer.init();
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(...initialSize);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  initialSize[0] / initialSize[1],
  1,
  3000,
);
camera.position.set(0, 2.0, 4);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, canvas);

// Sun
const sun = new THREE.DirectionalLight(0xffffff, 4.0);
sun.position.set(-1, 2.6, 1.4);
scene.add(sun);

// height storage buffers
const heightArray = new Float32Array(WIDTH * WIDTH);
const prevHeightArray = new Float32Array(WIDTH * WIDTH);

let p = 0;
for (let j = 0; j < WIDTH; j++) {
  for (let i = 0; i < WIDTH; i++) {
    const x = (i * 128) / WIDTH;
    const y = (j * 128) / WIDTH;
    const height = noise(x, y);
    heightArray[p] = height;
    prevHeightArray[p] = height;
    p++;
  }
}

// Ping-pong height storage buffers
const heightStorageA = t3.instancedArray(new Float32Array(heightArray), d.f32);
const heightStorageB = t3.instancedArray(new Float32Array(heightArray), d.f32);
const prevHeightStorage = t3.instancedArray(prevHeightArray, d.f32);

// Uniforms using t3.uniform
const mousePos = t3.uniform(new THREE.Vector2(), d.vec2f);
const mouseSpeed = t3.uniform(new THREE.Vector2(), d.vec2f);
const mouseDeep = t3.uniform(0.5, d.f32);
const mouseSize = t3.uniform(0.12, d.f32);
const viscosity = t3.uniform(0.96, d.f32);
const readFromA = t3.uniform(1, d.u32);

// State
let mouseDown = false;
let firstClick = true;
let updateOriginMouseDown = false;
const mouseCoords = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let frame = 0;
let pingPong = 0;
let ducksEnabled = true;
const speed = 5;

const NUM_DUCKS = 100;

// Create GPU helper functions with closure over storage buffers
const { getNeighborIndices, getCurrentHeight, getCurrentNormals } =
  createGpuHelpers(
    heightStorageA,
    heightStorageB,
    readFromA,
  );

// Compute shader for height simulation: A -> B
const computeHeightAtoB = t3.toTSL(() => {
  'use gpu';
  const idx = t3.instanceIndex.$;

  const height = heightStorageA.$[idx];
  const prevHeight = prevHeightStorage.$[idx];

  const neighbors = getNeighborIndices(idx);
  const northIndex = neighbors.northIndex;
  const southIndex = neighbors.southIndex;
  const eastIndex = neighbors.eastIndex;
  const westIndex = neighbors.westIndex;

  const north = heightStorageA.$[northIndex];
  const south = heightStorageA.$[southIndex];
  const east = heightStorageA.$[eastIndex];
  const west = heightStorageA.$[westIndex];

  let neighborHeight = std.mul(
    std.add(std.add(std.add(north, south), east), west),
    0.5,
  );
  neighborHeight = std.sub(neighborHeight, prevHeight);
  let newHeight = std.mul(neighborHeight, viscosity.$);

  // Get x and y position of the coordinate in the water plane
  const x = std.mul(d.f32(std.mod(idx, WIDTH)), std.div(1, WIDTH));
  const y = std.mul(d.f32(std.div(idx, WIDTH)), std.div(1, WIDTH));

  // Mouse influence
  const centerVec = d.vec2f(0.5, 0.5);
  const posVec = d.vec2f(x, y);
  const mouseOffset = posVec.sub(centerVec).mul(BOUNDS).sub(mousePos.$.xy);
  const mousePhase = std.clamp(
    std.div(std.mul(std.length(mouseOffset), Math.PI), mouseSize.$),
    0.0,
    Math.PI,
  );

  newHeight = std.add(
    newHeight,
    std.mul(
      std.mul(std.add(std.cos(mousePhase), 1.0), mouseDeep.$),
      std.length(mouseSpeed.$.xy),
    ),
  );

  prevHeightStorage.$[idx] = height;
  heightStorageB.$[idx] = newHeight;
}).compute(WIDTH * WIDTH);

// Compute shader for height simulation: B -> A
const computeHeightBtoA = t3.toTSL(() => {
  'use gpu';
  const idx = t3.instanceIndex.$;

  const height = heightStorageB.$[idx];
  const prevHeight = prevHeightStorage.$[idx];

  const neighbors = getNeighborIndices(idx);
  const northIndex = neighbors.northIndex;
  const southIndex = neighbors.southIndex;
  const eastIndex = neighbors.eastIndex;
  const westIndex = neighbors.westIndex;

  const north = heightStorageB.$[northIndex];
  const south = heightStorageB.$[southIndex];
  const east = heightStorageB.$[eastIndex];
  const west = heightStorageB.$[westIndex];

  let neighborHeight = std.mul(
    std.add(std.add(std.add(north, south), east), west),
    0.5,
  );
  neighborHeight = std.sub(neighborHeight, prevHeight);
  let newHeight = std.mul(neighborHeight, viscosity.$);

  // Get x and y position of the coordinate in the water plane
  const x = std.mul(d.f32(std.mod(idx, WIDTH)), std.div(1, WIDTH));
  const y = std.mul(d.f32(std.div(idx, WIDTH)), std.div(1, WIDTH));

  // Mouse influence
  const centerVec = d.vec2f(0.5, 0.5);
  const posVec = d.vec2f(x, y);
  const mouseOffset = posVec.sub(centerVec).mul(BOUNDS).sub(mousePos.$.xy);
  const mousePhase = std.clamp(
    std.div(std.mul(std.length(mouseOffset), Math.PI), mouseSize.$),
    0.0,
    Math.PI,
  );

  newHeight = std.add(
    newHeight,
    std.mul(
      std.mul(std.add(std.cos(mousePhase), 1.0), mouseDeep.$),
      std.length(mouseSpeed.$.xy),
    ),
  );

  prevHeightStorage.$[idx] = height;
  heightStorageA.$[idx] = newHeight;
}).compute(WIDTH * WIDTH);

// Water Geometry and Material
const waterGeometry = new THREE.PlaneGeometry(
  BOUNDS,
  BOUNDS,
  WIDTH - 1,
  WIDTH - 1,
);

const waterMaterial = new THREE.MeshStandardNodeMaterial({
  color: 0x9bd2ec,
  metalness: 0.9,
  roughness: 0,
  transparent: true,
  opacity: 0.8,
  side: THREE.DoubleSide,
});

const vertexIndex = t3.fromTSL(TSL.vertexIndex, d.u32);

waterMaterial.normalNode = t3.toTSL(() => {
  'use gpu';
  const normals = getCurrentNormals(vertexIndex.$);
  const normalX = normals.normalX;
  const normalY = normals.normalY;
  return d.vec3f(normalX, std.neg(normalY), 1.0);
});

waterMaterial.positionNode = t3.toTSL(() => {
  'use gpu';
  const posLocal = t3.fromTSL(TSL.positionLocal, d.vec3f).$;
  return d.vec3f(posLocal.x, posLocal.y, getCurrentHeight(vertexIndex.$));
});

const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
waterMesh.rotation.x = -Math.PI * 0.5;
waterMesh.matrixAutoUpdate = false;
waterMesh.updateMatrix();
scene.add(waterMesh);

// Pool border
const borderGeom = new THREE.TorusGeometry(4.2, 0.1, 12, 4);
borderGeom.rotateX(Math.PI * 0.5);
borderGeom.rotateY(Math.PI * 0.25);
const poolBorder = new THREE.Mesh(
  borderGeom,
  new THREE.MeshStandardMaterial({ color: 0x908877, roughness: 0.2 }),
);
scene.add(poolBorder);

// Mesh for mouse raycasting
const geometryRay = new THREE.PlaneGeometry(BOUNDS, BOUNDS, 1, 1);
const meshRay = new THREE.Mesh(
  geometryRay,
  new THREE.MeshBasicMaterial({ color: 0xffffff, visible: false }),
);
meshRay.rotation.x = -Math.PI / 2;
meshRay.matrixAutoUpdate = false;
meshRay.updateMatrix();
scene.add(meshRay);

// Duck instance data storage
const duckPositions = new Float32Array(NUM_DUCKS * 3);
const duckVelocities = new Float32Array(NUM_DUCKS * 2);
const duckStride = 3;

for (let i = 0; i < NUM_DUCKS; i++) {
  duckPositions[i * duckStride + 0] = (Math.random() - 0.5) * BOUNDS * 0.7;
  duckPositions[i * duckStride + 1] = 0;
  duckPositions[i * duckStride + 2] = (Math.random() - 0.5) * BOUNDS * 0.7;
  duckVelocities[i * 2 + 0] = 0;
  duckVelocities[i * 2 + 1] = 0;
}

const duckPositionStorage = t3.instancedArray(duckPositions, d.vec3f);
const duckVelocityStorage = t3.instancedArray(duckVelocities, d.vec2f);

// Duck compute shader
const computeDucks = t3.toTSL(() => {
  'use gpu';
  const yOffset = -0.04;
  const verticalResponseFactor = 0.98;
  const waterPushFactor = 0.015;
  const linearDamping = 0.92;
  const bounceDamping = -0.4;

  const idx = t3.instanceIndex.$;
  const instancePosition = d.vec3f(duckPositionStorage.$[idx]);
  const velocity = d.vec2f(duckVelocityStorage.$[idx]);

  const gridCoordX = std.mul(
    std.add(std.div(instancePosition.x, BOUNDS), 0.5),
    WIDTH,
  );
  const gridCoordZ = std.mul(
    std.add(std.div(instancePosition.z, BOUNDS), 0.5),
    WIDTH,
  );

  const xCoord = d.u32(std.clamp(std.floor(gridCoordX), 0, std.sub(WIDTH, 1)));
  const zCoord = d.u32(std.clamp(std.floor(gridCoordZ), 0, std.sub(WIDTH, 1)));
  const heightInstanceIndex = std.add(std.mul(zCoord, WIDTH), xCoord);

  const waterHeight = getCurrentHeight(heightInstanceIndex);
  const normals = getCurrentNormals(heightInstanceIndex);
  const normalX = normals.normalX;
  const normalY = normals.normalY;

  const targetY = std.add(waterHeight, yOffset);
  const deltaY = std.sub(targetY, instancePosition.y);
  instancePosition.y = std.add(
    instancePosition.y,
    std.mul(deltaY, verticalResponseFactor),
  );

  const pushX = std.mul(normalX, waterPushFactor);
  const pushZ = std.mul(normalY, waterPushFactor);

  velocity.x = std.mul(velocity.x, linearDamping);
  velocity.y = std.mul(velocity.y, linearDamping);
  velocity.x = std.add(velocity.x, pushX);
  velocity.y = std.add(velocity.y, pushZ);

  instancePosition.x = std.add(instancePosition.x, velocity.x);
  instancePosition.z = std.add(instancePosition.z, velocity.y);

  // Clamp position to pool bounds
  if (instancePosition.x < std.neg(limit)) {
    instancePosition.x = std.neg(limit);
    velocity.x = std.mul(velocity.x, bounceDamping);
  } else if (instancePosition.x > limit) {
    instancePosition.x = limit;
    velocity.x = std.mul(velocity.x, bounceDamping);
  }

  if (instancePosition.z < std.neg(limit)) {
    instancePosition.z = std.neg(limit);
    velocity.y = std.mul(velocity.y, bounceDamping);
  } else if (instancePosition.z > limit) {
    instancePosition.z = limit;
    velocity.y = std.mul(velocity.y, bounceDamping);
  }

  duckPositionStorage.$[idx] = d.vec3f(instancePosition);
  duckVelocityStorage.$[idx] = d.vec2f(velocity);
}).compute(NUM_DUCKS);

// Load environment and duck model
const hdrLoader = new HDRLoader().setPath(
  'https://threejs.org/examples/textures/equirectangular/',
);
const glbLoader = new GLTFLoader().setPath(
  'https://threejs.org/examples/models/gltf/',
);
glbLoader.setDRACOLoader(
  new DRACOLoader().setDecoderPath(
    'https://threejs.org/examples/jsm/libs/draco/gltf/',
  ),
);

const [env, model] = await Promise.all([
  hdrLoader.loadAsync('blouberg_sunrise_2_1k.hdr'),
  glbLoader.loadAsync('duck.glb'),
]);

env.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = env;
scene.background = env;
scene.backgroundBlurriness = 0.3;
scene.environmentIntensity = 1.25;

const duckModel = model.scene.children[0] as THREE.Mesh;
const duckMaterial = duckModel.material as THREE.MeshStandardNodeMaterial;

duckMaterial.positionNode = t3.toTSL(() => {
  'use gpu';
  const idx = t3.instanceIndex.$;
  const instancePosition = duckPositionStorage.$[idx];
  const posLocal = t3.fromTSL(TSL.positionLocal, d.vec3f).$;
  return d.vec3f(
    std.add(posLocal.x, instancePosition.x),
    std.add(posLocal.y, instancePosition.y),
    std.add(posLocal.z, instancePosition.z),
  );
});

const duckMesh = new THREE.InstancedMesh(
  duckModel.geometry,
  duckMaterial,
  NUM_DUCKS,
);
scene.add(duckMesh);

// Render loop
renderer.setAnimationLoop(() => {
  const targetSize = getTargetSize();
  const rendererSize = renderer.getSize(new THREE.Vector2());
  if (
    targetSize[0] !== rendererSize.width ||
    targetSize[1] !== rendererSize.height
  ) {
    onWindowResize();
  }

  raycast();

  frame++;

  if (frame >= 7 - speed) {
    // Ping-pong: alternate which buffer we read from and write to
    if (pingPong === 0) {
      renderer.compute(computeHeightAtoB);
      readFromA.node.value = 0; // Material now reads from B (just written)
    } else {
      renderer.compute(computeHeightBtoA);
      readFromA.node.value = 1; // Material now reads from A (just written)
    }

    pingPong = 1 - pingPong;

    if (ducksEnabled) {
      renderer.compute(computeDucks);
    }

    frame = 0;
  }

  renderer.render(scene, camera);
});

// Event handlers
function setMouseCoords(x: number, y: number) {
  mouseCoords.set(
    (x / canvas.clientWidth) * 2 - 1,
    -(y / canvas.clientHeight) * 2 + 1,
  );
}

function onPointerDown() {
  mouseDown = true;
  firstClick = true;
  updateOriginMouseDown = true;
}

function onPointerUp() {
  mouseDown = false;
  firstClick = false;
  updateOriginMouseDown = false;
  controls.enabled = true;
}

function onPointerMove(event: PointerEvent) {
  if (event.isPrimary === false) return;
  setMouseCoords(event.clientX, event.clientY);
}

canvas.style.touchAction = 'none';
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointerup', onPointerUp);

function raycast() {
  if (mouseDown && (firstClick || !controls.enabled)) {
    raycaster.setFromCamera(mouseCoords, camera);
    const intersects = raycaster.intersectObject(meshRay);

    if (intersects.length > 0) {
      const point = intersects[0].point;

      if (updateOriginMouseDown) {
        mousePos.node.value.set(point.x, point.z);
        updateOriginMouseDown = false;
      }

      mouseSpeed.node.value.set(
        point.x - mousePos.node.value.x,
        point.z - mousePos.node.value.y,
      );

      mousePos.node.value.set(point.x, point.z);

      if (firstClick) {
        controls.enabled = false;
      }
    } else {
      updateOriginMouseDown = true;
      mouseSpeed.node.value.set(0, 0);
    }

    firstClick = false;
  } else {
    updateOriginMouseDown = true;
    mouseSpeed.node.value.set(0, 0);
  }
}

function onWindowResize() {
  const targetSize = getTargetSize();
  camera.aspect = targetSize[0] / targetSize[1];
  camera.updateProjectionMatrix();
  renderer.setSize(...targetSize);
}

// Export controls for the example panel
export const controlsConfig = {
  'Mouse Size': {
    initial: 0.12,
    min: 0.1,
    max: 0.3,
    step: 0.01,
    onSliderChange: (value: number) => {
      mouseSize.node.value = value;
    },
  },
  'Mouse Deep': {
    initial: 0.5,
    min: 0.1,
    max: 1,
    step: 0.01,
    onSliderChange: (value: number) => {
      mouseDeep.node.value = value;
    },
  },
  'Viscosity': {
    initial: 0.96,
    min: 0.9,
    max: 0.96,
    step: 0.001,
    onSliderChange: (value: number) => {
      viscosity.node.value = value;
    },
  },
  'Ducks Enabled': {
    initial: true,
    onToggleChange: (value: boolean) => {
      ducksEnabled = value;
      duckMesh.visible = value;
    },
  },
};

export function onCleanup() {
  canvas.removeEventListener('pointermove', onPointerMove);
  canvas.removeEventListener('pointerdown', onPointerDown);
  canvas.removeEventListener('pointerup', onPointerUp);
  renderer.dispose();
}
