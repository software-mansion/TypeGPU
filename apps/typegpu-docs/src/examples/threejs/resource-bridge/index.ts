import * as t3 from '@typegpu/three';
import * as TSL from 'three/tsl';
import * as THREE from 'three/webgpu';
import { d, std } from 'typegpu';

const GRID_SIZE = 7;
const INSTANCE_COUNT = GRID_SIZE * GRID_SIZE;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
await renderer.init();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090b17);

const camera = new THREE.PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
camera.position.set(7.5, 8, 10);
camera.lookAt(0, 0, 0);

// A custom scalar attribute exercises NodeAttribute in both shader stages. In
// the fragment stage Three.js automatically turns it into an interpolated varying.
const geometry = new THREE.PlaneGeometry(0.82, 0.82, 8, 8);
geometry.rotateX(-Math.PI / 2);

const positions = geometry.getAttribute('position');
const bridgeWeightValues = new Float32Array(positions.count);
for (let i = 0; i < positions.count; i++) {
  const x = positions.getX(i) / 0.41;
  const z = positions.getZ(i) / 0.41;
  bridgeWeightValues[i] = 1 - Math.min(1, Math.hypot(x, z));
}
geometry.setAttribute('bridgeWeight', new THREE.BufferAttribute(bridgeWeightValues, 1));

// Each element is [grid x, grid z, animation phase, palette selector]. The
// access from TypeGPU becomes a direct read from Three.js's storage buffer.
const instanceValues = new Float32Array(INSTANCE_COUNT * 4);
for (let z = 0; z < GRID_SIZE; z++) {
  for (let x = 0; x < GRID_SIZE; x++) {
    const index = z * GRID_SIZE + x;
    const offset = index * 4;
    instanceValues[offset] = x - (GRID_SIZE - 1) / 2;
    instanceValues[offset + 1] = z - (GRID_SIZE - 1) / 2;
    instanceValues[offset + 2] = (x + z) * 0.42;
    instanceValues[offset + 3] = index / (INSTANCE_COUNT - 1);
  }
}
const instanceData = t3.instancedArray(instanceValues, d.vec4f);

// These cover scalar, vector, dynamically updated, and array uniforms.
const elapsedSeconds = t3.uniform(0, d.f32);
const waveAmplitude = t3.uniform(0.52, d.f32);
const waveFrequency = t3.uniform(2.4, d.f32);
const globalTint = t3.uniform(new THREE.Vector3(0.92, 0.97, 1), d.vec3f);
const palette = t3.uniformArray(
  [
    new THREE.Vector4(0.08, 0.35, 0.95, 1),
    new THREE.Vector4(0.15, 0.9, 0.75, 1),
    new THREE.Vector4(1, 0.65, 0.12, 1),
    new THREE.Vector4(0.95, 0.16, 0.48, 1),
  ],
  d.vec4f,
);

// A tiny generated texture avoids an external asset while still exercising the
// TextureNode path, whose sampled value is a local variable in Three.js main().
const diagnosticTexture = new THREE.DataTexture(
  new Uint8Array([255, 255, 255, 255, 48, 64, 110, 255, 48, 64, 110, 255, 255, 255, 255, 255]),
  2,
  2,
  THREE.RGBAFormat,
);
diagnosticTexture.wrapS = THREE.RepeatWrapping;
diagnosticTexture.wrapT = THREE.RepeatWrapping;
diagnosticTexture.magFilter = THREE.NearestFilter;
diagnosticTexture.minFilter = THREE.NearestFilter;
diagnosticTexture.needsUpdate = true;

const positionAttribute = t3.fromTSL(TSL.attribute('position', 'vec3'), d.vec3f);
const bridgeWeightAttribute = t3.fromTSL(TSL.attribute('bridgeWeight', 'float'), d.f32);

// This varying is intentionally consumed only in the vertex stage. Three.js
// optimizes it into a local NodeVar, so @typegpu/three must use a bridge var.
const vertexOnlyVarying = t3.fromTSL(
  TSL.varying(TSL.attribute('bridgeWeight', 'float').mul(0.75).add(0.25), 'vVertexOnly'),
  d.f32,
);

// This one crosses from vertex to fragment. It tests both sides of WGSL's
// asymmetric varying representation: module-private output vs main() input.
const interpolatedSignalNode = TSL.varying(TSL.vec4(), 'vResourceBridgeSignal');
const interpolatedSignal = t3.fromTSL(interpolatedSignalNode, d.vec4f);

const sampledPattern = t3.fromTSL(TSL.texture(diagnosticTexture, TSL.uv().mul(5)), d.vec4f);
const uv = t3.uv();

const samplePalette = (selector: number) => {
  'use gpu';
  const low = std.mix(palette.$[0].rgb, palette.$[1].rgb, std.saturate(selector * 2));
  const high = std.mix(palette.$[2].rgb, palette.$[3].rgb, std.saturate(selector * 2 - 1));
  return std.mix(low, high, std.step(0.5, selector));
};

const material = new THREE.MeshBasicNodeMaterial({
  side: THREE.DoubleSide,
});

material.positionNode = t3.toTSL(() => {
  'use gpu';
  const instanceIndex = t3.instanceIndex.$;
  const instance = instanceData.$[instanceIndex];
  const position = d.vec3f(positionAttribute.$);
  const weight = bridgeWeightAttribute.$;
  const vertexLocal = vertexOnlyVarying.$;

  const phase = elapsedSeconds.$ * 1.35 + instance.z + position.x * waveFrequency.$;
  const wave = std.sin(phase) * waveAmplitude.$;
  const lift = wave * (0.2 + weight * 0.8) + vertexLocal * 0.08;

  interpolatedSignal.$.x = (wave / waveAmplitude.$) * 0.5 + 0.5;
  interpolatedSignal.$.y = instance.w;
  interpolatedSignal.$.z = weight;
  interpolatedSignal.$.w = vertexLocal;

  return position + d.vec3f(instance.x, lift, instance.y);
});

material.colorNode = t3.toTSL(() => {
  'use gpu';
  const signal = interpolatedSignal.$;
  const attributeWeight = bridgeWeightAttribute.$;
  const textureValue = sampledPattern.$;
  const localUv = uv.$;

  // Reading the same varying from the accessor again stresses dependency
  // de-duplication in TgpuFnNode.generate().
  const repeatedWaveRead = interpolatedSignal.$.x;
  const paletteColor = samplePalette(signal.y);
  const centeredUv = std.abs(localUv - 0.5);
  const borderDistance = std.max(centeredUv.x, centeredUv.y);
  const edgeMask = 1 - std.smoothstep(0.4, 0.49, borderDistance);
  const textureLight = 0.45 + textureValue.r * 0.55;
  const waveLight = 0.72 + repeatedWaveRead * 0.28;
  const centerLight = 0.82 + attributeWeight * 0.18;
  const color = paletteColor * globalTint.$ * textureLight * waveLight * centerLight * edgeMask;

  return d.vec4f(std.saturate(color), 1);
});

const mesh = new THREE.InstancedMesh(geometry, material, INSTANCE_COUNT);
const identity = new THREE.Matrix4();
for (let i = 0; i < INSTANCE_COUNT; i++) {
  mesh.setMatrixAt(i, identity);
}
mesh.instanceMatrix.needsUpdate = true;
scene.add(mesh);

// Compile eagerly so this example doubles as a deterministic bridge smoke test.
await renderer.compileAsync(scene, camera);

const resizeObserver = new ResizeObserver(() => {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
});
resizeObserver.observe(canvas);

void renderer.setAnimationLoop((milliseconds) => {
  elapsedSeconds.node.value = milliseconds * 0.001;
  renderer.render(scene, camera);
});

export function onCleanup() {
  void renderer.setAnimationLoop(null);
  resizeObserver.disconnect();
  geometry.dispose();
  material.dispose();
  diagnosticTexture.dispose();
  renderer.dispose();
}
