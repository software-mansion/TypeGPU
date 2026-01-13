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
import {
  BOUNCE_DAMPING,
  BOUNDS,
  DUCK_STRIDE,
  INITIAL_MOUSE_DEEP,
  INITIAL_MOUSE_SIZE,
  INITIAL_VISCOSITY,
  limit,
  LINEAR_DAMPING,
  NUM_DUCKS,
  SPEED,
  SUN_POSITION,
  VERTICAL_RESPONSE_FACTOR,
  WATER_PUSH_FACTOR,
  WIDTH,
  Y_OFFSET,
} from './consts.ts';
import { initializeHeightArrays } from './utils.ts';
import { createGpuHelpers } from './gpuHelpers.ts';

// Struct schemas for GPU function return types

if (WebGPU.isAvailable() === false) {
  document.body.appendChild(WebGPU.getErrorMessage());
  throw new Error('No WebGPU support');
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const renderer = new THREE.WebGPURenderer({ antialias: true, canvas });
await renderer.init();
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  75,
  1,
  1,
  3000,
);
camera.position.set(0, 2.0, 4);
camera.lookAt(0, 0, 0);

const orbitControls = new OrbitControls(camera, canvas);

const sun = new THREE.DirectionalLight(0xffffff, 4.0);
sun.position.set(SUN_POSITION[0], SUN_POSITION[1], SUN_POSITION[2]);
scene.add(sun);

// Initialize height storage buffers
const { heightArray, prevHeightArray } = initializeHeightArrays();

// Ping-pong height storage buffers
const heightStorageA = t3.instancedArray(new Float32Array(heightArray), d.f32);
const heightStorageB = t3.instancedArray(new Float32Array(heightArray), d.f32);
const prevHeightStorage = t3.instancedArray(prevHeightArray, d.f32);

const mousePos = t3.uniform(new THREE.Vector2(), d.vec2f);
const mouseSpeed = t3.uniform(new THREE.Vector2(), d.vec2f);
const mouseDeep = t3.uniform(INITIAL_MOUSE_DEEP, d.f32);
const mouseSize = t3.uniform(INITIAL_MOUSE_SIZE, d.f32);
const viscosity = t3.uniform(INITIAL_VISCOSITY, d.f32);
const readFromA = t3.uniform(1, d.u32);

let mouseDown = false;
let firstClick = true;
let updateOriginMouseDown = false;
const mouseCoords = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let frame = 0;
let pingPong = 0;
let ducksEnabled = true;

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
  const north = heightStorageA.$[neighbors.northIndex];
  const south = heightStorageA.$[neighbors.southIndex];
  const east = heightStorageA.$[neighbors.eastIndex];
  const west = heightStorageA.$[neighbors.westIndex];

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
  let neighborHeight = std.mul(
    std.add(
      std.add(
        std.add(
          heightStorageB.$[neighbors.northIndex],
          heightStorageB.$[neighbors.southIndex],
        ),
        heightStorageB.$[neighbors.eastIndex],
      ),
      heightStorageB.$[neighbors.westIndex],
    ),
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

waterMaterial.normalNode = TSL.transformNormalToView(t3.toTSL(() => {
  'use gpu';
  const normals = getCurrentNormals(d.u32(t3.vertexIndex.$));
  return d.vec3f(normals.normalX, std.neg(normals.normalY), 1.0);
})).toVertexStage();

waterMaterial.positionNode = t3.toTSL(() => {
  'use gpu';
  const vertexIndex = t3.fromTSL(TSL.vertexIndex, d.u32).$;
  const posLocal = t3.fromTSL(TSL.positionLocal, d.vec3f).$;
  return d.vec3f(posLocal.x, posLocal.y, getCurrentHeight(d.u32(vertexIndex)));
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

for (let i = 0; i < NUM_DUCKS; i++) {
  duckPositions[i * DUCK_STRIDE + 0] = (Math.random() - 0.5) * BOUNDS * 0.7;
  duckPositions[i * DUCK_STRIDE + 1] = 0;
  duckPositions[i * DUCK_STRIDE + 2] = (Math.random() - 0.5) * BOUNDS * 0.7;
  duckVelocities[i * 2 + 0] = 0;
  duckVelocities[i * 2 + 1] = 0;
}

const duckPositionStorage = t3.instancedArray(duckPositions, d.vec3f);
const duckVelocityStorage = t3.instancedArray(duckVelocities, d.vec2f);

// ducks compute shader
const computeDucks = t3.toTSL(() => {
  'use gpu';
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

  const waterHeight = getCurrentHeight(d.u32(heightInstanceIndex));
  const normals = getCurrentNormals(d.u32(heightInstanceIndex));

  const targetY = std.add(waterHeight, Y_OFFSET);
  const deltaY = std.sub(targetY, instancePosition.y);
  instancePosition.y = std.add(
    instancePosition.y,
    std.mul(deltaY, VERTICAL_RESPONSE_FACTOR),
  );

  const pushX = std.mul(normals.normalX, WATER_PUSH_FACTOR);
  const pushZ = std.mul(normals.normalY, WATER_PUSH_FACTOR);

  velocity.x = std.mul(velocity.x, LINEAR_DAMPING);
  velocity.y = std.mul(velocity.y, LINEAR_DAMPING);
  velocity.x = std.add(velocity.x, pushX);
  velocity.y = std.add(velocity.y, pushZ);

  instancePosition.x = std.add(instancePosition.x, velocity.x);
  instancePosition.z = std.add(instancePosition.z, velocity.y);

  // Clamp position to pool bounds
  if (instancePosition.x < std.neg(limit)) {
    instancePosition.x = std.neg(limit);
    velocity.x = std.mul(velocity.x, BOUNCE_DAMPING);
  } else if (instancePosition.x > limit) {
    instancePosition.x = limit;
    velocity.x = std.mul(velocity.x, BOUNCE_DAMPING);
  }

  if (instancePosition.z < std.neg(limit)) {
    instancePosition.z = std.neg(limit);
    velocity.y = std.mul(velocity.y, BOUNCE_DAMPING);
  } else if (instancePosition.z > limit) {
    instancePosition.z = limit;
    velocity.y = std.mul(velocity.y, BOUNCE_DAMPING);
  }

  duckPositionStorage.$[idx] = d.vec3f(instancePosition);
  duckVelocityStorage.$[idx] = d.vec2f(velocity);
}).compute(NUM_DUCKS);

// load environment and duck model
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
  return posLocal.add(instancePosition);
});

const duckMesh = new THREE.InstancedMesh(
  duckModel.geometry,
  duckMaterial,
  NUM_DUCKS,
);
scene.add(duckMesh);

// Render loop
renderer.setAnimationLoop(() => {
  raycast();

  frame++;

  // ping pong buffers
  if (frame >= 7 - SPEED) {
    if (pingPong === 0) {
      renderer.compute(computeHeightAtoB);
      readFromA.node.value = 0;
    } else {
      renderer.compute(computeHeightBtoA);
      readFromA.node.value = 1;
    }

    pingPong = 1 - pingPong;

    if (ducksEnabled) {
      renderer.compute(computeDucks);
    }

    frame = 0;
  }

  renderer.render(scene, camera);
});

// #region Example controls and cleanup
// Event handlers
function setMouseCoords(x: number, y: number) {
  const rect = canvas.getBoundingClientRect();
  mouseCoords.set(
    ((x - rect.left) / rect.width) * 2 - 1,
    -((y - rect.top) / rect.height) * 2 + 1,
  );
}

function onPointerDown(event: PointerEvent) {
  if (event.isPrimary === false) return;
  setMouseCoords(event.clientX, event.clientY);
  mouseDown = true;
  firstClick = true;
  updateOriginMouseDown = true;
}

function onPointerUp() {
  mouseDown = false;
  firstClick = false;
  updateOriginMouseDown = false;
  orbitControls.enabled = true;
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
  if (mouseDown && (firstClick || !orbitControls.enabled)) {
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
        orbitControls.enabled = false;
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

const onResize: ResizeObserverCallback = (entries) => {
  const size = entries[0]?.devicePixelContentBoxSize[0];
  if (size) {
    canvas.width = size.inlineSize;
    canvas.height = size.blockSize;
    renderer.setSize(size.inlineSize, size.blockSize, false);
    camera.aspect = size.inlineSize / size.blockSize;
    camera.updateProjectionMatrix();
  }
};

const observer = new ResizeObserver(onResize);
observer.observe(canvas);

// Export controls for the example panel
export const controls = {
  'Mouse Size': {
    initial: INITIAL_MOUSE_SIZE,
    min: 0.1,
    max: 0.3,
    step: 0.01,
    onSliderChange: (value: number) => {
      mouseSize.node.value = value;
    },
  },
  'Mouse Deep': {
    initial: INITIAL_MOUSE_DEEP,
    min: 0.1,
    max: 1,
    step: 0.01,
    onSliderChange: (value: number) => {
      mouseDeep.node.value = value;
    },
  },
  'Viscosity': {
    initial: INITIAL_VISCOSITY,
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
  observer.disconnect();
  renderer.dispose();
}

// #endregion
