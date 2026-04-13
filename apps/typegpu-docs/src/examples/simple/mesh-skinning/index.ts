import tgpu, { common } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { mat4, vec3 } from 'wgpu-matrix';
import { defineControls } from '../../common/defineControls.ts';
import { setupOrbitCamera } from '../../common/setup-orbit-camera.ts';
import {
  createNodeTransformState,
  sampleAnimationInto,
  type NodeTransformState,
} from './animation.ts';
import { loadGLBModel } from './loader.ts';
import { mat4ToDualQuat } from './math.ts';
import { generateTube } from './tube.ts';
import type { Animation, MeshData, SceneVariant } from './types.ts';
import { VertexData } from './types.ts';

const MODEL_ASSET = {
  path: '/TypeGPU/assets/mesh-skinning/DemoModel.glb',
  scale: 1,
  offset: [0, 0, 0],
} as const;

const MAX_JOINTS = 128;
const INITIAL_CAMERA_POSITION = [3, 3, 3, 1] as const;
const CAMERA_TARGET_SMOOTHING = 0.08;
const CAMERA_TARGET_Y_OFFSET = 0.9;
const TWIST_DEMO_ID = 'Twist_Demo';
const DEMO_MATERIAL_ID = 0;
const LIGHTING = {
  key: d.vec3f(0.42, 0.84, 0.33),
  fill: d.vec3f(-0.8, 0.25, 0.55),
  specularColor: d.vec3f(1.0, 0.96, 0.9),
} as const;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const modelData = await loadGLBModel(MODEL_ASSET.path);
const twistDemoMesh = generateTube(32, 8, 0.25, 2);

const variants: SceneVariant[] = [
  ...modelData.animations.map((animation) => ({
    id: animation.name,
    mesh: modelData,
  })),
  {
    id: TWIST_DEMO_ID,
    mesh: twistDemoMesh,
  },
];

const selectedVariantId =
  variants.find((variant) => variant.id === 'Yes')?.id ?? variants[0]?.id ?? TWIST_DEMO_ID;
const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);
if (!selectedVariant) {
  throw new Error('Mesh skinning example has no scene variants to render.');
}
if (modelData.jointNodes.length > MAX_JOINTS) {
  throw new Error(
    `Model has ${modelData.jointNodes.length} joints but MAX_JOINTS is ${MAX_JOINTS}.`,
  );
}

const parentByNode = new Int16Array(modelData.nodes.length).fill(-1);
for (let parent = 0; parent < modelData.nodes.length; parent++) {
  for (const child of modelData.nodes[parent].children ?? []) {
    parentByNode[child] = parent;
  }
}

const inverseBindViews = modelData.jointNodes.map((_, index) =>
  modelData.inverseBindMatrices.subarray(index * 16, (index + 1) * 16),
);

const modelTransform = mat4.identity();
mat4.translate(modelTransform, MODEL_ASSET.offset, modelTransform);
mat4.scale(
  modelTransform,
  [MODEL_ASSET.scale, MODEL_ASSET.scale, MODEL_ASSET.scale],
  modelTransform,
);

const CpuState = {
  animatedTransforms: createNodeTransformState(modelData.nodes.length),
  animatedTransformIndices: [] as number[],
  nodeWorld: modelData.nodes.map(() => new Float32Array(16)),
  nodeWorldDirty: new Uint8Array(modelData.nodes.length),
  local: new Float32Array(16),
  quatMatrix: new Float32Array(16),
  jointWorld: modelData.jointNodes.map(() => new Float32Array(16)),
  jointMatrices: new Float32Array(MAX_JOINTS * 16),
  jointDualQuats: new Float32Array(MAX_JOINTS * 8),
  quatScratch: new Float32Array(4),
  rootJointPosition: new Float32Array(3),
  smoothedTarget: new Float32Array(3),
  cameraMatrix: new Float32Array(16),
};

for (let index = modelData.jointNodes.length; index < MAX_JOINTS; index++) {
  mat4.identity(CpuState.jointMatrices.subarray(index * 16, index * 16 + 16));
  CpuState.jointDualQuats[index * 8 + 3] = 1;
}

const root = await tgpu.init();
const context = root.configureContext({ canvas });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

function createDepthTexture() {
  return root['~unstable']
    .createTexture({
      size: [canvas.width, canvas.height],
      format: 'depth24plus',
      sampleCount: 4,
    })
    .$usage('render');
}

function createMsaaTexture() {
  return root['~unstable']
    .createTexture({
      size: [canvas.width, canvas.height],
      format: presentationFormat,
      sampleCount: 4,
    })
    .$usage('render');
}

let depthTexture = createDepthTexture();
let msaaTexture = createMsaaTexture();
const materialPalette = [
  d.vec4f(0.82, 0.82, 0.82, 1),
  ...modelData.materials.map((material) => d.vec4f(...material)),
];

const cameraUniform = root.createUniform(d.mat4x4f);
const cameraPositionUniform = root.createUniform(d.vec4f, d.vec4f(...INITIAL_CAMERA_POSITION));
const materialUniform = root.createReadonly(
  d.arrayOf(d.vec4f, materialPalette.length),
  materialPalette,
);
const jointMatricesUniform = root.createUniform(
  d.arrayOf(d.mat4x4f, MAX_JOINTS),
  CpuState.jointMatrices,
);
const jointDualQuatsUniform = root.createUniform(
  d.arrayOf(d.vec4f, MAX_JOINTS * 2),
  CpuState.jointDualQuats,
);

function createRenderMesh(mesh: MeshData, materialIdOffset = 0) {
  const materialIds =
    materialIdOffset === 0
      ? mesh.materialIds
      : mesh.materialIds.map((materialId) => materialId + materialIdOffset);

  return {
    vertexBuffer: root
      .createBuffer(d.arrayOf(VertexData, mesh.vertexCount), (buffer) => {
        common.writeSoA(buffer, {
          position: mesh.positions,
          normal: mesh.normals,
          materialId: materialIds,
          joint: mesh.joints,
          weight: mesh.weights,
        });
      })
      .$usage('vertex'),
    indexBuffer: root
      .createBuffer(d.arrayOf(d.u16, mesh.indexCount), Array.from(mesh.indices))
      .$usage('index'),
    indexCount: mesh.indexCount,
  };
}

const modelRenderMesh = createRenderMesh(modelData, 1);
const demoRenderMesh = createRenderMesh(twistDemoMesh, DEMO_MATERIAL_ID);

const vertexLayout = tgpu.vertexLayout(d.arrayOf(VertexData));

const vertex = tgpu.vertexFn({
  in: { position: d.vec3f, normal: d.vec3f, materialId: d.u32, joint: d.vec4u, weight: d.vec4f },
  out: { pos: d.builtin.position, normal: d.vec3f, color: d.vec3f, worldPos: d.vec3f },
})(({ position, normal, materialId, joint, weight }) => {
  'use gpu';
  const jointMatrices = jointMatricesUniform.$;
  const skinMatrix =
    jointMatrices[joint.x] * weight.x +
    jointMatrices[joint.y] * weight.y +
    jointMatrices[joint.z] * weight.z +
    jointMatrices[joint.w] * weight.w;
  const skinnedPosition = skinMatrix * d.vec4f(position, 1);

  return {
    pos: cameraUniform.$ * skinnedPosition,
    normal: std.normalize((skinMatrix * d.vec4f(normal, 0)).xyz),
    color: materialUniform.$[materialId].xyz,
    worldPos: skinnedPosition.xyz,
  };
});

const rotateByUnitQuat = (value: d.v3f, quaternion: d.v4f): d.v3f => {
  'use gpu';
  const tangent = 2 * std.cross(quaternion.xyz, value);
  return value + quaternion.w * tangent + std.cross(quaternion.xyz, tangent);
};

const dqsVertex = tgpu.vertexFn({
  in: { position: d.vec3f, normal: d.vec3f, materialId: d.u32, joint: d.vec4u, weight: d.vec4f },
  out: { pos: d.builtin.position, normal: d.vec3f, color: d.vec3f, worldPos: d.vec3f },
})(({ position, normal, materialId, joint, weight }) => {
  'use gpu';
  const dualQuats = jointDualQuatsUniform.$;
  const referenceReal = dualQuats[joint.x * 2];
  let realAccum = referenceReal * weight.x;
  let dualAccum = dualQuats[joint.x * 2 + 1] * weight.x;

  for (const index of tgpu.unroll([1, 2, 3])) {
    const base = joint[index] * 2;
    const real = dualQuats[base];
    const signedWeight =
      weight[index] * std.select(d.f32(-1), 1, std.dot(referenceReal, real) >= 0);
    realAccum = realAccum + real * signedWeight;
    dualAccum = dualAccum + dualQuats[base + 1] * signedWeight;
  }

  const invLength = 1 / std.length(realAccum);
  const real = realAccum * invLength;
  const dual = dualAccum * invLength;
  const translation = 2.0 * (real.w * dual.xyz - dual.w * real.xyz + std.cross(real.xyz, dual.xyz));

  const worldPos = rotateByUnitQuat(position, real) + translation;

  return {
    pos: cameraUniform.$ * d.vec4f(worldPos, 1),
    normal: std.normalize(rotateByUnitQuat(normal, real)),
    color: materialUniform.$[materialId].xyz,
    worldPos,
  };
});

const fragment = tgpu.fragmentFn({
  in: { normal: d.vec3f, color: d.vec3f, worldPos: d.vec3f },
  out: d.vec4f,
})(({ normal, color, worldPos }) => {
  'use gpu';
  const viewDir = std.normalize(cameraPositionUniform.$.xyz - worldPos);
  const key = std.saturate(std.dot(normal, LIGHTING.key));
  const fill = std.saturate(std.dot(normal, LIGHTING.fill));
  const halfVector = std.normalize(LIGHTING.key + viewDir);
  const specular = std.pow(std.saturate(std.dot(normal, halfVector)), 32);
  const finalColor = std.saturate(
    color * (0.2 + key * 0.9 + fill * 0.25) + LIGHTING.specularColor * specular * 0.18,
  );

  return d.vec4f(finalColor, 1);
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

const lbsPipeline = root.createRenderPipeline({ vertex, ...pipelineConfig });
const dqsPipeline = root.createRenderPipeline({ vertex: dqsVertex, ...pipelineConfig });

const resizeObserver = new ResizeObserver(() => {
  depthTexture = createDepthTexture();
  msaaTexture = createMsaaTexture();
});
resizeObserver.observe(canvas);

const state = {
  selectedVariantId,
  isPlaying: true,
  timeSeconds: 0,
  lastFrameTimeMs: 0,
  useDualQuaternions: false,
  cameraPosition: d.vec4f(...INITIAL_CAMERA_POSITION),
  cameraTarget: d.vec4f(0, 0, 0, 1),
};

let activeVariant = selectedVariant;
let activeAnimation: Animation | undefined =
  selectedVariant.id !== TWIST_DEMO_ID
    ? modelData.animations.find((animation) => animation.name === selectedVariant.id)
    : undefined;

function toLabel(id: string) {
  return id.replaceAll('_', ' ');
}

function fromLabel(label: string) {
  return label.replaceAll(' ', '_');
}

function getRootJointPosition(): Float32Array {
  mat4.getTranslation(CpuState.jointWorld[0], CpuState.rootJointPosition);
  return CpuState.rootJointPosition;
}

function updateCameraTarget(position: Float32Array): d.v4f {
  position[1] += CAMERA_TARGET_Y_OFFSET;
  vec3.lerp(CpuState.smoothedTarget, position, CAMERA_TARGET_SMOOTHING, CpuState.smoothedTarget);
  return d.vec4f(
    CpuState.smoothedTarget[0],
    CpuState.smoothedTarget[1],
    CpuState.smoothedTarget[2],
    1,
  );
}

function getAnimationById(id: string): Animation | undefined {
  return id === TWIST_DEMO_ID
    ? undefined
    : modelData.animations.find((animation) => animation.name === id);
}

function computeWorldTransform(
  nodeIndex: number,
  animatedTransforms: NodeTransformState,
): Float32Array {
  if (CpuState.nodeWorldDirty[nodeIndex]) {
    return CpuState.nodeWorld[nodeIndex];
  }

  const parentIndex = parentByNode[nodeIndex];
  const parentWorld =
    parentIndex === -1 ? undefined : computeWorldTransform(parentIndex, animatedTransforms);
  const node = modelData.nodes[nodeIndex];
  const animated = animatedTransforms[nodeIndex];

  mat4.identity(CpuState.local);
  if (animated.hasTranslation || node.translation) {
    mat4.translate(
      CpuState.local,
      animated.hasTranslation ? animated.translation : (node.translation ?? [0, 0, 0]),
      CpuState.local,
    );
  }
  if (animated.hasRotation || node.rotation) {
    mat4.mul(
      CpuState.local,
      mat4.fromQuat(
        animated.hasRotation ? animated.rotation : (node.rotation ?? [0, 0, 0, 1]),
        CpuState.quatMatrix,
      ),
      CpuState.local,
    );
  }
  if (animated.hasScale || node.scale) {
    mat4.scale(
      CpuState.local,
      animated.hasScale ? animated.scale : (node.scale ?? [1, 1, 1]),
      CpuState.local,
    );
  }

  const destination = CpuState.nodeWorld[nodeIndex];
  if (parentWorld) {
    mat4.mul(parentWorld, CpuState.local, destination);
  } else {
    destination.set(CpuState.local);
  }

  CpuState.nodeWorldDirty[nodeIndex] = 1;
  return destination;
}

function writeJointDualQuat(jointIndex: number) {
  const matrixOffset = jointIndex * 16;
  mat4ToDualQuat(
    CpuState.jointMatrices.subarray(matrixOffset, matrixOffset + 16),
    CpuState.quatScratch,
    CpuState.jointDualQuats,
    jointIndex * 8,
  );
}

function updateModelSkinning() {
  const animatedTransforms = sampleAnimationInto(
    activeAnimation,
    state.timeSeconds,
    CpuState.animatedTransforms,
    CpuState.animatedTransformIndices,
  );

  CpuState.nodeWorldDirty.fill(0);
  for (let jointIndex = 0; jointIndex < modelData.jointNodes.length; jointIndex++) {
    const world = computeWorldTransform(modelData.jointNodes[jointIndex], animatedTransforms);
    mat4.mul(modelTransform, world, CpuState.jointWorld[jointIndex]);

    const matrixOffset = jointIndex * 16;
    mat4.mul(
      CpuState.jointWorld[jointIndex],
      inverseBindViews[jointIndex],
      CpuState.jointMatrices.subarray(matrixOffset, matrixOffset + 16),
    );
    writeJointDualQuat(jointIndex);
  }

  state.cameraTarget = updateCameraTarget(getRootJointPosition());
}

function updateTwistDemo() {
  const twist = Math.sin(state.timeSeconds * 0.5) * Math.PI;

  mat4.identity(CpuState.jointMatrices.subarray(0, 16));
  CpuState.quatScratch.set([0, Math.sin(twist / 2), 0, Math.cos(twist / 2)]);
  mat4.fromQuat(CpuState.quatScratch, CpuState.jointMatrices.subarray(16, 32));

  writeJointDualQuat(0);
  writeJointDualQuat(1);
  for (let jointIndex = 2; jointIndex < modelData.jointNodes.length; jointIndex++) {
    const matrixOffset = jointIndex * 16;
    mat4.identity(CpuState.jointMatrices.subarray(matrixOffset, matrixOffset + 16));
    CpuState.jointDualQuats.fill(0, jointIndex * 8, jointIndex * 8 + 8);
    CpuState.jointDualQuats[jointIndex * 8 + 3] = 1;
  }

  state.cameraTarget = d.vec4f(0, 0, 0, 1);
}

function getInitialCameraTarget(): d.v4f {
  if (activeVariant.id === TWIST_DEMO_ID) {
    CpuState.smoothedTarget.fill(0);
    return d.vec4f(0, 0, 0, 1);
  }

  updateModelSkinning();
  const rootJointPosition = getRootJointPosition();
  CpuState.smoothedTarget[0] = rootJointPosition[0];
  CpuState.smoothedTarget[1] = rootJointPosition[1] + CAMERA_TARGET_Y_OFFSET;
  CpuState.smoothedTarget[2] = rootJointPosition[2];
  return d.vec4f(
    CpuState.smoothedTarget[0],
    CpuState.smoothedTarget[1],
    CpuState.smoothedTarget[2],
    1,
  );
}

function setActiveVariant(variant: SceneVariant) {
  activeVariant = variant;
  activeAnimation = getAnimationById(variant.id);

  state.selectedVariantId = variant.id;
  state.timeSeconds = 0;
  sampleAnimationInto(
    activeAnimation,
    0,
    CpuState.animatedTransforms,
    CpuState.animatedTransformIndices,
  );
  state.cameraTarget = getInitialCameraTarget();
  targetCamera(state.cameraPosition, state.cameraTarget);
}

function drawFrame() {
  jointMatricesUniform.write(CpuState.jointMatrices);
  jointDualQuatsUniform.write(CpuState.jointDualQuats);

  const renderMesh = activeVariant.id === TWIST_DEMO_ID ? demoRenderMesh : modelRenderMesh;
  const pipeline = state.useDualQuaternions ? dqsPipeline : lbsPipeline;

  pipeline
    .with(vertexLayout, renderMesh.vertexBuffer)
    .withIndexBuffer(renderMesh.indexBuffer)
    .withColorAttachment({ resolveTarget: context, view: msaaTexture })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .drawIndexed(renderMesh.indexCount);
}

state.cameraTarget = getInitialCameraTarget();

const { cleanupCamera, targetCamera } = setupOrbitCamera(
  canvas,
  { initPos: state.cameraPosition, target: state.cameraTarget },
  (camera) => {
    if (camera.position) {
      state.cameraPosition = camera.position;
      cameraPositionUniform.write(camera.position);
    }
    if (camera.view && camera.projection) {
      cameraUniform.write(mat4.mul(camera.projection, camera.view, CpuState.cameraMatrix));
    }
  },
);

function render(frameTimeMs: number) {
  const deltaTimeMs = Math.max(0, frameTimeMs - state.lastFrameTimeMs);
  state.lastFrameTimeMs = frameTimeMs;

  if (state.isPlaying) {
    state.timeSeconds += deltaTimeMs * 0.001;
  }

  if (activeVariant.id === TWIST_DEMO_ID) {
    updateTwistDemo();
  } else {
    updateModelSkinning();
    targetCamera(state.cameraPosition, state.cameraTarget);
  }

  drawFrame();
  animationId = requestAnimationFrame(render);
}

let animationId: number | undefined;
animationId = requestAnimationFrame(render);

export const controls = defineControls({
  Animation: {
    initial: toLabel(selectedVariant.id),
    options: variants.map((variant) => toLabel(variant.id)),
    onSelectChange: (label: string) => {
      const variant = variants.find((entry) => entry.id === fromLabel(label));
      if (variant) {
        setActiveVariant(variant);
      }
    },
  },
  'Play Animation': {
    initial: true,
    onToggleChange: (value: boolean) => {
      state.isPlaying = value;
    },
  },
  'Reset Animation': {
    onButtonClick: () => {
      state.timeSeconds = 0;
    },
  },
  'Dual Quaternion Skinning': {
    initial: false,
    onToggleChange: (value: boolean) => {
      state.useDualQuaternions = value;
    },
  },
});

export function onCleanup() {
  if (animationId !== undefined) {
    cancelAnimationFrame(animationId);
  }
  resizeObserver.disconnect();
  cleanupCamera();
  root.destroy();
}
