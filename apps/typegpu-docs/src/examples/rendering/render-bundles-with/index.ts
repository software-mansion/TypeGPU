import { perlin2d } from '@typegpu/noise';
import tgpu, { d } from 'typegpu';
import * as m from 'wgpu-matrix';
import { defineControls } from '../../common/defineControls.ts';
import { setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { createCubeGeometry } from './geometry.ts';
import {
  Camera,
  cameraLayout,
  Cube,
  cubeLayout,
  terrainLayout,
  TerrainParams,
  vertexLayout,
} from './schemas.ts';
import { fragmentFn, vertexFn } from './shaders.ts';

const CUBE_COUNTS = [
  1024,
  4096,
  8192,
  16384,
  32768,
  65536,
  131072,
  262144,
  524288,
];
const INITIAL_CUBE_COUNT = CUBE_COUNTS[0];
const TERRAIN_SIZE = 50;
const TERRAIN_HEIGHT = 6;
const NOISE_SCALE = 0.3;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const perlinCache = perlin2d.staticCache({ root, size: d.vec2u(16, 16) });

const cubeVerts = createCubeGeometry();
const VERTS_PER_CUBE = cubeVerts.length;

const vertexBuffer = root
  .createBuffer(vertexLayout.schemaForCount(VERTS_PER_CUBE), cubeVerts)
  .$usage('vertex');

const cameraBuffer = root.createBuffer(Camera).$usage('uniform');

const terrainBuffer = root
  .createBuffer(TerrainParams, {
    terrainHeight: TERRAIN_HEIGHT,
    noiseScale: NOISE_SCALE,
  })
  .$usage('uniform');

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(0, 10, 30, 1),
    target: d.vec4f(0, 0, 0, 1),
    minZoom: 5,
    maxZoom: 100,
  },
  (updates) => cameraBuffer.writePartial(updates),
);

const cameraBindGroup = root.createBindGroup(cameraLayout, {
  camera: cameraBuffer,
});

const terrainBindGroup = root.createBindGroup(terrainLayout, {
  terrain: terrainBuffer,
});

const pipeline = root
  .pipe(perlinCache.inject())
  .createRenderPipeline({
    attribs: vertexLayout.attrib,
    vertex: vertexFn,
    fragment: fragmentFn,
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

let depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

let cubeCount = INITIAL_CUBE_COUNT;
let cubeData: d.Infer<typeof Cube>[] = [];
let cubeBuffer = root
  .createBuffer(d.arrayOf(Cube, INITIAL_CUBE_COUNT))
  .$usage('storage');
let cubeBindGroup = root.createBindGroup(cubeLayout, { cubes: cubeBuffer });
let renderBundle: GPURenderBundle;

let prepared = pipeline
  .with(cameraBindGroup)
  .with(cubeBindGroup)
  .with(terrainBindGroup)
  .with(vertexLayout, vertexBuffer);

function generateCubes(count: number) {
  cubeData = [];

  const gridRes = Math.ceil(Math.sqrt(count));
  const cubeScale = TERRAIN_SIZE / gridRes;
  const half = TERRAIN_SIZE / 2;

  for (let i = 0; i < count; i++) {
    const gx = i % gridRes;
    const gz = Math.floor(i / gridRes);

    const x = gx * cubeScale - half + cubeScale * 0.5;
    const z = gz * cubeScale - half + cubeScale * 0.5;

    const model = m.mat4.translation([x, 0, z], d.mat4x4f());
    m.mat4.scale(model, [cubeScale, cubeScale, cubeScale], model);

    cubeData.push({ model });
  }
}

function buildBundle(): GPURenderBundle {
  const bundleEncoder = root.device.createRenderBundleEncoder({
    colorFormats: [presentationFormat],
    depthStencilFormat: 'depth24plus',
  });

  const withEncoder = prepared.with(bundleEncoder);
  for (let i = 0; i < cubeCount; i++) {
    withEncoder.draw(VERTS_PER_CUBE, 1, 0, i);
  }
  return bundleEncoder.finish();
}

function setCubeCount(count: number) {
  cubeCount = count;
  generateCubes(count);

  cubeBuffer.destroy();
  cubeBuffer = root
    .createBuffer(d.arrayOf(Cube, count), cubeData)
    .$usage('storage');
  cubeBindGroup = root.createBindGroup(cubeLayout, { cubes: cubeBuffer });

  // Rebuild the prepared pipeline since cubeBindGroup changed.
  prepared = pipeline
    .with(cameraBindGroup)
    .with(cubeBindGroup)
    .with(terrainBindGroup)
    .with(vertexLayout, vertexBuffer);
  renderBundle = buildBundle();
}

setCubeCount(INITIAL_CUBE_COUNT);

let useBundles = true;

let disposed = false;

function frame() {
  if (disposed) return;

  if (
    depthTexture.width !== canvas.width ||
    depthTexture.height !== canvas.height
  ) {
    depthTexture.destroy();
    depthTexture = root.device.createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }

  const encoder = root.device.createCommandEncoder();

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [1, 0.85, 0.74, 1] as const,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      },
    ],
    depthStencilAttachment: {
      view: depthTexture.createView(),
      depthClearValue: 1,
      depthLoadOp: 'clear' as const,
      depthStoreOp: 'store' as const,
    },
  });

  if (useBundles) {
    pass.executeBundles([renderBundle]);
  } else {
    const withPass = prepared.with(pass);
    for (let i = 0; i < cubeCount; i++) {
      withPass.draw(VERTS_PER_CUBE, 1, 0, i);
    }
  }

  pass.end();
  root.device.queue.submit([encoder.finish()]);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// #region Example controls and cleanup

export const controls = defineControls({
  'cube count': {
    initial: INITIAL_CUBE_COUNT,
    options: CUBE_COUNTS,
    onSelectChange: (value: number) => {
      setCubeCount(value);
    },
  },
  'use render bundles': {
    initial: true,
    onToggleChange: (value: boolean) => {
      useBundles = value;
    },
  },
});

export function onCleanup() {
  disposed = true;
  cleanupCamera();
  perlinCache.destroy();
  depthTexture.destroy();
  root.destroy();
}
