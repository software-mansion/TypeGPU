import tgpu, {
  type IndexFlag,
  type TgpuBindGroup,
  type TgpuBuffer,
  type VertexFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as m from 'wgpu-matrix';

// Data structures
const Material = d.struct({
  ambient: d.vec3f,
  diffuse: d.vec3f,
  specular: d.vec3f,
  shininess: d.f32,
});

const VertexInfo = d.struct({
  position: d.vec4f,
  normal: d.vec4f,
});

const InstanceInfo = d.struct({
  modelMatrix: d.mat4x4f,
  material: Material,
});

const Camera = d.struct({
  projection: d.mat4x4f,
  view: d.mat4x4f,
  position: d.vec3f,
});

const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
});

const VisParams = d.struct({
  shadowOnly: d.f32,
  lightDepth: d.f32,
});

const LightSpace = d.struct({ viewProj: d.mat4x4f });

// WebGPU setup
const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// Bind group layouts
const bindGroupLayout = tgpu.bindGroupLayout({
  instanceInfo: { uniform: InstanceInfo },
});

const shadowSampleLayout = tgpu.bindGroupLayout({
  shadowMap: { texture: 'depth' },
});

// Light and camera setup
let currentLightDirection = d.vec3f(0, -1, -1);

function makeLightViewProj(
  lightDir: d.v3f,
  center: d.v3f = d.vec3f(),
) {
  const dir = std.normalize(lightDir);
  const dist = 10;
  const eye = center.add(dir.mul(-dist));
  const view = m.mat4.lookAt(eye, center, [0, 1, 0], d.mat4x4f());
  const proj = m.mat4.ortho(-2, 2, -2, 2, 0.1, 30, d.mat4x4f());
  return m.mat4.mul(proj, view, d.mat4x4f());
}

const camera = Camera({
  projection: m.mat4.perspective(
    Math.PI / 4,
    canvas.width / canvas.height,
    0.1,
    100,
    d.mat4x4f(),
  ),
  view: m.mat4.lookAt([0, 2, 5], [0, 0, 0], [0, 1, 0], d.mat4x4f()),
  position: d.vec3f(0, 2, 5),
});

const cameraUniform = root.createUniform(Camera, camera);
const paramsUniform = root.createUniform(VisParams, {
  shadowOnly: 0,
  lightDepth: 0,
});

const light = root.createUniform(DirectionalLight, {
  direction: d.vec3f(
    currentLightDirection[0],
    currentLightDirection[1],
    currentLightDirection[2],
  ),
  color: d.vec3f(1, 1, 1),
});

const lightViewProj = makeLightViewProj(currentLightDirection);
const lightSpaceUniform = root.createUniform(LightSpace, {
  viewProj: lightViewProj,
});

let currentShadowMapSize = 2048;

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

function createShadowTextures(size: number) {
  const shadowMap = root['~unstable'].createTexture({
    size: [size, size],
    format: 'depth32float',
  }).$usage('render', 'sampled');

  const shadowBindGroup = root.createBindGroup(shadowSampleLayout, {
    shadowMap: shadowMap,
  });

  return { shadowMap, shadowBindGroup };
}

// Textures and samplers
let canvasTextures = createCanvasTextures();
let shadowTextures = createShadowTextures(currentShadowMapSize);

const comparisonSampler = tgpu['~unstable'].comparisonSampler({
  compare: 'less',
  magFilter: 'linear',
  minFilter: 'linear',
});

const resizeObserver = new ResizeObserver(() => {
  canvasTextures = createCanvasTextures();

  const newProjection = m.mat4.perspective(
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
  specular: d.vec3f(0.3, 0.8, 0.1),
  shininess: 16.0,
});

// Geometry creation function
function createPlane(
  material = Material({
    ambient: d.vec3f(0.1, 0.1, 0.1),
    diffuse: d.vec3f(0.7, 0.7, 0.7),
    specular: d.vec3f(1.0, 1.0, 1.0),
    shininess: 32.0,
  }),
  width = 1,
  height = 1,
  position = d.vec3f(0, 0, 0),
  rotation = d.vec3f(0, 0, 0),
): {
  vertexBuffer: TgpuBuffer<d.WgslArray<typeof VertexInfo>> & VertexFlag;
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;
  instanceInfo: TgpuBindGroup<{
    instanceInfo: { uniform: typeof InstanceInfo };
  }>;
} {
  const w = width / 2;
  const h = height / 2;

  const vertices = [
    VertexInfo({ position: d.vec4f(-w, h, 0, 1), normal: d.vec4f(0, 0, 1, 0) }),
    VertexInfo({
      position: d.vec4f(-w, -h, 0, 1),
      normal: d.vec4f(0, 0, 1, 0),
    }),
    VertexInfo({ position: d.vec4f(w, -h, 0, 1), normal: d.vec4f(0, 0, 1, 0) }),
    VertexInfo({ position: d.vec4f(w, h, 0, 1), normal: d.vec4f(0, 0, 1, 0) }),
  ];

  const indices = [0, 1, 3, 1, 2, 3];

  const vertexBuffer = root.createBuffer(d.arrayOf(VertexInfo, 4), vertices)
    .$usage('vertex');
  const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 6), indices).$usage(
    'index',
  );

  let modelMatrix = d.mat4x4f.identity();

  if (rotation[0] !== 0) {
    modelMatrix = m.mat4.rotateX(modelMatrix, rotation[0], d.mat4x4f());
  }
  if (rotation[1] !== 0) {
    modelMatrix = m.mat4.rotateY(modelMatrix, rotation[1], d.mat4x4f());
  }
  if (rotation[2] !== 0) {
    modelMatrix = m.mat4.rotateZ(modelMatrix, rotation[2], d.mat4x4f());
  }
  modelMatrix = m.mat4.translate(modelMatrix, position, d.mat4x4f());

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    instanceInfo: root.createBuffer(InstanceInfo, {
      modelMatrix,
      material,
    }).$usage('uniform'),
  });

  return { vertexBuffer, indexBuffer, instanceInfo: bindGroup };
}

// Scene geometry
const planeGeometry = createPlane(
  planeMaterial,
  1,
  1,
  d.vec3f(0, 0.5, 0),
  d.vec3f(0, 0, 0),
);
const floorGeometry = createPlane(
  floorMaterial,
  5,
  5,
  d.vec3f(0, 0, 0),
  d.vec3f(Math.PI / 2, 0, 0),
);

const geometries = [
  {
    ...planeGeometry,
    indexCount: 6,
  },
  {
    ...floorGeometry,
    indexCount: 6,
  },
];

// Shaders
const shadowVert = tgpu['~unstable'].vertexFn({
  in: { position: d.vec4f },
  out: { pos: d.builtin.position },
})(({ position }) => {
  const world = bindGroupLayout.$.instanceInfo.modelMatrix.mul(position);
  const clip = lightSpaceUniform.$.viewProj.mul(world);
  return { pos: clip };
});

const mainVert = tgpu['~unstable'].vertexFn({
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

const mainFrag = tgpu['~unstable'].fragmentFn({
  in: {
    normal: d.vec4f,
    worldPos: d.vec3f,
    frontFacing: d.builtin.frontFacing,
  },
  out: d.vec4f,
})(({ normal, worldPos, frontFacing }) => {
  const instanceInfo = bindGroupLayout.$.instanceInfo;
  let N = std.normalize(normal.xyz);
  if (!frontFacing) {
    N = std.neg(N);
  }
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
    comparisonSampler,
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

const pipeline = root['~unstable']
  .withVertex(mainVert, vertexLayout.attrib)
  .withFragment(mainFrag, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth32float',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withMultisample({
    count: 4,
  })
  .createPipeline();

const shadowPipeline = root['~unstable']
  .withVertex(shadowVert, vertexLayout.attrib)
  .withDepthStencil({
    format: 'depth32float',
    depthWriteEnabled: true,
    depthCompare: 'less',
    depthBias: 0,
    depthBiasSlopeScale: 2,
    depthBiasClamp: 0,
  })
  .createPipeline();

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
function render() {
  requestAnimationFrame(render);

  root['~unstable'].beginRenderPass(
    {
      colorAttachments: [],
      depthStencilAttachment: {
        view: root.unwrap(shadowTextures.shadowMap).createView(),
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1.0,
      },
    },
    (pass) => {
      pass.setPipeline(shadowPipeline);
      for (const geometry of geometries) {
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
          view: root.unwrap(canvasTextures.msaa).createView(),
          resolveTarget: context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 0],
        },
      ],
      depthStencilAttachment: {
        view: root.unwrap(canvasTextures.depth).createView(),
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1,
      },
    },
    (pass) => {
      pass.setPipeline(pipeline);
      pass.setBindGroup(shadowSampleLayout, shadowTextures.shadowBindGroup);

      for (const geometry of geometries) {
        pass.setBindGroup(bindGroupLayout, geometry.instanceInfo);
        pass.setVertexBuffer(vertexLayout, geometry.vertexBuffer);
        pass.setIndexBuffer(geometry.indexBuffer, 'uint16');

        pass.drawIndexed(geometry.indexCount);
      }
    },
  );
  root['~unstable'].flush();
}

render();

export const controls = {
  'camera X': {
    initial: -4.9,
    min: -10,
    max: 10,
    step: 0.01,
    onSliderChange: (value: number) => {
      const newView = m.mat4.lookAt(
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
    max: 0,
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
  'shadow map size': {
    initial: '2048',
    options: ['512', '1024', '2048', '4096', '8192'],
    onSelectChange: (value: string) => {
      currentShadowMapSize = Number.parseInt(value);
      shadowTextures = createShadowTextures(currentShadowMapSize);
    },
  },
  'display mode': {
    initial: 'color',
    options: ['color', 'shadow', 'light depth'],
    onSelectChange: (value: string) => {
      paramsUniform.write({
        shadowOnly: value === 'shadow' ? 1 : 0,
        lightDepth: value === 'light depth' ? 1 : 0,
      });
    },
  },
};

export function onCleanup() {
  resizeObserver.disconnect();
  root.destroy();
}
