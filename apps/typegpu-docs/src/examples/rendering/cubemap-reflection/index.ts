import tgpu, { d } from 'typegpu';

import { type CubemapNames } from './cubemap.ts';
import { defineControls } from '../../common/defineControls.ts';
import { setupScene } from './scene.ts';

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('WebGPU not supported');
}

const maxBufferSize = adapter.limits.maxStorageBufferBindingSize;
const maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
const maxSize = Math.min(maxBufferSize, maxStorageBufferBindingSize);
const device = await adapter.requestDevice({
  requiredLimits: {
    maxStorageBufferBindingSize: maxSize,
    maxBufferSize: maxSize,
  },
});
const root = tgpu.initFromDevice({ device });

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const scene = await setupScene(root, context);

// #region Example controls and cleanup

export const controls = defineControls({
  subdivisions: {
    initial: 2,
    min: 0,
    max: 10,
    step: 1,
    onSliderChange(value) {
      scene.subdivisions = value;
    },
  },
  'smooth normals': {
    initial: false,
    onToggleChange: (value) => {
      scene.smoothNormals = value;
    },
  },
  'cubemap texture': {
    initial: 'campsite',
    options: ['campsite', 'beach', 'chapel', 'city'],
    onSelectChange: async (value) => {
      scene.cubemapTexture = value as CubemapNames;
    },
  },
  'ambient color': {
    initial: d.vec3f(0.1, 0.1, 0.1),
    onColorChange: (value) => {
      scene.ambientColor = value;
    },
  },
  'diffuse color': {
    initial: d.vec3f(0.3, 0.3, 0.3),
    onColorChange: (value) => {
      scene.diffuseColor = value;
    },
  },
  'specular color': {
    initial: d.vec3f(0.8, 0.8, 0.8),
    onColorChange: (value) => {
      scene.specularColor = value;
    },
  },
  shininess: {
    initial: 32,
    min: 1,
    max: 128,
    step: 1,
    onSliderChange: (value) => {
      scene.shininess = value;
    },
  },
  reflectivity: {
    initial: 0.7,
    min: 0,
    max: 1,
    step: 0.1,
    onSliderChange: (value) => {
      scene.reflectivity = value;
    },
  },
});

export function onCleanup() {
  scene.onCleanup();
  root.destroy();
}

// #endregion
