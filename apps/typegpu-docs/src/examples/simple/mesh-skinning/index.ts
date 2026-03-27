import tgpu, { common } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { mat4, quat, vec3 } from 'wgpu-matrix';
import { setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import { type NodeTransform, sampleAnimation } from './animation.ts';
import { loadGLBModel } from './loader.ts';
import { mat4ToDualQuat } from './math.ts';
import { type ModelData, VertexData } from './types.ts';
import { generateTube } from './tube.ts';

const MODEL = {
  path: '/TypeGPU/assets/mesh-skinning/NewModel.glb',
  scale: 1,
  offset: [0, 0, 0],
};

const MAX_JOINTS = 128;
const CAMERA_TARGET_SMOOTHING = 0.08;
const CAMERA_TARGET_Y_OFFSET = 0.9;

const modelData: ModelData = await loadGLBModel(MODEL.path);
if (modelData.jointNodes.length > MAX_JOINTS) {
  throw new Error(
    `Model has ${modelData.jointNodes.length} joints but MAX_JOINTS is ${MAX_JOINTS}.`,
  );
}

const animationOptions = [
  'Twist Demo',
  ...modelData.animations.map((anim) => anim.name.replaceAll('_', ' ')),
];

const tube = generateTube(32, 8, 0.25, 2);

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
  useDualQuaternions: false,
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

// Pre-allocated arrays for computations to avoid GC overhead
const pool = {
  nodeWorld: modelData.nodes.map(() => new Float32Array(16)),
  nodeWorldDirty: new Uint8Array(modelData.nodes.length),
  local: new Float32Array(16),
  quat: new Float32Array(16),
  camera: new Float32Array(16),
  jointWorld: modelData.jointNodes.map(() => new Float32Array(16)),
  jointMatrices: new Float32Array(MAX_JOINTS * 16),
  jointPos: new Float32Array(3),
  cameraTarget: new Float32Array(3),
  jointDualQuats: new Float32Array(MAX_JOINTS * 8),
  quatTemp: new Float32Array(4),
};

for (let i = modelData.jointNodes.length; i < MAX_JOINTS; i++) {
  mat4.identity(pool.jointMatrices.subarray(i * 16, i * 16 + 16));
  // Identity dual quaternion: real = (0,0,0,1), dual = (0,0,0,0)
  pool.jointDualQuats[i * 8 + 3] = 1;
}

const getRootJointPosition = (): Float32Array => {
  mat4.getTranslation(pool.jointWorld[0], pool.jointPos);
  return pool.jointPos;
};

const smoothTrackTarget = (target: Float32Array): d.v4f => {
  target[1] += CAMERA_TARGET_Y_OFFSET;
  vec3.lerp(pool.cameraTarget, target, CAMERA_TARGET_SMOOTHING, pool.cameraTarget);
  return d.vec4f(pool.cameraTarget[0], pool.cameraTarget[1], pool.cameraTarget[2], 1);
};

const computeWorldTransform = (
  nodeIndex: number,
  animatedTransforms?: Map<number, NodeTransform>,
): Float32Array => {
  if (pool.nodeWorldDirty[nodeIndex]) {
    return pool.nodeWorld[nodeIndex];
  }

  const parentIndex = parentByNode[nodeIndex];
  const parentWorld =
    parentIndex === -1 ? undefined : computeWorldTransform(parentIndex, animatedTransforms);

  const node = modelData.nodes[nodeIndex];
  const anim = animatedTransforms?.get(nodeIndex);

  const translation = anim?.translation ?? node.translation;
  const rotation = anim?.rotation ?? node.rotation;
  const scale = anim?.scale ?? node.scale;

  mat4.identity(pool.local);
  if (translation) {
    mat4.translate(pool.local, translation, pool.local);
  }
  if (rotation) {
    mat4.mul(pool.local, mat4.fromQuat(rotation, pool.quat), pool.local);
  }
  if (scale) {
    mat4.scale(pool.local, scale, pool.local);
  }

  const dst = pool.nodeWorld[nodeIndex];
  if (parentWorld) {
    mat4.mul(parentWorld, pool.local, dst);
  } else {
    dst.set(pool.local);
  }

  pool.nodeWorldDirty[nodeIndex] = 1;
  return dst;
};

const updateJointMatrices = () => {
  const activeAnim = modelData.animations.find(
    (anim) => anim.name === state.animation.selectedName,
  );
  const animTransforms = activeAnim ? sampleAnimation(activeAnim, state.animation.time) : undefined;

  pool.nodeWorldDirty.fill(0);
  for (let i = 0; i < modelData.jointNodes.length; i++) {
    const world = computeWorldTransform(modelData.jointNodes[i], animTransforms);
    mat4.mul(modelTransform, world, pool.jointWorld[i]);
    const mo = i * 16;
    mat4.mul(pool.jointWorld[i], inverseBindMatrices[i], pool.jointMatrices.subarray(mo, mo + 16));
    mat4ToDualQuat(
      pool.jointMatrices.subarray(mo, mo + 16),
      quat.fromMat,
      pool.quatTemp,
      pool.jointDualQuats,
      i * 8,
    );
  }
};

const updateTwistDemo = () => {
  const twist = Math.sin(state.animation.time * 0.5) * Math.PI;

  // Joint 0: identity (bottom half stays fixed)
  mat4.identity(pool.jointMatrices.subarray(0, 16));
  // Joint 1: Y-axis rotation (top half twists)
  pool.quatTemp.set([0, Math.sin(twist / 2), 0, Math.cos(twist / 2)]);
  mat4.fromQuat(pool.quatTemp, pool.jointMatrices.subarray(16, 32));

  for (let i = 0; i < 2; i++) {
    mat4ToDualQuat(
      pool.jointMatrices.subarray(i * 16, i * 16 + 16),
      quat.fromMat,
      pool.quatTemp,
      pool.jointDualQuats,
      i * 8,
    );
  }
};

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
  .createBuffer(d.arrayOf(VertexData, modelData.vertexCount), (buffer) => {
    common.writeSoA(buffer, {
      position: modelData.positions,
      normal: modelData.normals,
      joint: modelData.joints,
      weight: modelData.weights,
    });
  })
  .$usage('vertex');

const indexBuffer = root
  .createBuffer(d.arrayOf(d.u16, modelData.indices.length), Array.from(modelData.indices))
  .$usage('index');

const tubeVertexBuffer = root
  .createBuffer(d.arrayOf(VertexData, tube.vertexCount), (buffer) => {
    common.writeSoA(buffer, {
      position: tube.positions,
      normal: tube.normals,
      joint: tube.joints,
      weight: tube.weights,
    });
  })
  .$usage('vertex');

const tubeIndexBuffer = root
  .createBuffer(d.arrayOf(d.u16, tube.indexCount), Array.from(tube.indices))
  .$usage('index');

updateTwistDemo();
updateJointMatrices();
const initTarget = getRootJointPosition();
pool.cameraTarget.set(initTarget);
state.camera.target = d.vec4f(initTarget[0], initTarget[1], initTarget[2], 1);

const jointMatricesUniform = root.createUniform(
  d.arrayOf(d.mat4x4f, MAX_JOINTS),
  pool.jointMatrices,
);

const jointDualQuatsUniform = root.createUniform(
  d.arrayOf(d.vec4f, MAX_JOINTS * 2),
  pool.jointDualQuats,
);

const { cleanupCamera, targetCamera } = setupOrbitCamera(
  canvas,
  { initPos: state.camera.position, target: state.camera.target },
  (camera) => {
    if (camera.position) {
      state.camera.position = camera.position;
    }
    if (camera.view && camera.projection) {
      cameraUniform.write(mat4.mul(camera.projection, camera.view, pool.camera));
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

const pipelineConfig = {
  fragment,
  attribs: vertexLayout.attrib,
  depthStencil: {
    format: 'depth24plus' as const,
    depthWriteEnabled: true,
    depthCompare: 'less' as const,
  },
  multisample: { count: 4 },
};

const lbsPipeline = root
  .createRenderPipeline({ vertex, ...pipelineConfig })
  .withIndexBuffer(indexBuffer);

const rotateByUnitQuat = (v: d.v3f, q: d.v4f): d.v3f => {
  'use gpu';
  const t = 2 * std.cross(q.xyz, v);
  return v + q.w * t + std.cross(q.xyz, t);
};

const dqsVertex = tgpu.vertexFn({
  in: { position: d.vec3f, normal: d.vec3f, joint: d.vec4u, weight: d.vec4f },
  out: { pos: d.builtin.position, normal: d.vec3f },
})(({ position, normal, joint, weight }) => {
  'use gpu';
  const dq = jointDualQuatsUniform.$;

  // Load first joint's dual quaternion as reference for antipodality
  const refReal = dq[joint.x * 2];
  let realAccum = refReal * weight.x;
  let dualAccum = dq[joint.x * 2 + 1] * weight.x;

  // Blend remaining joints, flipping sign when quaternions are in opposite hemispheres
  for (const i of tgpu.unroll([1, 2, 3])) {
    const base = joint[i] * 2;
    const real = dq[base];
    const signedWeight = weight[i] * std.select(-1, 1, std.dot(refReal, real) >= 0);
    realAccum = realAccum + real * signedWeight;
    dualAccum = dualAccum + dq[base + 1] * signedWeight;
  }

  // Normalize the blended dual quaternion
  const invLen = 1 / std.length(realAccum);
  const c0 = realAccum * invLen;
  const ce = dualAccum * invLen;

  // Translation from dual quaternion
  const q = c0.xyz;
  const qe = ce.xyz;
  const t = 2.0 * (c0.w * qe - ce.w * q + std.cross(q, qe));

  // Transform position (rotation + translation) and normal (rotation only)
  const skinnedPos = rotateByUnitQuat(position, c0) + t;
  const skinnedNormal = std.normalize(rotateByUnitQuat(normal, c0));

  return {
    pos: cameraUniform.$ * d.vec4f(skinnedPos, 1),
    normal: skinnedNormal,
  };
});

const dqsPipeline = root
  .createRenderPipeline({ vertex: dqsVertex, ...pipelineConfig })
  .withIndexBuffer(indexBuffer);

const resizeObserver = new ResizeObserver(() => {
  depthTexture = createDepthTexture();
  msaaTexture = createMsaaTexture();
});
resizeObserver.observe(canvas);

function render(time: number) {
  const dt = Math.max(0, time - state.frame.lastTime);
  state.frame.lastTime = time;

  if (state.animation.playing) {
    state.animation.time += dt * 0.001;
  }

  const isDemoMode = state.animation.selectedName === 'Twist_Demo';
  if (isDemoMode) {
    updateTwistDemo();
  } else {
    updateJointMatrices();
    state.camera.target = smoothTrackTarget(getRootJointPosition());
  }
  targetCamera(state.camera.position, state.camera.target);

  jointMatricesUniform.write(pool.jointMatrices);
  jointDualQuatsUniform.write(pool.jointDualQuats);

  const activeVerts = isDemoMode ? tubeVertexBuffer : vertexBuffer;
  const activeIdx = isDemoMode ? tubeIndexBuffer : indexBuffer;
  const activeCount = isDemoMode ? tube.indexCount : modelData.indices.length;

  const activePipeline = state.useDualQuaternions ? dqsPipeline : lbsPipeline;
  activePipeline
    .with(vertexLayout, activeVerts)
    .withIndexBuffer(activeIdx)
    .withColorAttachment({ resolveTarget: context, view: msaaTexture })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .drawIndexed(activeCount);

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
      if (v === 'Twist Demo') {
        pool.cameraTarget.set([0, 0, 0]);
        state.camera.target = d.vec4f(0, 0, 0, 1);
        targetCamera(state.camera.position, state.camera.target);
      }
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
  'Dual Quaternion Skinning': {
    initial: false,
    onToggleChange: (v: boolean) => {
      state.useDualQuaternions = v;
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
