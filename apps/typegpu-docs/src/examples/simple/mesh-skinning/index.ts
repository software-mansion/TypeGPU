import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { mat4 } from 'wgpu-matrix';
import { setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { type NodeTransform, sampleAnimation } from './animation.ts';
import { loadGLBModel } from './loader.ts';
import { type ModelData, VertexData } from './types.ts';

const MODEL = {
  path: '/TypeGPU/assets/mesh-skinning/NewModel.glb',
  scale: 1,
  offset: [0, 0, 0] as [number, number, number],
};

const MAX_JOINTS = 64;
const CAMERA_TARGET_SMOOTHING = 0.08;
const CAMERA_TARGET_Y_OFFSET = 0.4;

const modelData: ModelData = await loadGLBModel(MODEL.path);
const animationOptions = modelData.animations.map((anim) => anim.name.replaceAll('_', ' '));

const state = {
  animation: {
    selectedName: 'Yes',
    playing: true,
    time: 0,
  },
  frame: {
    lastTime: 0,
  },
  camera: {
    position: d.vec4f(3, 3, 3, 1),
    target: d.vec4f(0, 0, 0, 1),
  },
};

const parentByNode = new Int16Array(modelData.nodes.length).fill(-1);
for (let parent = 0; parent < modelData.nodes.length; parent++) {
  for (const child of modelData.nodes[parent].children ?? []) {
    parentByNode[child] = parent;
  }
}

const inverseBindMatrices = modelData.jointNodes.map((_, i) =>
  modelData.inverseBindMatrices.slice(i * 16, (i + 1) * 16),
);

const modelTransform = mat4.identity();
mat4.translate(modelTransform, MODEL.offset, modelTransform);
mat4.scale(modelTransform, [MODEL.scale, MODEL.scale, MODEL.scale], modelTransform);

const getModelCenterFromJoints = (jointMatrices: d.m4x4f[]): d.v4f => {
  if (modelData.jointNodes.length === 0) {
    return d.vec4f(MODEL.offset[0], MODEL.offset[1], MODEL.offset[2], 1);
  }

  const rootJointMatrix = jointMatrices[0];
  return d.vec4f(rootJointMatrix[12], rootJointMatrix[13], rootJointMatrix[14], 1);
};

const getWorldTransform = (
  nodeIndex: number,
  animatedTransforms?: Map<number, NodeTransform>,
): Float32Array => {
  const parentIndex = parentByNode[nodeIndex];
  const parentWorld =
    parentIndex === -1 ? undefined : getWorldTransform(parentIndex, animatedTransforms);

  const node = modelData.nodes[nodeIndex];
  const anim = animatedTransforms?.get(nodeIndex);
  const localMatrix = mat4.identity();

  const translation = anim?.translation ?? node.translation;
  const rotation = anim?.rotation ?? node.rotation;
  const scale = anim?.scale ?? node.scale;

  if (translation) {
    mat4.translate(localMatrix, translation, localMatrix);
  }
  if (rotation) {
    mat4.mul(localMatrix, mat4.fromQuat(rotation), localMatrix);
  }
  if (scale) {
    mat4.scale(localMatrix, scale, localMatrix);
  }

  return parentWorld ? mat4.mul(parentWorld, localMatrix) : localMatrix;
};

const getJointMatrices = (): d.m4x4f[] => {
  const activeAnimation = modelData.animations.find(
    (anim) => anim.name === state.animation.selectedName,
  );
  const animatedTransforms = activeAnimation
    ? sampleAnimation(activeAnimation, state.animation.time)
    : undefined;

  const matrices = modelData.jointNodes.map((jointNode: number, i: number) => {
    const world = getWorldTransform(jointNode, animatedTransforms);
    const jointMatrix = mat4.mul(world, inverseBindMatrices[i], d.mat4x4f());
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

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const createDepthTexture = () =>
  root['~unstable']
    .createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      sampleCount: 4,
    })
    .$usage('render');

const createMsaaTexture = () =>
  root['~unstable']
    .createTexture({
      size: [canvas.width, canvas.height],
      format: presentationFormat,
      sampleCount: 4,
    })
    .$usage('render');

let depthTexture = createDepthTexture();
let msaaTexture = createMsaaTexture();

const cameraUniform = root.createUniform(d.mat4x4f);

const vertexBuffer = root
  .createBuffer(d.arrayOf(VertexData, modelData.vertexCount), createVertexData())
  .$usage('vertex');

const indexBuffer = root
  .createBuffer(
    d.arrayOf(d.u16, modelData.indices.length),
    Array.from(modelData.indices) as number[],
  )
  .$usage('index');

const initialJointMatrices = getJointMatrices();
state.camera.target = getModelCenterFromJoints(initialJointMatrices);

const jointMatricesUniform = root.createUniform(
  d.arrayOf(d.mat4x4f, MAX_JOINTS),
  initialJointMatrices,
);

const { cleanupCamera, targetCamera } = setupOrbitCamera(
  canvas,
  { initPos: state.camera.position, target: state.camera.target },
  (camera) => {
    if (camera.position) {
      state.camera.position = camera.position;
    }
    if (camera.view && camera.projection) {
      cameraUniform.write(mat4.mul(camera.projection, camera.view, d.mat4x4f()));
    }
  },
);

const vertexLayout = tgpu.vertexLayout(d.arrayOf(VertexData));

const vertex = tgpu.vertexFn({
  in: { position: d.vec3f, normal: d.vec3f, joint: d.vec4u, weight: d.vec4f },
  out: { pos: d.builtin.position, normal: d.vec3f },
})(({ position, normal, joint, weight }) => {
  'use gpu';
  const jm = jointMatricesUniform.$;
  const skinMatrix =
    jm[joint.x] * weight.x +
    jm[joint.y] * weight.y +
    jm[joint.z] * weight.z +
    jm[joint.w] * weight.w;

  return {
    pos: cameraUniform.$ * (skinMatrix * d.vec4f(position, 1)),
    normal: std.normalize((skinMatrix * d.vec4f(normal, 0)).xyz),
  };
});

const fragment = tgpu.fragmentFn({
  in: { normal: d.vec3f },
  out: d.vec4f,
})(({ normal }) => {
  'use gpu';
  const diffuse = std.saturate(std.dot(normal, std.normalize(d.vec3f(1, 0, 1))));
  return d.vec4f(d.vec3f(0.8) * (diffuse * 0.7 + 0.3), 1);
});

const pipeline = root
  .createRenderPipeline({
    vertex,
    fragment,
    attribs: vertexLayout.attrib,
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
    multisample: { count: 4 },
  })
  .withIndexBuffer(indexBuffer);

const resizeObserver = new ResizeObserver(() => {
  depthTexture = createDepthTexture();
  msaaTexture = createMsaaTexture();
});
resizeObserver.observe(canvas);

const updateCameraTarget = (jointMatrices: d.m4x4f[]) => {
  const desiredTarget = getModelCenterFromJoints(jointMatrices);
  state.camera.target = d.vec4f(
    state.camera.target.x + (desiredTarget.x - state.camera.target.x) * CAMERA_TARGET_SMOOTHING,
    state.camera.target.y +
      (desiredTarget.y + CAMERA_TARGET_Y_OFFSET - state.camera.target.y) * CAMERA_TARGET_SMOOTHING,
    state.camera.target.z + (desiredTarget.z - state.camera.target.z) * CAMERA_TARGET_SMOOTHING,
    1,
  );

  targetCamera(state.camera.position, state.camera.target);
};

const update = (deltaTimeMs: number) => {
  if (state.animation.playing) {
    state.animation.time += deltaTimeMs * 0.001;
  }

  const jointMatrices = getJointMatrices();
  jointMatricesUniform.write(jointMatrices);
  updateCameraTarget(jointMatrices);
};

const draw = () => {
  pipeline
    .with(vertexLayout, vertexBuffer)
    .withIndexBuffer(indexBuffer)
    .withColorAttachment({
      resolveTarget: context,
      view: msaaTexture,
    })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .drawIndexed(modelData.indices.length);
};

function render(time: number) {
  const deltaTime = Math.max(0, time - state.frame.lastTime);
  state.frame.lastTime = time;

  update(deltaTime);
  draw();

  animationId = requestAnimationFrame(render);
}

let animationId: number | undefined;
animationId = requestAnimationFrame(render);

export const controls = {
  Animation: {
    initial: 'Yes',
    options: animationOptions,
    onSelectChange: (v: string) => {
      state.animation.selectedName = v.replaceAll(' ', '_');
      state.animation.time = 0;
    },
  },
  'Play Animation': {
    initial: true,
    onToggleChange: (v: boolean) => {
      state.animation.playing = v;
    },
  },
  'Reset Animation': {
    onButtonClick: () => {
      state.animation.time = 0;
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
