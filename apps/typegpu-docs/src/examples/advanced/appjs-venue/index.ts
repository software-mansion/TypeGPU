import { common, d, std, tgpu, type TgpuAccessor } from 'typegpu';
import { hexToRgb } from '@typegpu/color';

import { createControls } from './controls.ts';
import { loadTexture, loadTextureArray } from './load-textures.ts';
import { loadModel, modelVertexLayout } from './model.ts';
import { Camera } from './schema.ts';
import { createSpring } from './spring.ts';

const ASSETS_URL = '/TypeGPU/assets/appjs-venue';

const MSAA_SAMPLES = 4;
const TILE_SIZE = 0.08;
const TILE_ATLAS_RES = 512;
/** Linear depth of the background, well beyond any geometry */
const FAR_DEPTH = 100;
/** Outline strength per world unit of linear depth difference between neighboring pixels */
const DEPTH_EDGE_SENSITIVITY = 1 / 50;
/** Outline strength per unit of normal difference between neighboring pixels */
const NORMAL_EDGE_SENSITIVITY = 1 / 2;

const backgroundColor = hexToRgb('#E0E7FF');
const borderColor = hexToRgb('#222222');

const palette = tgpu.const(d.arrayOf(d.vec3f, 3), [
  hexToRgb('#FFFFFF'),
  hexToRgb('#EEF1FF'),
  hexToRgb('#CCD6FF'),
]);

/**
 * Labels laid on the floor, `scale` is relative to `TILE_SIZE`.
 */
const tiles = [
  { image: 'lunch.png', offset: d.vec3f(-0.25, 0.25, 1.65), scale: 1, angle: 0 },
  { image: 'sponsors-zone.png', offset: d.vec3f(-0.29, 0.01, -0.99), scale: 1, angle: 0 },
  { image: 'conference-stage.png', offset: d.vec3f(-0.28, 0.05, -2), scale: 3, angle: 0 },
  { image: 'expo.png', offset: d.vec3f(-0.655, 0.18, -0.125), scale: 1, angle: 0 },
  { image: 'swm.png', offset: d.vec3f(-0.21, 0.18, -0.125), scale: 1, angle: 0 },
  { image: 'check-in.png', offset: d.vec3f(0.055, 0.01, 0.145), scale: 1, angle: 0 },
  { image: 'bar.png', offset: d.vec3f(0.5, 0, 0.35), scale: 1, angle: 0 },
  { image: 'networking-area.png', offset: d.vec3f(0.41, 0.01, 1.22), scale: 3, angle: 0 },
  { image: 'coffee-bar.png', offset: d.vec3f(0.165, 0.171, -0.27), scale: 1, angle: -Math.PI / 2 },
];

const TileInstance = d.struct({
  offset: d.vec3f,
  angle: d.f32,
  size: d.vec2f,
});

const quadCorners = tgpu.const(d.arrayOf(d.vec2f, 6), [
  d.vec2f(-0.5, -0.5),
  d.vec2f(0.5, -0.5),
  d.vec2f(-0.5, 0.5),
  d.vec2f(0.5, -0.5),
  d.vec2f(0.5, 0.5),
  d.vec2f(-0.5, 0.5),
]);

/**
 * Rotates a 3d vector around the Y axis
 */
function rotateY(v: d.v3f, angle: number) {
  'use gpu';
  const cos = std.cos(angle);
  const sin = std.sin(angle);
  return d.vec3f(v.x * cos - v.z * sin, v.y, v.x * sin + v.z * cos);
}

/**
 * Signed distance function for a rounded 2d box
 * @param point Point to evaluate
 * @param size Half-dimensions of the box
 * @param cornerRadius Box corner radius
 */
function sdRoundedBox2d(point: d.v2f, size: d.v2f, cornerRadius: number) {
  'use gpu';
  const dd = std.abs(point) - size + cornerRadius;
  return std.length(std.max(dd, d.vec2f(0))) + std.min(std.max(dd.x, dd.y), 0) - cornerRadius;
}

/**
 * The architecture and ground plane meshes encode which palette color to use
 * in their UVs, as `-floor(uv.y)`.
 */
function paletteColor(uv: d.v2f) {
  'use gpu';
  const index = std.clamp(d.i32(-std.floor(uv.y)), 0, palette.$.length - 1);
  return d.vec3f(palette.$[index]);
}

// Setup

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const abortController = new AbortController();

const controls = createControls(canvas, {
  signal: abortController.signal,
  bounds: { minX: -1, maxX: 1.5, minZ: -2, maxZ: 2, overshoot: 2 },
  initialAnchor: d.vec2f(0, 1.2),
  initialYaw: (Math.PI / 4) * 0.5,
  maxYawOffset: Math.PI / 4,
  minZoom: 0.6,
  maxZoom: 3,
});

const [
  baseModel,
  outsideModel,
  accessoriesModel,
  groundplanesModel,
  guidelinesModel,
  { texture: tileAtlas, aspects: tileAspects },
  accessoriesTexture,
] = await Promise.all([
  loadModel(root, `${ASSETS_URL}/base.bin`),
  loadModel(root, `${ASSETS_URL}/outside.bin`),
  loadModel(root, `${ASSETS_URL}/accessories.bin`),
  loadModel(root, `${ASSETS_URL}/groundplanes.bin`),
  loadModel(root, `${ASSETS_URL}/guidelines.bin`),
  loadTextureArray(
    root,
    tiles.map((tile) => `${ASSETS_URL}/${tile.image}`),
    TILE_ATLAS_RES,
  ),
  loadTexture(root, `${ASSETS_URL}/accessories.png`),
]);

const tileAtlasView = tileAtlas.createView(d.texture2dArray(d.f32));
const accessoriesView = accessoriesTexture.createView(d.texture2d(d.f32));

const tileInstances = tgpu.const(
  d.arrayOf(TileInstance, tiles.length),
  tiles.map((tile, i) => ({
    offset: tile.offset,
    angle: tile.angle,
    size: d.vec2f(tileAspects[i], 1).mul(TILE_SIZE * tile.scale),
  })),
);

const cameraUniform = root.createUniform(Camera);
const timeUniform = root.createUniform(d.f32);
const fadeInUniform = root.createUniform(d.f32);
const outsideOpacityUniform = root.createUniform(d.f32, 1);

const opacityAccess = tgpu.accessor(d.f32, 1);

const linearSampler = root.createSampler({
  minFilter: 'linear',
  magFilter: 'linear',
});

const tileSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
});

/**
 * Distance from the camera plane, in world units
 */
function viewDepth(position: d.v3f) {
  'use gpu';
  return -(cameraUniform.$.view * d.vec4f(position, 1)).z;
}

function projectToClip(position: d.v3f) {
  'use gpu';
  return cameraUniform.$.viewProjection * d.vec4f(position, 1);
}

// Pipelines

// All colors written into the G-buffer are premultiplied by alpha
const premultipliedBlend = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
} as const;

// Every scene pipeline draws into the same render pass, so they all share the same targets.
// A pipeline that doesn't affect a target outputs `vec4f(0)` into it, which is a no-op with premultiplied blending.
const sceneState = {
  targets: {
    albedo: { format: 'rgba8unorm', blend: premultipliedBlend },
    normal: { format: 'rgba16float', blend: premultipliedBlend },
    depth: { format: 'r16float', blend: premultipliedBlend },
  },
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
  multisample: { count: MSAA_SAMPLES },
} as const;

const createModelPipeline = (
  getAlbedo: (uv: d.v2f) => d.v3f,
  opacity: TgpuAccessor.In<d.F32> = 1,
) =>
  root.with(opacityAccess, opacity).createRenderPipeline({
    ...sceneState,
    attribs: modelVertexLayout.attrib,
    vertex: ({ position, normal, uv }) => {
      'use gpu';
      return {
        $position: projectToClip(position),
        uv,
        worldPosition: position,
        worldNormal: normal,
        depth: viewDepth(position),
      };
    },
    fragment: ({ worldPosition, worldNormal, uv, depth }) => {
      'use gpu';
      // Making the opacity never fade down to 0, leaving a faint ghost near the floor.
      const opacity = std.saturate(opacityAccess.$ + std.saturate(0.3 - worldPosition.y * 1.5));

      return {
        albedo: d.vec4f(getAlbedo(uv), 1) * opacity,
        normal: d.vec4f(worldNormal, 1) * opacity,
        depth: d.vec4f(depth, 0, 0, 1) * opacity,
      };
    },
    primitive: { cullMode: 'back' },
  });

const insidePipeline = createModelPipeline(paletteColor);
const outsidePipeline = createModelPipeline(paletteColor, outsideOpacityUniform);

const accessoriesPipeline = createModelPipeline((uv) => {
  'use gpu';
  return std.textureSample(accessoriesView.$, linearSampler.$, uv).rgb;
});

const groundplanesPipeline = root.createRenderPipeline({
  ...sceneState,
  attribs: modelVertexLayout.attrib,
  vertex: ({ position, uv }) => {
    'use gpu';
    return { $position: projectToClip(position), uv };
  },
  fragment: ({ uv }) => {
    'use gpu';
    const dist = sdRoundedBox2d(std.fract(uv) - 1, d.vec2f(0.75), 0.5);
    const opacity = std.smoothstep(std.fwidth(uv.x), 0, dist);
    return {
      albedo: d.vec4f(paletteColor(uv), 1) * opacity,
      normal: d.vec4f(),
      depth: d.vec4f(),
    };
  },
  primitive: { cullMode: 'back' },
});

// Animated lines drawn only into the normal buffer, so that they show up as outlines
const guidelinesPipeline = root.createRenderPipeline({
  ...sceneState,
  attribs: modelVertexLayout.attrib,
  vertex: ({ position, uv }) => {
    'use gpu';
    return { $position: projectToClip(position), worldPosition: position, uv };
  },
  fragment: ({ uv, worldPosition }) => {
    'use gpu';
    const pulse = std.sin(timeUniform.$ * 6 + (worldPosition.x + worldPosition.z) * 20);
    const opacity = std.saturate(
      uv.y ** 5 * std.smoothstep(2.2, 2, worldPosition.z) * (0.8 + pulse * 0.2),
    );
    const normal = std.mix(d.vec3f(0, 1, 0), d.vec3f(1, 0, 0), opacity);

    return {
      albedo: d.vec4f(),
      normal: d.vec4f(normal, 1) * opacity,
      depth: d.vec4f(),
    };
  },
  depthStencil: { ...sceneState.depthStencil, depthWriteEnabled: false },
});

const tilesPipeline = root.createRenderPipeline({
  ...sceneState,
  vertex: ({ $vertexIndex, $instanceIndex }) => {
    'use gpu';
    const tile = tileInstances.$[$instanceIndex];
    const corner = quadCorners.$[$vertexIndex];
    const scaled = corner * tile.size;
    const worldPosition = rotateY(d.vec3f(scaled.x, 0, scaled.y), tile.angle) + tile.offset;

    return {
      $position: projectToClip(worldPosition),
      uv: corner + 0.5,
      layer: $instanceIndex,
    };
  },
  fragment: ({ uv, layer }) => {
    'use gpu';
    const color = std.textureSample(tileAtlasView.$, tileSampler.$, uv, layer);
    if (color.a <= 0) {
      std.discard();
    }

    return {
      albedo: d.vec4f(color.rgb * color.a, color.a),
      normal: d.vec4f(),
      depth: d.vec4f(),
    };
  },
});

const postProcessLayout = tgpu.bindGroupLayout({
  albedoMap: { texture: d.texture2d(), sampleType: 'float' },
  normalMap: { texture: d.texture2d(), sampleType: 'float' },
  depthMap: { texture: d.texture2d(), sampleType: 'float' },
});

// Draws outlines wherever the normal or depth changes abruptly. Both are sampled
// from the 2nd mip level, which thickens and smooths out the outlines.
const postProcessPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv, $position }) => {
    'use gpu';
    const albedo = std.textureLoad(postProcessLayout.$.albedoMap, d.vec2i($position.xy), 0).rgb;
    const normal = std.textureSampleLevel(
      postProcessLayout.$.normalMap,
      linearSampler.$,
      uv,
      1,
    ).xyz;
    const depth = std.textureSampleLevel(postProcessLayout.$.depthMap, linearSampler.$, uv, 1).r;

    const normalDiff = std.fwidth(normal.x) + std.fwidth(normal.y) + std.fwidth(normal.z);
    const edge = std.saturate(
      std.fwidth(depth) * DEPTH_EDGE_SENSITIVITY + normalDiff * NORMAL_EDGE_SENSITIVITY,
    );

    const color = std.mix(albedo, borderColor, edge);
    return d.vec4f(color, 1) * fadeInUniform.$;
  },
});

// Render targets

function createRenderTargets() {
  const size = [canvas.width, canvas.height] as const;
  const createTarget = <TFormat extends 'rgba8unorm' | 'rgba16float' | 'r16float'>(
    format: TFormat,
    { sampleCount = 1, mipLevelCount = 1 } = {},
  ) => root.createTexture({ size, format, sampleCount, mipLevelCount }).$usage('render', 'sampled');

  // Normal and depth get a 2nd mip level for the post-process pass to sample from
  const albedo = createTarget('rgba8unorm');
  const normal = createTarget('rgba16float', { mipLevelCount: 2 });
  const depth = createTarget('r16float', { mipLevelCount: 2 });
  const albedoMSAA = createTarget('rgba8unorm', { sampleCount: MSAA_SAMPLES });
  const normalMSAA = createTarget('rgba16float', { sampleCount: MSAA_SAMPLES });
  const depthMSAA = createTarget('r16float', { sampleCount: MSAA_SAMPLES });
  const zBuffer = root
    .createTexture({ size, format: 'depth24plus', sampleCount: MSAA_SAMPLES })
    .$usage('render');

  return {
    width: canvas.width,
    height: canvas.height,
    normal,
    depth,
    colorAttachments: [
      {
        view: albedoMSAA,
        resolveTarget: albedo,
        clearValue: [backgroundColor.x, backgroundColor.y, backgroundColor.z, 1],
        storeOp: 'discard',
      },
      {
        view: normalMSAA,
        resolveTarget: normal.createView('render', { mipLevelCount: 1 }),
        clearValue: [0, 1, 0, 0],
        storeOp: 'discard',
      },
      {
        view: depthMSAA,
        resolveTarget: depth.createView('render', { mipLevelCount: 1 }),
        clearValue: [FAR_DEPTH, 0, 0, 0],
        storeOp: 'discard',
      },
    ],
    zBuffer,
    postProcessGroup: root.createBindGroup(postProcessLayout, {
      albedoMap: albedo,
      normalMap: normal,
      depthMap: depth,
    }),
    destroy() {
      for (const texture of [albedo, normal, depth, albedoMSAA, normalMSAA, depthMSAA, zBuffer]) {
        texture.destroy();
      }
    },
  } as const;
}

let targets = createRenderTargets();

// Revealing the outer walls when looking at the front of the building
const outsideOpacity = createSpring(1);

let frameId: number;
let lastTimestamp: number | undefined;

function frame(timestamp: number) {
  frameId = requestAnimationFrame(frame);

  // Clamping the delta time, so that physics stays stable after the tab was in the background
  const dt = Math.min((timestamp - (lastTimestamp ?? timestamp)) * 0.001, 1 / 30);
  lastTimestamp = timestamp;

  if (canvas.width === 0 || canvas.height === 0) {
    return;
  }
  if (canvas.width !== targets.width || canvas.height !== targets.height) {
    targets.destroy();
    targets = createRenderTargets();
  }

  controls.update(dt);
  outsideOpacity.target = controls.focus.z > 0.5 ? 1 : 0;
  outsideOpacity.step(dt);

  cameraUniform.write(controls.camera);
  timeUniform.write((timestamp / 1000) % 1000);
  outsideOpacityUniform.write(std.saturate(outsideOpacity.value));
  fadeInUniform.write(std.saturate(controls.in3dTransition * 2 - 1));

  const encoder = root['~unstable'].createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: targets.colorAttachments,
    depthStencilAttachment: { view: targets.zBuffer, depthStoreOp: 'discard' },
  });
  insidePipeline
    .with(pass)
    .with(modelVertexLayout, baseModel.vertexBuffer)
    .draw(baseModel.vertexCount);
  groundplanesPipeline
    .with(pass)
    .with(modelVertexLayout, groundplanesModel.vertexBuffer)
    .draw(groundplanesModel.vertexCount);
  guidelinesPipeline
    .with(pass)
    .with(modelVertexLayout, guidelinesModel.vertexBuffer)
    .draw(guidelinesModel.vertexCount);
  tilesPipeline.with(pass).draw(6, tiles.length);
  accessoriesPipeline
    .with(pass)
    .with(modelVertexLayout, accessoriesModel.vertexBuffer)
    .draw(accessoriesModel.vertexCount);
  outsidePipeline
    .with(pass)
    .with(modelVertexLayout, outsideModel.vertexBuffer)
    .draw(outsideModel.vertexCount);
  pass.end();
  encoder.submit();

  targets.normal.generateMipmaps(0, 2);
  targets.depth.generateMipmaps(0, 2);

  postProcessPipeline.with(targets.postProcessGroup).withColorAttachment({ view: context }).draw(3);
}

frameId = requestAnimationFrame(frame);

export function onCleanup() {
  abortController.abort();
  cancelAnimationFrame(frameId);
  root.destroy();
}
