import tgpu, { common, d, std } from 'typegpu';
import { loadModel, ModelVertexInput, modelVertexLayout } from './load-model.ts';
import { Camera, setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { hexToRgb } from '@typegpu/color';
import { perlin3d } from '@typegpu/noise';

const WHITE = d.vec3f(1, 1, 1);
const PURPLE_DARK = hexToRgb('#271C2D');
const PURPLE_LIGHT = hexToRgb('#CCD6FF');
const BORDER_COLOR = hexToRgb('#484DFC');
const GRAY_COLOR = hexToRgb('#EEF1FF');

const objectColor = GRAY_COLOR;
const backgroundColor = WHITE;
const borderColor = BORDER_COLOR;

const lightColor = d.vec3f(0.5, 0.5, 0.5);
const lightDirection = std.normalize(d.vec3f(0, 7, 7));
const ambientColor = WHITE;
const ambientStrength = 0.5;
const specularExponent = 8;

// schemas

const ModelVertexOutput = {
  worldPosition: d.vec3f,
  worldNormal: d.vec3f,
  canvasPosition: d.builtin.position,
} as const;

// layouts

// setup
const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const model = await loadModel(root, '/TypeGPU/assets/appjs-venue/stara-zajezdnia.obj');

// camera
const cameraUniform = root.createUniform(Camera);

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  {
    initPos: d.vec4f(3, 2, 5, 1).mul(0.5),
    target: d.vec4f(0, 0, 0, 1),
    minZoom: 3,
    maxZoom: 20,
  },
  (updates) => cameraUniform.patch(updates),
);

const vertexShader = tgpu.vertexFn({
  in: { ...ModelVertexInput.propTypes, instanceIndex: d.builtin.instanceIndex },
  out: ModelVertexOutput,
})((input) => {
  const worldPosition = d.vec4f(input.modelPosition, 1);
  const camera = cameraUniform.$;

  const canvasPosition = camera.projection.mul(camera.view).mul(worldPosition);

  return {
    worldPosition: input.modelPosition,
    worldNormal: input.modelNormal,
    canvasPosition: canvasPosition,
  };
});

// see https://gist.github.com/chicio/d983fff6ff304bd55bebd6ff05a2f9dd
const fragmentShader = tgpu.fragmentFn({
  in: { ...ModelVertexOutput, position: d.builtin.position },
  out: { albedo: d.vec4f, normal: d.vec4f, depth: d.vec4f },
})((input) => {
  // ambient component
  const ambient = ambientColor.mul(ambientStrength);

  // diffuse component
  const cosTheta = std.dot(input.worldNormal, lightDirection);
  const diffuse = lightColor.mul(std.max(0, cosTheta));

  // specular component
  const reflectionDirection = std.reflect(lightDirection.mul(-1), input.worldNormal);
  const viewDirection = std.normalize(cameraUniform.$.position.xyz.sub(input.worldPosition));
  const specular = lightColor.mul(
    std.pow(std.max(0, std.dot(reflectionDirection, viewDirection)), specularExponent),
  );

  // add the components up
  const color = ambient.add(diffuse).add(specular);
  return {
    albedo: d.vec4f(objectColor, 1),
    normal: d.vec4f(input.worldNormal, 0),
    depth: d.vec4f(input.position.z * 0.001, 0, 0, 1),
  };
});

// pipelines
const renderPipeline = root.createRenderPipeline({
  attribs: modelVertexLayout.attrib,
  vertex: vertexShader,
  fragment: fragmentShader,
  targets: {
    albedo: { format: 'rgba8unorm' },
    normal: { format: 'rgba16float' },
    depth: { format: 'r16float' },
  },
  depthStencil: {
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  },
  multisample: {
    count: 4,
  },
});

const postProcessLayout = tgpu.bindGroupLayout({
  albedoMap: { texture: d.texture2d(), sampleType: 'float' },
  normalMap: { texture: d.texture2d(), sampleType: 'float' },
  depthMap: { texture: d.texture2d(), sampleType: 'float' },
});

const linearSampler = root.createSampler({
  minFilter: 'linear',
  magFilter: 'linear',
});

const timeUniform = root.createUniform(d.f32);

const postProcessPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv, $position }) => {
    'use gpu';

    // const boilT = std.floor(timeUniform.$ * 10);
    // const boilOffset = d.vec2f(
    //   perlin3d.sample(d.vec3f(uv * 20, boilT)),
    //   perlin3d.sample(d.vec3f(uv * 20, boilT)),
    // );
    // const edgeUv = uv + boilOffset * 0.002;

    const albedo = std.textureLoad(postProcessLayout.$.albedoMap, d.vec2i($position.xy), 0).xyz;
    const normal = std.textureSampleLevel(
      postProcessLayout.$.normalMap,
      linearSampler.$,
      uv,
      1,
    ).xyz;
    const depth =
      std.textureSampleLevel(postProcessLayout.$.depthMap, linearSampler.$, uv, 1).r * 2;

    const edgeDepth = std.smoothstep(0, 50, std.fwidth(depth));
    let edgeNormal = std.fwidth(normal.x) + std.fwidth(normal.y) + std.fwidth(normal.z);
    edgeNormal = std.smoothstep(0, 1, edgeNormal);
    const edge = std.saturate(edgeDepth + edgeNormal);

    return d.vec4f(std.mix(albedo, borderColor, edge), 1);
  },
});

const createAlbedoTexture = ({ sampleCount }: { sampleCount: number }) => {
  return root
    .createTexture({
      size: [canvas.width, canvas.height, 1],
      format: 'rgba8unorm',
      sampleCount,
    })
    .$usage('render', 'sampled');
};

const createNormalTexture = ({ sampleCount }: { sampleCount: number }) => {
  return root
    .createTexture({
      size: [canvas.width, canvas.height, 1],
      format: 'rgba16float',
      sampleCount,
      mipLevelCount: sampleCount === 1 ? 2 : 1,
    })
    .$usage('render', 'sampled');
};

const createDepthTexture = ({ sampleCount }: { sampleCount: number }) => {
  return root
    .createTexture({
      size: [canvas.width, canvas.height, 1],
      format: 'r16float',
      sampleCount,
      mipLevelCount: sampleCount === 1 ? 2 : 1,
    })
    .$usage('render', 'sampled');
};

const createZBuffer = () => {
  return root
    .createTexture({
      size: [canvas.width, canvas.height, 1],
      format: 'depth24plus',
      sampleCount: 4,
    })
    .$usage('render');
};

let albedoTexture = createAlbedoTexture({ sampleCount: 1 });
let normalTexture = createNormalTexture({ sampleCount: 1 });
let depthTexture = createDepthTexture({ sampleCount: 1 });
let albedoTextureMSAA = createAlbedoTexture({ sampleCount: 4 });
let normalTextureMSAA = createNormalTexture({ sampleCount: 4 });
let depthTextureMSAA = createDepthTexture({ sampleCount: 4 });
let zBuffer = createZBuffer();
let postProcessGroup = root.createBindGroup(postProcessLayout, {
  albedoMap: albedoTexture.createView(),
  normalMap: normalTexture.createView(),
  depthMap: depthTexture.createView(),
});

// frame
let frameId: number;
function frame(timestamp: number) {
  timeUniform.write((timestamp / 1000) % 1000);
  renderPipeline
    .withColorAttachment({
      albedo: {
        view: albedoTextureMSAA.createView('render'),
        resolveTarget: albedoTexture.createView('render'),
        clearValue: [backgroundColor.x, backgroundColor.y, backgroundColor.z, 1],
      },
      normal: {
        view: normalTextureMSAA.createView('render'),
        resolveTarget: normalTexture.createView('render', { mipLevelCount: 1 }),
        clearValue: [0, 0, 0, 0],
      },
      depth: {
        view: depthTextureMSAA.createView('render'),
        resolveTarget: depthTexture.createView('render', { mipLevelCount: 1 }),
        clearValue: [100, 0, 0, 0],
      },
    })
    .withDepthStencilAttachment({
      view: zBuffer.createView('render'),
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .with(modelVertexLayout, model.vertexBuffer)
    .draw(model.polygonCount);

  normalTexture.generateMipmaps(0, 2);
  depthTexture.generateMipmaps(0, 2);

  postProcessPipeline
    .with(postProcessGroup)
    .withColorAttachment({
      view: context,
    })
    .draw(3);

  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

const resizeObserver = new ResizeObserver(() => {
  albedoTexture.destroy();
  normalTexture.destroy();
  depthTexture.destroy();
  albedoTextureMSAA.destroy();
  normalTextureMSAA.destroy();
  depthTextureMSAA.destroy();
  zBuffer.destroy();

  albedoTexture = createAlbedoTexture({ sampleCount: 1 });
  normalTexture = createNormalTexture({ sampleCount: 1 });
  depthTexture = createDepthTexture({ sampleCount: 1 });
  albedoTextureMSAA = createAlbedoTexture({ sampleCount: 4 });
  normalTextureMSAA = createNormalTexture({ sampleCount: 4 });
  depthTextureMSAA = createDepthTexture({ sampleCount: 4 });
  zBuffer = createZBuffer();
  postProcessGroup = root.createBindGroup(postProcessLayout, {
    albedoMap: albedoTexture.createView(),
    normalMap: normalTexture.createView(),
    depthMap: depthTexture.createView(),
  });
});
resizeObserver.observe(canvas);

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  resizeObserver.unobserve(canvas);
  root.destroy();
}

// #endregion
