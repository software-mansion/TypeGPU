/*
 * Based on: https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_compute_cloth.html
 */

import * as d from 'typegpu/data';
import * as THREE from 'three/webgpu';
import * as t3 from '@typegpu/three';
import * as std from 'typegpu/std';

import * as TSL from 'three/tsl';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import {
  clothNumSegmentsX,
  clothNumSegmentsY,
  VerletSimulation,
} from './verlet.ts';

const sphereRadius = 0.15;
const spherePositionUniform = t3.fromTSL(
  TSL.uniform(new THREE.Vector3(0, 0, 0)),
  d.vec3f,
);
const sphereUniform = t3.fromTSL(TSL.uniform(1.0), d.f32);
const verletSim = new VerletSimulation({
  sphereRadius,
  sphereUniform,
  spherePositionUniform,
});

let vertexWireframeObject: THREE.Mesh, springWireframeObject: THREE.Line;
let timeSinceLastStep = 0;
let timestamp = 0;

const clock = new THREE.Clock();

const params = {
  wireframe: false,
  sphere: true,
  wind: 1,
};

const API = {
  color: 0x204080, // sRGB
  sheenColor: 0xffffff, // sRGB
};

// TODO: Fix example with WebGL backend

if (WebGPU.isAvailable() === false) {
  document.body.appendChild(WebGPU.getErrorMessage());

  throw new Error('No WebGPU support');
}

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const canvasResizeContainer = canvas.parentElement
  ?.parentElement as HTMLDivElement;

const getTargetSize = () => {
  return [
    canvasResizeContainer.clientWidth,
    canvasResizeContainer.clientHeight,
  ] as [number, number];
};

const initialSize = getTargetSize();
const renderer = new THREE.WebGPURenderer({
  antialias: true,
  canvas,
});
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(...initialSize);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
// Sphere
const geometry = new THREE.IcosahedronGeometry(sphereRadius * 0.95, 4);
const material = new THREE.MeshStandardNodeMaterial();
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

const camera = new THREE.PerspectiveCamera(
  40,
  initialSize[0] / initialSize[1],
  0.01,
  10,
);
camera.position.set(-1.6, -0.1, -1.6);

const controls = new OrbitControls(camera, canvas);
controls.minDistance = 1;
controls.maxDistance = 3;
controls.target.set(0, -0.1, 0);
controls.update();

const hdrLoader = new HDRLoader().setPath(
  'https://threejs.org/examples/textures/equirectangular/',
);

const hdrTexture = await hdrLoader.loadAsync('royal_esplanade_1k.hdr');
hdrTexture.mapping = THREE.EquirectangularReflectionMapping;
scene.background = hdrTexture;
scene.backgroundBlurriness = 0.5;
scene.environment = hdrTexture;

setupWireframe();
const clothMesh = setupClothMesh();

renderer.setAnimationLoop(render);

function setupWireframe() {
  // adds helpers to visualize the verlet system

  // verlet vertex visualizer
  const vertexWireframeMaterial = new THREE.SpriteNodeMaterial();
  vertexWireframeMaterial.positionNode = verletSim.vertexPositionBuffer.node
    .element(TSL.instanceIndex);
  vertexWireframeObject = new THREE.Mesh(
    new THREE.PlaneGeometry(0.01, 0.01),
    vertexWireframeMaterial,
  );
  vertexWireframeObject.frustumCulled = false;
  vertexWireframeObject.count = verletSim.vertices.length;
  scene.add(vertexWireframeObject);

  // verlet spring visualizer
  const springWireframePositionBuffer = new THREE.BufferAttribute(
    new Float32Array(6),
    3,
    false,
  );
  const springWireframeIndexBuffer = new THREE.BufferAttribute(
    new Uint32Array([0, 1]),
    1,
    false,
  );
  const springWireframeMaterial = new THREE.LineBasicNodeMaterial();
  const vertexIndex = t3.fromTSL(TSL.attribute('vertexIndex'), d.u32);
  springWireframeMaterial.positionNode = t3.toTSL(() => {
    'use gpu';
    const vertexIds = verletSim.springVertexIdBuffer.$[t3.instanceIndex.$];
    const vertexId = std.select(vertexIds.x, vertexIds.y, vertexIndex.$ === 0);
    return verletSim.vertexPositionBuffer.$[vertexId];
  });

  const springWireframeGeometry = new THREE.InstancedBufferGeometry();
  springWireframeGeometry.setAttribute(
    'position',
    springWireframePositionBuffer,
  );
  springWireframeGeometry.setAttribute(
    'vertexIndex',
    springWireframeIndexBuffer,
  );
  springWireframeGeometry.instanceCount = verletSim.springs.length;

  springWireframeObject = new THREE.Line(
    springWireframeGeometry,
    springWireframeMaterial,
  );
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
      verletVertexIdArray[index * 4 + 3] =
        verletSim.vertexColumns[x + 1][y + 1].id;

      vertexUvArray[index * 2] = x / clothNumSegmentsX;
      vertexUvArray[index * 2 + 1] = y / clothNumSegmentsY;

      if (x > 0 && y > 0) {
        indices.push(
          getIndex(x, y),
          getIndex(x - 1, y),
          getIndex(x - 1, y - 1),
        );
        indices.push(
          getIndex(x, y),
          getIndex(x - 1, y - 1),
          getIndex(x, y - 1),
        );
      }
    }
  }

  const verletVertexIdBuffer = new THREE.BufferAttribute(
    verletVertexIdArray,
    4,
    false,
  );
  const positionBuffer = new THREE.BufferAttribute(
    new Float32Array(vertexCount * 3),
    3,
    false,
  );
  const uvBuffer = new THREE.BufferAttribute(
    vertexUvArray,
    2,
    false,
  );
  geometry.setAttribute('position', positionBuffer);
  geometry.setAttribute('uv', uvBuffer);
  geometry.setAttribute('vertexIds', verletVertexIdBuffer);
  geometry.setIndex(indices);

  const clothMaterial = new THREE.MeshPhysicalNodeMaterial({
    color: new THREE.Color().setHex(API.color),
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
    const pattern = checkerBoard(uv.mul(5));
    return std.mix(d.vec4f(0.4, 0.3, 0.3, 1), d.vec4f(1, 0.5, 0.4, 1), pattern);
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

function onWindowResize() {
  camera.aspect = canvasResizeContainer.clientWidth /
    canvasResizeContainer.clientHeight;
  canvas.width = canvasResizeContainer.clientWidth;
  canvas.height = canvasResizeContainer.clientHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    canvasResizeContainer.clientWidth,
    canvasResizeContainer.clientHeight,
  );
}

function updateSphere() {
  sphere.position.set(
    Math.sin(timestamp * 2.1) * 0.1,
    0,
    Math.sin(timestamp * 0.8),
  );
  spherePositionUniform.node.value.copy(sphere.position);
}

async function render() {
  const targetSize = getTargetSize();
  const rendererSize = renderer.getSize(new THREE.Vector2());
  if (
    targetSize[0] !== rendererSize.width ||
    targetSize[1] !== rendererSize.height
  ) {
    onWindowResize();
  }

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

  await renderer.renderAsync(scene, camera);
}
