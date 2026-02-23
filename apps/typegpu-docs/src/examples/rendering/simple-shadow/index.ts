import tgpu, { d, std } from 'typegpu';
import { mat4 } from 'wgpu-matrix';
import { createCuboid, createPlane } from './geometry.ts';
import {
  bindGroupLayout,
  Camera,
  DirectionalLight,
  LightSpace,
  Material,
  shadowSampleLayout,
  VertexInfo,
  VisParams,
} from './schema.ts';
import { defineControls } from '../../common/defineControls.ts';

// WebGPU setup
const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

// Utility functions
function makeLightViewProj(
  lightDir: d.v3f,
  center: d.v3f = d.vec3f(),
) {
  const dir = std.normalize(lightDir);
  const dist = 10;
  const eye = center.add(dir.mul(-dist));
  const view = mat4.lookAt(eye, center, [0, 1, 0], d.mat4x4f());
  const proj = mat4.ortho(-2, 2, -2, 2, 0.1, 30, d.mat4x4f());
  return mat4.mul(proj, view, d.mat4x4f());
}

function createCanvasTextures() {
  return {
    msaa: root['~unstable'].createTexture({
      size: [canvas.width, canvas.height],
      format: presentationFormat,
      sampleCount: 4,
    }).$usage('render'),
    depth: root['~unstable'].createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth32float',
      sampleCount: 4,
    }).$usage('render'),
  };
}

function createShadowTextures(
  size: number,
  sampleCompare: 'less-equal' | 'greater' = 'less-equal',
  pcf = true,
) {
  const shadowMap = root['~unstable'].createTexture({
    size: [size, size],
    format: 'depth32float',
  }).$usage('render', 'sampled');

  const comparisonSampler = root['~unstable'].createComparisonSampler({
    compare: sampleCompare,
    magFilter: pcf ? 'linear' : 'nearest',
    minFilter: pcf ? 'linear' : 'nearest',
  });

  const shadowBindGroup = root.createBindGroup(shadowSampleLayout, {
    shadowMap: shadowMap,
    comparisonSampler: comparisonSampler,
  });

  return { shadowMap, shadowBindGroup };
}

// Light and camera setup
let currentLightDirection = d.vec3f(0, -1, -1);

const camera = Camera({
  projection: mat4.perspective(
    Math.PI / 4,
    canvas.width / canvas.height,
    0.1,
    100,
    d.mat4x4f(),
  ),
  view: mat4.lookAt([0, 2, 5], [0, 0, 0], [0, 1, 0], d.mat4x4f()),
  position: d.vec3f(0, 2, 5),
});

const cameraUniform = root.createUniform(Camera, camera);
const paramsUniform = root.createUniform(VisParams, {
  shadowOnly: 0,
  lightDepth: 0,
});

const light = root.createUniform(DirectionalLight, {
  direction: currentLightDirection,
  color: d.vec3f(1),
});

const lightViewProj = makeLightViewProj(currentLightDirection);
const lightSpaceUniform = root.createUniform(LightSpace, {
  viewProj: lightViewProj,
});

let currentShadowMapSize = 2048;
let currentSampleCompare: 'less-equal' | 'greater' = 'less-equal';
let pcf = true;

// Textures and samplers
let canvasTextures = createCanvasTextures();
let shadowTextures = createShadowTextures(currentShadowMapSize);

// Materials
const planeMaterial = Material({
  ambient: d.vec3f(0.1, 0.1, 0.1),
  diffuse: d.vec3f(0.8, 0.7, 0.7),
  specular: d.vec3f(1.0, 1.0, 1.0),
  shininess: 32.0,
});

const floorMaterial = Material({
  ambient: d.vec3f(0.1, 0.1, 0.1),
  diffuse: d.vec3f(0.5, 0.4, 0.7),
  specular: d.vec3f(0.8, 0.5, 0.1),
  shininess: 16.0,
});

// Scene geometry
const cubeGeometry = createCuboid({
  root,
  material: planeMaterial,
  size: [1, 1, 0.3],
  position: d.vec3f(0, 0.5, 0),
  rotation: d.vec3f(0, 0, 0),
});
const floorGeometry = createPlane({
  root,
  material: floorMaterial,
  size: [5, 5],
  position: d.vec3f(0, 0, 0),
  rotation: d.vec3f(-Math.PI / 2, 0, 0),
});

const geometries = {
  cuboid: cubeGeometry,
  floor: floorGeometry,
};

// Shaders
const shadowVert = tgpu.vertexFn({
  in: { position: d.vec4f },
  out: { pos: d.builtin.position },
})(({ position }) => {
  const world = bindGroupLayout.$.instanceInfo.modelMatrix.mul(position);
  const clip = lightSpaceUniform.$.viewProj.mul(world);
  return { pos: clip };
});

const mainVert = tgpu.vertexFn({
  in: {
    position: d.vec4f,
    normal: d.vec4f,
  },
  out: {
    pos: d.builtin.position,
    normal: d.vec4f,
    worldPos: d.vec3f,
  },
})(({ position, normal }) => {
  const modelMatrixUniform = bindGroupLayout.$.instanceInfo.modelMatrix;
  const worldPos = modelMatrixUniform.mul(position);
  const viewPos = cameraUniform.$.view.mul(worldPos);
  const clipPos = cameraUniform.$.projection.mul(viewPos);
  const transformedNormal = modelMatrixUniform.mul(normal);

  return {
    pos: clipPos,
    normal: transformedNormal,
    worldPos: worldPos.xyz,
  };
});

const mainFrag = tgpu.fragmentFn({
  in: {
    normal: d.vec4f,
    worldPos: d.vec3f,
  },
  out: d.vec4f,
})(({ normal, worldPos }) => {
  const instanceInfo = bindGroupLayout.$.instanceInfo;
  const N = std.normalize(normal.xyz);
  const L = std.normalize(std.neg(light.$.direction));
  const V = std.normalize(cameraUniform.$.position.sub(worldPos));
  const R = std.reflect(std.neg(L), N);

  const lp4 = lightSpaceUniform.$.viewProj.mul(d.vec4f(worldPos, 1.0));
  const ndc = lp4.xyz.div(lp4.w);
  let uv = ndc.xy.mul(0.5).add(0.5);
  uv = d.vec2f(uv.x, 1.0 - uv.y);
  const currentDepth = ndc.z;

  const inBounds = std.all(std.ge(uv, d.vec2f(0.0, 0.0))) &&
    std.all(std.le(uv, d.vec2f(1.0, 1.0)));

  let shadowFactor = std.textureSampleCompare(
    shadowSampleLayout.$.shadowMap,
    shadowSampleLayout.$.comparisonSampler,
    uv,
    currentDepth,
  );
  if (!inBounds) {
    shadowFactor = d.f32(1);
  }

  // Phong terms
  const ambient = instanceInfo.material.ambient.mul(light.$.color);

  const diff = std.max(0.0, std.dot(N, L));
  const diffuse = instanceInfo.material.diffuse.mul(light.$.color).mul(diff);

  const spec = std.pow(
    std.max(0.0, std.dot(V, R)),
    instanceInfo.material.shininess,
  );
  const specular = instanceInfo.material.specular.mul(light.$.color).mul(spec);

  const lit = diffuse.add(specular).mul(shadowFactor);
  const finalColor = ambient.add(lit);
  if (paramsUniform.$.shadowOnly === 1) {
    return d.vec4f(d.vec3f(shadowFactor), 1.0);
  }
  if (paramsUniform.$.lightDepth === 1) {
    const remappedDepth = std.clamp(
      (currentDepth - 0.2) / (0.7 - 0.2),
      0,
      1,
    );
    return d.vec4f(d.vec3f(remappedDepth), 1.0);
  }
  return d.vec4f(finalColor, 1.0);
});

// Pipelines
const vertexLayout = tgpu.vertexLayout(d.arrayOf(VertexInfo));

const pipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex: mainVert,
  fragment: mainFrag,

  primitive: {
    cullMode: 'back',
  },
  depthStencil: {
    format: 'depth32float',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
  multisample: {
    count: 4,
  },
});

const shadowPipeline = root.createRenderPipeline({
  attribs: vertexLayout.attrib,
  vertex: shadowVert,

  primitive: {
    cullMode: 'back',
  },
  depthStencil: {
    format: 'depth32float',
    depthWriteEnabled: true,
    depthCompare: 'less',
    depthBias: 1,
    depthBiasSlopeScale: 4,
    depthBiasClamp: 0,
  },
});

function updateLightDirection(dir: d.v3f) {
  currentLightDirection = dir;

  light.writePartial({
    direction: dir,
  });

  const newLightViewProj = makeLightViewProj(currentLightDirection);
  lightSpaceUniform.writePartial({
    viewProj: newLightViewProj,
  });
}

// Render loop
let frameId: number | null = null;
function render() {
  frameId = requestAnimationFrame(render);

  root['~unstable'].beginRenderPass(
    {
      colorAttachments: [],
      depthStencilAttachment: {
        view: root.unwrap(shadowTextures.shadowMap),
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1.0,
      },
    },
    (pass) => {
      pass.setPipeline(shadowPipeline);
      for (const geometry of Object.values(geometries)) {
        pass.setBindGroup(bindGroupLayout, geometry.instanceInfo);
        pass.setVertexBuffer(vertexLayout, geometry.vertexBuffer);
        pass.setIndexBuffer(geometry.indexBuffer, 'uint16');
        pass.drawIndexed(geometry.indexCount);
      }
    },
  );

  root['~unstable'].beginRenderPass(
    {
      colorAttachments: [
        {
          view: root.unwrap(canvasTextures.msaa),
          resolveTarget: context.getCurrentTexture(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 0],
        },
      ],
      depthStencilAttachment: {
        view: root.unwrap(canvasTextures.depth),
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1,
      },
    },
    (pass) => {
      pass.setPipeline(pipeline);
      pass.setBindGroup(shadowSampleLayout, shadowTextures.shadowBindGroup);

      for (const geometry of Object.values(geometries)) {
        pass.setBindGroup(bindGroupLayout, geometry.instanceInfo);
        pass.setVertexBuffer(vertexLayout, geometry.vertexBuffer);
        pass.setIndexBuffer(geometry.indexBuffer, 'uint16');

        pass.drawIndexed(geometry.indexCount);
      }
    },
  );
}
frameId = requestAnimationFrame(render);

const resizeObserver = new ResizeObserver(() => {
  canvasTextures = createCanvasTextures();

  const newProjection = mat4.perspective(
    Math.PI / 4,
    canvas.width / canvas.height,
    0.1,
    100,
    d.mat4x4f(),
  );
  cameraUniform.writePartial({
    projection: newProjection,
  });
});
resizeObserver.observe(canvas);

export const controls = defineControls({
  'camera X': {
    initial: -4.9,
    min: -10,
    max: 10,
    step: 0.01,
    onSliderChange: (value: number) => {
      const newView = mat4.lookAt(
        d.vec3f(value, 2, 5),
        d.vec3f(0, 0, 0),
        d.vec3f(0, 1, 0),
        d.mat4x4f(),
      );
      cameraUniform.writePartial({
        view: newView,
        position: d.vec3f(value, 2, 5),
      });
    },
  },
  'light X': {
    initial: -0.5,
    min: -2,
    max: 2,
    step: 0.01,
    onSliderChange: (value: number) => {
      updateLightDirection(d.vec3f(value, currentLightDirection.yz));
    },
  },
  'light Y': {
    initial: -0.7,
    min: -4,
    max: -0.1,
    step: 0.01,
    onSliderChange: (value: number) => {
      updateLightDirection(
        d.vec3f(currentLightDirection.x, value, currentLightDirection.z),
      );
    },
  },
  'light Z': {
    initial: -1,
    min: -2,
    max: 2,
    step: 0.01,
    onSliderChange: (value: number) => {
      updateLightDirection(d.vec3f(currentLightDirection.xy, value));
    },
  },
  'cuboid thickness': {
    initial: 0.3,
    min: 0.01,
    max: 1,
    step: 0.01,
    onSliderChange: (value: number) => {
      const newCuboid = createCuboid({
        root,
        material: planeMaterial,
        size: [1, 1, value],
        position: d.vec3f(0, 0.5, 0),
        rotation: d.vec3f(0, 0, 0),
      });
      geometries.cuboid = newCuboid;
    },
  },
  'shadow map size': {
    initial: 2048,
    options: [512, 1024, 2048, 4096, 8192],
    onSelectChange: (value) => {
      currentShadowMapSize = value;
      shadowTextures = createShadowTextures(currentShadowMapSize);
    },
  },
  'shadow map filtering': {
    initial: true,
    onToggleChange: (value) => {
      pcf = value;
      shadowTextures = createShadowTextures(
        currentShadowMapSize,
        currentSampleCompare,
        pcf,
      );
    },
  },
  'display mode': {
    initial: 'color',
    options: ['color', 'shadow', 'light depth', 'inverse shadow'],
    onSelectChange: (value) => {
      paramsUniform.write({
        shadowOnly: value === 'shadow' || value === 'inverse shadow' ? 1 : 0,
        lightDepth: value === 'light depth' ? 1 : 0,
      });
      currentSampleCompare = value === 'inverse shadow'
        ? 'greater'
        : 'less-equal';
      shadowTextures = createShadowTextures(
        currentShadowMapSize,
        currentSampleCompare,
        pcf,
      );
    },
  },
});

export function onCleanup() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
  }
  resizeObserver.disconnect();
  root.destroy();
}
