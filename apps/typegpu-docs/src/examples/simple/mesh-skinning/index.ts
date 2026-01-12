import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { mat4 } from 'wgpu-matrix';
import { loadGLBModel } from './loader.ts';
import { type NodeTransform, sampleAnimation } from './animation.ts';
import { type Quat, quatFromAxisAngle, quatMul } from './math.ts';
import type { ModelData } from './types.ts';
import { VertexData } from './types.ts';
import { setupOrbitCamera } from './setup-orbit-camera.ts';

const MODELS: Record<
  string,
  { path: string; scale: number; offset: [number, number, number] }
> = {
  LongBoi: {
    path: '/TypeGPU/assets/mesh-skinning/LongBoi.glb',
    scale: 1,
    offset: [0, 0, 0],
  },
  DancingBot: {
    path: '/TypeGPU/assets/mesh-skinning/DancingBot.glb',
    scale: 8,
    offset: [0, -8, 0],
  },
};
type ModelName = keyof typeof MODELS;

const MAX_JOINTS = 64;

let currentModelName: ModelName = 'LongBoi';
let modelData: ModelData = await loadGLBModel(MODELS[currentModelName].path);
let twistEnabled = false;
let bendEnabled = false;
let animationPlaying = true;
let bendTime = 0;
let twistTime = 0;
let animationTime = 0;
let lastFrameTime = 0;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

let depthTexture = root['~unstable'].createTexture({
  size: [canvas.width, canvas.height],
  format: 'depth24plus',
  sampleCount: 4,
}).$usage('render');
let msaaTexture = root['~unstable'].createTexture({
  size: [canvas.width, canvas.height],
  format: presentationFormat,
  sampleCount: 4,
}).$usage('render');

const cameraUniform = root.createUniform(d.mat4x4f);
let viewMatrix = d.mat4x4f();
let projectionMatrix = d.mat4x4f();

const { cleanupCamera } = setupOrbitCamera(
  canvas,
  { initPos: d.vec4f(15, 15, 15, 1) },
  (camera) => {
    if (camera.view) {
      viewMatrix = camera.view;
    }
    if (camera.projection) {
      projectionMatrix = camera.projection;
    }
    cameraUniform.write(mat4.mul(projectionMatrix, viewMatrix, d.mat4x4f()));
  },
);

const longBoiAnimation = (nodeIndex: number): Quat | null => {
  if (nodeIndex !== 0) {
    return null;
  }
  const bendQuat = quatFromAxisAngle(
    [0, 0, 1],
    Math.sin(bendTime * 0.001) * Math.PI * 0.5,
  );
  const twistQuat = quatFromAxisAngle(
    [0, 1, 0],
    Math.sin(twistTime * 0.0015) * Math.PI * 0.3,
  );
  return quatMul(twistQuat, bendQuat);
};

const getWorldTransform = (
  nodeIndex: number,
  parentTransform?: Float32Array,
  animatedTransforms?: Map<number, NodeTransform>,
  useLongBoi?: boolean,
): Float32Array => {
  const node = modelData.nodes[nodeIndex];
  const anim = animatedTransforms?.get(nodeIndex);
  const localMatrix = mat4.identity();

  const translation = anim?.translation ?? node.translation;
  const scale = anim?.scale ?? node.scale;
  let rotation = anim?.rotation ?? node.rotation;

  if (useLongBoi) {
    const animRot = longBoiAnimation(nodeIndex);
    if (animRot) {
      rotation = animRot;
    }
  }

  if (translation) {
    mat4.translate(localMatrix, translation, localMatrix);
  }
  if (rotation) {
    mat4.mul(localMatrix, mat4.fromQuat(rotation), localMatrix);
  }
  if (scale) {
    mat4.scale(localMatrix, scale, localMatrix);
  }

  if (parentTransform) {
    return mat4.mul(parentTransform, localMatrix);
  }

  for (let i = 0; i < modelData.nodes.length; i++) {
    if (modelData.nodes[i].children?.includes(nodeIndex)) {
      return mat4.mul(
        getWorldTransform(i, undefined, animatedTransforms, useLongBoi),
        localMatrix,
      );
    }
  }

  return localMatrix;
};

const getJointMatrices = (): d.m4x4f[] => {
  const useLongBoi = currentModelName === 'LongBoi' &&
    (twistEnabled || bendEnabled);
  const animTransforms =
    currentModelName === 'DancingBot' && modelData.animations.length > 0
      ? sampleAnimation(modelData.animations[0], animationTime)
      : undefined;

  const { scale, offset } = MODELS[currentModelName];
  const modelTransform = mat4.identity();
  mat4.translate(modelTransform, offset, modelTransform);
  mat4.scale(modelTransform, [scale, scale, scale], modelTransform);

  const matrices = modelData.jointNodes.map((jointNode: number, i: number) => {
    const world = getWorldTransform(
      jointNode,
      undefined,
      animTransforms,
      useLongBoi,
    );
    const invBind = modelData.inverseBindMatrices.slice(i * 16, (i + 1) * 16);
    const jointMatrix = mat4.mul(world, invBind, d.mat4x4f());
    return mat4.mul(modelTransform, jointMatrix, d.mat4x4f());
  });

  while (matrices.length < MAX_JOINTS) {
    matrices.push(d.mat4x4f.identity());
  }
  return matrices;
};

const createVertexData = (): d.Infer<typeof VertexData>[] =>
  Array.from({ length: modelData.vertexCount }, (_, i) => ({
    position: d.vec3f(
      modelData.positions[i * 3],
      modelData.positions[i * 3 + 1],
      modelData.positions[i * 3 + 2],
    ),
    normal: d.vec3f(
      modelData.normals[i * 3],
      modelData.normals[i * 3 + 1],
      modelData.normals[i * 3 + 2],
    ),
    joint: d.vec4u(
      modelData.joints[i * 4],
      modelData.joints[i * 4 + 1],
      modelData.joints[i * 4 + 2],
      modelData.joints[i * 4 + 3],
    ),
    weight: d.vec4f(
      modelData.weights[i * 4],
      modelData.weights[i * 4 + 1],
      modelData.weights[i * 4 + 2],
      modelData.weights[i * 4 + 3],
    ),
  }));

let vertexBuffer = root.createBuffer(
  d.arrayOf(VertexData, modelData.vertexCount),
  createVertexData(),
).$usage('vertex');
let indexBuffer = root.createBuffer(
  d.arrayOf(d.u16, modelData.indices.length),
  Array.from(modelData.indices) as number[],
).$usage('index');
let currentIndexCount = modelData.indices.length;

const jointMatricesUniform = root.createUniform(
  d.arrayOf(d.mat4x4f, MAX_JOINTS),
  getJointMatrices(),
);
const vertexLayout = tgpu.vertexLayout(d.arrayOf(VertexData));

const vertex = tgpu['~unstable'].vertexFn({
  in: { position: d.vec3f, normal: d.vec3f, joint: d.vec4u, weight: d.vec4f },
  out: { pos: d.builtin.position, normal: d.vec3f },
})(({ position, normal, joint, weight }) => {
  const jm = jointMatricesUniform.$;
  const skinMatrix = jm[joint.x].mul(weight.x)
    .add(jm[joint.y].mul(weight.y))
    .add(jm[joint.z].mul(weight.z))
    .add(jm[joint.w].mul(weight.w));

  return {
    pos: cameraUniform.$.mul(skinMatrix.mul(d.vec4f(position, 1))),
    normal: std.normalize(skinMatrix.mul(d.vec4f(normal, 0)).xyz),
  };
});

const fragment = tgpu['~unstable'].fragmentFn({
  in: { normal: d.vec3f },
  out: d.vec4f,
})(({ normal }) => {
  const diffuse = std.saturate(
    std.dot(normal, std.normalize(d.vec3f(1, 0, 1))),
  );
  return d.vec4f(d.vec3f(0.8).mul(diffuse * 0.7 + 0.3), 1.0);
});

const pipeline = root['~unstable']
  .withVertex(vertex, vertexLayout.attrib)
  .withFragment(fragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .withMultisample({ count: 4 })
  .createPipeline()
  .withIndexBuffer(indexBuffer);

const resizeObserver = new ResizeObserver(() => {
  depthTexture = root['~unstable'].createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
    sampleCount: 4,
  }).$usage('render');
  msaaTexture = root['~unstable'].createTexture({
    size: [canvas.width, canvas.height],
    format: presentationFormat,
    sampleCount: 4,
  }).$usage('render');
});
resizeObserver.observe(canvas);

async function switchModel(name: ModelName) {
  if (name === currentModelName) {
    return;
  }
  currentModelName = name;
  modelData = await loadGLBModel(MODELS[name].path);
  vertexBuffer = root.createBuffer(
    d.arrayOf(VertexData, modelData.vertexCount),
    createVertexData(),
  ).$usage('vertex');
  indexBuffer = root.createBuffer(
    d.arrayOf(d.u16, modelData.indices.length),
    Array.from(modelData.indices),
  ).$usage('index');
  currentIndexCount = modelData.indices.length;
  animationTime = 0;
}

function render(time: number) {
  const deltaTime = Math.max(0, time - lastFrameTime);
  lastFrameTime = time;

  if (currentModelName === 'LongBoi') {
    if (bendEnabled) {
      bendTime += deltaTime;
    }
    if (twistEnabled) {
      twistTime += deltaTime;
    }
  } else if (animationPlaying) {
    animationTime += deltaTime * 0.001;
  }

  jointMatricesUniform.write(getJointMatrices());

  pipeline
    .with(vertexLayout, vertexBuffer)
    .withIndexBuffer(indexBuffer)
    .withColorAttachment({
      resolveTarget: context.getCurrentTexture().createView(),
      view: root.unwrap(msaaTexture).createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .drawIndexed(currentIndexCount);

  animationId = requestAnimationFrame(render);
}

let animationId: number | undefined;
animationId = requestAnimationFrame(render);

export const controls = {
  Model: {
    initial: 'LongBoi',
    options: Object.keys(MODELS),
    onSelectChange: async (v: string) => {
      await switchModel(v as ModelName);
    },
  },
  Twist: {
    initial: true,
    onToggleChange: (v: boolean) => {
      twistEnabled = v;
    },
  },
  Bend: {
    initial: true,
    onToggleChange: (v: boolean) => {
      bendEnabled = v;
    },
  },
  'Play Animation': {
    initial: true,
    onToggleChange: (v: boolean) => {
      animationPlaying = v;
    },
  },
  'Reset Animation': {
    onButtonClick: () => {
      animationTime = 0;
      bendTime = 0;
      twistTime = 0;
    },
  },
};

export function onCleanup() {
  if (animationId !== undefined) {
    cancelAnimationFrame(animationId);
  }
  resizeObserver.disconnect();
  cleanupCamera();
  root.destroy();
}
