/*
 * Based on: https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_cloth.html
 */

import { d, std } from 'typegpu';
import * as THREE from 'three/webgpu';
import * as t3 from '@typegpu/three';
import * as TSL from 'three/tsl';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { UltraHDRLoader } from 'three/addons/loaders/UltraHDRLoader.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import { clothNumSegmentsX, clothNumSegmentsY, VerletSimulation } from './verlet.ts';
import { defineControls } from '../../common/defineControls.ts';

const sphereRadius = 0.15;
const spherePositionUniform = t3.uniform(new THREE.Vector3(0, 0, 0), d.vec3f);
const sphereUniform = t3.uniform(1.0, d.f32);

const patternUniforms = {
  color1: t3.uniform(new THREE.Vector4(0.9, 0.3, 0.3, 1), d.vec4f),
  color2: t3.uniform(new THREE.Vector4(1, 0.5, 0.4, 1), d.vec4f),
};

const verletSim = new VerletSimulation({
  sphereRadius,
  sphereUniform,
  spherePositionUniform,
});

let vertexWireframeObject: THREE.Mesh, springWireframeObject: THREE.Line;
let clothMaterial: THREE.MeshPhysicalNodeMaterial;
let timeSinceLastStep = 0;
let timestamp = 0;

const clock = new THREE.Clock();

const params = {
  wireframe: false,
  sphere: true,
  wind: 1,
};

const API = {
  sheenColor: 0xffffff, // sRGB
};

if (!WebGPU.isAvailable()) {
  document.body.appendChild(WebGPU.getErrorMessage());

  throw new Error('No WebGPU support');
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const renderer = new THREE.WebGPURenderer({
  antialias: true,
  canvas,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
// Sphere
const geometry = new THREE.IcosahedronGeometry(sphereRadius * 0.95, 4);
const material = new THREE.MeshStandardNodeMaterial();
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 10);
camera.position.set(-1.6, -0.1, -1.6);

const cameraControls = new OrbitControls(camera, canvas);
cameraControls.minDistance = 1;
cameraControls.maxDistance = 3;
cameraControls.target.set(0, -0.1, 0);
cameraControls.update();

const hdrLoader = new UltraHDRLoader().setPath(
  'https://threejs.org/examples/textures/equirectangular/',
);

const hdrTexture = await hdrLoader.loadAsync('royal_esplanade_2k.hdr.jpg');
hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
scene.background = hdrTexture;
scene.backgroundBlurriness = 0.5;
scene.environment = hdrTexture;

setupWireframe();
const clothMesh = setupClothMesh();

void renderer.setAnimationLoop(render);

function setupWireframe() {
  // adds helpers to visualize the verlet system

  // verlet vertex visualizer
  const vertexWireframeMaterial = new THREE.SpriteNodeMaterial();
  vertexWireframeMaterial.positionNode = verletSim.vertexPositionBuffer.node.element(
    TSL.instanceIndex,
  );
  vertexWireframeObject = new THREE.Mesh(
    new THREE.PlaneGeometry(0.01, 0.01),
    vertexWireframeMaterial,
  );
  vertexWireframeObject.frustumCulled = false;
  vertexWireframeObject.count = verletSim.vertices.length;
  scene.add(vertexWireframeObject);

  // verlet spring visualizer
  const springWireframePositionBuffer = new THREE.BufferAttribute(new Float32Array(6), 3, false);
  const springWireframeIndexBuffer = new THREE.BufferAttribute(new Uint32Array([0, 1]), 1, false);
  const springWireframeMaterial = new THREE.LineBasicNodeMaterial();
  const vertexIndex = t3.fromTSL(TSL.attribute('vertexIndex'), d.f32);
  springWireframeMaterial.positionNode = t3.toTSL(() => {
    'use gpu';
    const vertexIds = verletSim.springVertexIdBuffer.$[t3.instanceIndex.$];
    const vertexId = std.select(vertexIds.x, vertexIds.y, vertexIndex.$ === 0);
    return verletSim.vertexPositionBuffer.$[vertexId];
  });

  const springWireframeGeometry = new THREE.InstancedBufferGeometry();
  springWireframeGeometry.setAttribute('position', springWireframePositionBuffer);
  springWireframeGeometry.setAttribute('vertexIndex', springWireframeIndexBuffer);
  springWireframeGeometry.instanceCount = verletSim.springs.length;

  springWireframeObject = new THREE.Line(springWireframeGeometry, springWireframeMaterial);
  springWireframeObject.frustumCulled = false;
  springWireframeObject.count = verletSim.springs.length;
  scene.add(springWireframeObject);
}

function setupClothMesh(): THREE.Mesh {
  // This function generates a three Geometry and Mesh to render the cloth based on the verlet systems position data.
  // Therefore it creates a plane mesh, in which each vertex will be centered in the center of 4 verlet vertices.

  const vertexCount = clothNumSegmentsX * clothNumSegmentsY;
  const geometry = new THREE.BufferGeometry();

  // verletVertexIdArray will hold the 4 verlet vertex ids that contribute to each geometry vertex's position
  const verletVertexIdArray = new Uint32Array(vertexCount * 4);
  const indices = [];

  const getIndex = (x: number, y: number) => {
    return y * clothNumSegmentsX + x;
  };

  const vertexUvArray = new Float32Array(vertexCount * 2);
  for (let x = 0; x < clothNumSegmentsX; x++) {
    for (let y = 0; y < clothNumSegmentsX; y++) {
      const index = getIndex(x, y);
      verletVertexIdArray[index * 4] = verletSim.vertexColumns[x][y].id;
      verletVertexIdArray[index * 4 + 1] = verletSim.vertexColumns[x + 1][y].id;
      verletVertexIdArray[index * 4 + 2] = verletSim.vertexColumns[x][y + 1].id;
      verletVertexIdArray[index * 4 + 3] = verletSim.vertexColumns[x + 1][y + 1].id;

      vertexUvArray[index * 2] = x / clothNumSegmentsX;
      vertexUvArray[index * 2 + 1] = y / clothNumSegmentsY;

      if (x > 0 && y > 0) {
        indices.push(getIndex(x, y), getIndex(x - 1, y), getIndex(x - 1, y - 1));
        indices.push(getIndex(x, y), getIndex(x - 1, y - 1), getIndex(x, y - 1));
      }
    }
  }

  const verletVertexIdBuffer = new THREE.BufferAttribute(verletVertexIdArray, 4, false);
  const positionBuffer = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3, false);
  const uvBuffer = new THREE.BufferAttribute(vertexUvArray, 2, false);
  geometry.setAttribute('position', positionBuffer);
  geometry.setAttribute('uv', uvBuffer);
  geometry.setAttribute('vertexIds', verletVertexIdBuffer);
  geometry.setIndex(indices);

  clothMaterial = new THREE.MeshPhysicalNodeMaterial({
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    sheen: 1.0,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color().setHex(API.sheenColor),
  });

  const checkerBoard = (uv: d.v2f): number => {
    'use gpu';
    const fuv = std.floor(uv);
    return std.abs(fuv.x + fuv.y) % 2;
  };

  clothMaterial.colorNode = t3.toTSL(() => {
    'use gpu';
    const uv = t3.uv().$;
    const pattern = checkerBoard(uv * 5);
    return std.mix(patternUniforms.color1.$, patternUniforms.color2.$, pattern);
  });

  clothMaterial.positionNode = TSL.Fn(({ material }) => {
    // gather the position of the 4 verlet vertices and calculate the center position and normal from that
    const vertexIds = TSL.attribute('vertexIds');
    const v3 = verletSim.vertexPositionBuffer.node.element(vertexIds.w).toVar();
    const v0 = verletSim.vertexPositionBuffer.node.element(vertexIds.x).toVar();
    const v1 = verletSim.vertexPositionBuffer.node.element(vertexIds.y).toVar();
    const v2 = verletSim.vertexPositionBuffer.node.element(vertexIds.z).toVar();

    const top = v0.add(v1);
    const right = v1.add(v3);
    const bottom = v2.add(v3);
    const left = v0.add(v2);

    const tangent = right.sub(left).normalize();
    const bitangent = bottom.sub(top).normalize();

    const normal = TSL.cross(tangent, bitangent);

    // send the normalView from the vertex shader to the fragment shader
    // @ts-expect-error: `normalNode` is not on the type, but it exists
    material.normalNode = TSL.transformNormalToView(normal).toVarying();

    return v0.add(v1).add(v2).add(v3).mul(0.25);
  })();

  const clothMesh = new THREE.Mesh(geometry, clothMaterial);
  clothMesh.frustumCulled = false;
  scene.add(clothMesh);
  return clothMesh;
}

function updateSphere() {
  sphere.position.set(Math.sin(timestamp * 2.1) * 0.1, 0, Math.sin(timestamp * 0.8));
  spherePositionUniform.node.value.copy(sphere.position);
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

async function render() {
  sphere.visible = params.sphere;
  sphereUniform.node.value = params.sphere ? 1 : 0;
  verletSim.windUniform.node.value = params.wind;
  clothMesh.visible = !params.wireframe;
  vertexWireframeObject.visible = params.wireframe;
  springWireframeObject.visible = params.wireframe;

  const deltaTime = Math.min(clock.getDelta(), 1 / 60); // don't advance the time too far, for example when the window is out of focus
  const stepsPerSecond = 360; // ensure the same amount of simulation steps per second on all systems, independent of refresh rate
  const timePerStep = 1 / stepsPerSecond;

  timeSinceLastStep += deltaTime;

  while (timeSinceLastStep >= timePerStep) {
    // run a verlet system simulation step
    timestamp += timePerStep;
    timeSinceLastStep -= timePerStep;
    updateSphere();
    await verletSim.update(renderer);
  }

  renderer.render(scene, camera);
}

// #region Example controls and cleanup
export const controls = defineControls({
  Stiffness: {
    initial: 0.2,
    min: 0.1,
    max: 0.7,
    step: 0.01,
    onSliderChange: (value: number) => {
      verletSim.stiffnessUniform.node.value = value;
    },
  },
  'Pattern Color 1': {
    initial: d.vec3f(204, 144, 250).div(255),
    onColorChange: (value) => {
      patternUniforms.color1.node.value.set(value[0], value[1], value[2], 1);
    },
  },
  'Pattern Color 2': {
    initial: d.vec3f(100, 125, 228).div(255),
    onColorChange: (value) => {
      patternUniforms.color2.node.value.set(value[0], value[1], value[2], 1);
    },
  },
  Roughness: {
    initial: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => {
      clothMaterial.roughness = value;
    },
  },
  Sheen: {
    initial: 1.0,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => {
      clothMaterial.sheen = value;
    },
  },
  'Sheen Roughness': {
    initial: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => {
      clothMaterial.sheenRoughness = value;
    },
  },
  'Sheen Color': {
    initial: d.vec3f(
      ((API.sheenColor >> 16) & 0xff) / 255,
      ((API.sheenColor >> 8) & 0xff) / 255,
      (API.sheenColor & 0xff) / 255,
    ),
    onColorChange: (value) => {
      const color = new THREE.Color().fromArray(value);
      API.sheenColor = color.getHex();
      clothMaterial.sheenColor = color;
    },
  },
  Wind: {
    initial: 1,
    min: 0,
    max: 5,
    step: 0.01,
    onSliderChange: (value) => {
      params.wind = value;
    },
  },
});

export function onCleanup() {
  observer.disconnect();
  renderer.dispose();
}

// #endregion
