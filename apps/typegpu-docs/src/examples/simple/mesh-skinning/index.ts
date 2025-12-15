import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { mat4 } from 'wgpu-matrix';
import { loadGLBModel } from './loader.ts';
import { VertexData } from './types.ts';
import { setupOrbitCamera } from './setup-orbit-camera.ts';

const modelData = await loadGLBModel(
  '/TypeGPU/assets/mesh-skinning/LongBoi.glb',
);

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

    const viewProjectionMatrix = mat4.mul(
      projectionMatrix,
      viewMatrix,
      d.mat4x4f(),
    );
    cameraUniform.write(viewProjectionMatrix);
  },
);

function createQuaternionFromAxisAngle(
  axis: [number, number, number],
  angle: number,
): [number, number, number, number] {
  const halfAngle = angle / 2;
  const s = Math.sin(halfAngle);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(halfAngle)];
}

function multiplyQuaternions(
  q1: [number, number, number, number],
  q2: [number, number, number, number],
): [number, number, number, number] {
  const [x1, y1, z1, w1] = q1;
  const [x2, y2, z2, w2] = q2;
  return [
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
  ];
}

let twistEnabled = true;
let bendEnabled = true;
let bendTime = 0;
let twistTime = 0;
let lastFrameTime = 0;

function animateBone(
  nodeIndex: number,
): [number, number, number, number] | null {
  if (nodeIndex === 0) {
    const bendAngle = Math.sin(bendTime * 0.001) * Math.PI * 0.5;
    const bendQuat = createQuaternionFromAxisAngle([0, 0, 1], bendAngle);

    const twistAngle = Math.sin(twistTime * 0.0015) * Math.PI * 0.3;
    const twistQuat = createQuaternionFromAxisAngle([0, 1, 0], twistAngle);

    return multiplyQuaternions(twistQuat, bendQuat);
  }
  return null;
}

function getWorldTransform(
  nodeIndex: number,
  parentTransform?: Float32Array,
  time?: number,
): Float32Array {
  const node = modelData.nodes[nodeIndex];
  const localMatrix = mat4.identity();

  if (node.translation) {
    mat4.translate(localMatrix, node.translation, localMatrix);
  }
  if (node.rotation) {
    let rotation = node.rotation;

    if (time !== undefined) {
      const animatedRotation = animateBone(nodeIndex);
      if (animatedRotation) {
        rotation = animatedRotation;
      }
    }

    const rotMat = mat4.fromQuat(rotation);
    mat4.mul(localMatrix, rotMat, localMatrix);
  }
  if (node.scale) {
    mat4.scale(localMatrix, node.scale, localMatrix);
  }

  if (parentTransform) {
    return mat4.mul(parentTransform, localMatrix);
  }

  // Find parent
  for (let i = 0; i < modelData.nodes.length; i++) {
    if (modelData.nodes[i].children?.includes(nodeIndex)) {
      const parent = getWorldTransform(i, undefined, time);
      return mat4.mul(parent, localMatrix);
    }
  }

  return localMatrix;
}

function updateJointMatrices(time: number): d.m4x4f[] {
  const matrices: d.m4x4f[] = [];

  for (let i = 0; i < modelData.jointNodes.length; i++) {
    const worldTransform = getWorldTransform(
      modelData.jointNodes[i],
      undefined,
      time,
    );
    const invBindMatrix = new Float32Array(16);

    for (let j = 0; j < 16; j++) {
      invBindMatrix[j] = modelData.inverseBindMatrices[i * 16 + j];
    }

    const jointMatrix = mat4.mul(worldTransform, invBindMatrix, d.mat4x4f());
    matrices.push(jointMatrix);
  }

  return matrices;
}

// Create vertex data
function createVertexData(): d.Infer<typeof VertexData>[] {
  const data: d.Infer<typeof VertexData>[] = [];

  for (let i = 0; i < modelData.vertexCount; i++) {
    data.push({
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
      joint: d.vec2u(
        modelData.joints[i * 2],
        modelData.joints[i * 2 + 1],
      ),
      weight: d.vec2f(
        modelData.weights[i * 2],
        modelData.weights[i * 2 + 1],
      ),
    });
  }

  return data;
}

const vertexBuffer = root
  .createBuffer(
    d.arrayOf(VertexData, modelData.vertexCount),
    createVertexData(),
  )
  .$usage('vertex');

const indexBuffer = root
  .createBuffer(
    d.arrayOf(d.u16, modelData.indices.length),
    Array.from(modelData.indices),
  )
  .$usage('index');

const jointMatricesUniform = root
  .createUniform(d.arrayOf(d.mat4x4f, 2), updateJointMatrices(0));

const vertexLayout = tgpu.vertexLayout(d.arrayOf(VertexData));

const vertex = tgpu['~unstable'].vertexFn({
  in: {
    position: d.vec3f,
    normal: d.vec3f,
    joint: d.vec2u,
    weight: d.vec2f,
  },
  out: {
    pos: d.builtin.position,
    normal: d.vec3f,
  },
})(({ position, normal, joint, weight }) => {
  const jointMatrices = jointMatricesUniform.$;
  const viewProj = cameraUniform.$;

  const skinMatrix = jointMatrices[joint.x].mul(weight.x).add(
    jointMatrices[joint.y].mul(weight.y),
  );

  const skinnedPos = skinMatrix.mul(d.vec4f(position, 1));
  const skinnedNormal = skinMatrix.mul(d.vec4f(normal, 0)).xyz;

  return {
    pos: viewProj.mul(skinnedPos),
    normal: std.normalize(skinnedNormal),
  };
});

const fragment = tgpu['~unstable'].fragmentFn({
  in: {
    normal: d.vec3f,
  },
  out: d.vec4f,
})(({ normal }) => {
  const lightDir = std.normalize(d.vec3f(1, 0, 1));
  const diffuse = std.saturate(std.dot(normal, lightDir));
  const color = d.vec3f(0.8, 0.8, 0.8).mul(diffuse * 0.7 + 0.3);
  return d.vec4f(color, 1.0);
});

const pipeline = root['~unstable']
  .withVertex(vertex, {
    ...vertexLayout.attrib,
  })
  .withFragment(fragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'less',
  })
  .createPipeline()
  .withIndexBuffer(indexBuffer);

const resizeObserver = new ResizeObserver(() => {
  depthTexture = root['~unstable'].createTexture({
    size: [canvas.width, canvas.height],
    format: 'depth24plus',
  }).$usage('render');
});
resizeObserver.observe(canvas);

function render(time: number) {
  const deltaTime = lastFrameTime === 0 ? 0 : time - lastFrameTime;
  lastFrameTime = time;

  if (bendEnabled) {
    bendTime += deltaTime;
  }
  if (twistEnabled) {
    twistTime += deltaTime;
  }

  jointMatricesUniform.write(updateJointMatrices(time));

  pipeline
    .with(vertexLayout, vertexBuffer)
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTexture,
      depthClearValue: 1.0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .drawIndexed(modelData.indices.length);

  animationId = requestAnimationFrame(render);
}

let animationId: number | undefined;

animationId = requestAnimationFrame(render);

export const controls = {
  Twist: {
    initial: false,
    onToggleChange: (v: boolean) => {
      twistEnabled = v;
    },
  },
  Move: {
    initial: false,
    onToggleChange: (v: boolean) => {
      bendEnabled = v;
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
