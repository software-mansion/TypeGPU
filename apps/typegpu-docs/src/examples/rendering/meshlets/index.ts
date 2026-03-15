import tgpu, { d, std } from 'typegpu';
import { Camera, setupFirstPersonCamera } from '../../common/setup-first-person-camera.ts';
import { loadMeshlets, loadObj } from './loader.ts';

const MODEL_SCALE = 0.01;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const timingEl = document.querySelector<HTMLElement>('#timing');
const root = await tgpu.init({ device: { optionalFeatures: ['timestamp-query'] } });
const context = root.configureContext({ canvas });

const PackedVec3 = d.struct({ x: d.f32, y: d.f32, z: d.f32 });

const MeshletDesc = d.struct({
  vertexOffset: d.u32,
  triangleOffset: d.u32,
  vertexCount: d.u32,
  triangleCount: d.u32,
});

const IndirectDraw = d.struct({
  vertexCount: d.u32,
  instanceCount: d.atomic(d.u32),
  firstVertex: d.u32,
  firstInstance: d.u32,
});

const renderLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  positions: { storage: d.arrayOf(PackedVec3), access: 'readonly' },
  normals: { storage: d.arrayOf(PackedVec3), access: 'readonly' },
  meshlets: { storage: d.arrayOf(MeshletDesc), access: 'readonly' },
  meshletVertices: { storage: d.arrayOf(d.u32), access: 'readonly' },
  meshletTriangles: { storage: d.arrayOf(d.u32), access: 'readonly' },
  visibleMeshlets: { storage: d.arrayOf(d.u32), access: 'readonly' },
});

const computeLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
  bounds: { storage: d.arrayOf(d.f32), access: 'readonly' },
  indirectDraw: { storage: IndirectDraw, access: 'mutable' },
  visibleMeshlets: { storage: d.arrayOf(d.u32), access: 'mutable' },
});

const traditionalCamLayout = tgpu.bindGroupLayout({
  camera: { uniform: Camera },
});

const unpackVec3 = tgpu.fn(
  [PackedVec3],
  d.vec3f,
)((p) => {
  'use gpu';
  return d.vec3f(p.x, p.y, p.z);
});

const resolveVertex = tgpu.fn(
  [MeshletDesc, d.u32],
  d.u32,
)((meshlet, vi) => {
  'use gpu';
  const byteOffset = meshlet.triangleOffset + d.u32(vi / 3) * 3 + (vi % 3);
  const word = renderLayout.$.meshletTriangles[d.u32(byteOffset / 4)];
  const localVertIdx = (word >> ((byteOffset % 4) * 8)) & 0xff;
  return renderLayout.$.meshletVertices[meshlet.vertexOffset + localVertIdx];
});

const lambertian = tgpu.fn(
  [d.vec3f],
  d.f32,
)((n) => {
  'use gpu';
  const L = std.normalize(d.vec3f(0.4, 1, 0.6));
  return std.max(std.dot(std.normalize(d.vec3f(n)), L), 0.2);
});

const vertexShader = tgpu.vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    instanceIndex: d.builtin.instanceIndex,
  },
  out: {
    pos: d.builtin.position,
    meshletId: d.interpolate('flat, either', d.u32),
    normal: d.vec3f,
  },
})((input) => {
  'use gpu';

  const meshletId = renderLayout.$.visibleMeshlets[input.instanceIndex];
  const meshlet = renderLayout.$.meshlets[meshletId];
  const localTriangle = d.u32(input.vertexIndex / 3);

  if (localTriangle >= meshlet.triangleCount) {
    return { pos: d.vec4f(0, 0, 0, 1), meshletId, normal: d.vec3f() };
  }

  const globalVertIdx = resolveVertex(meshlet, input.vertexIndex);
  const scaledPos = unpackVec3(renderLayout.$.positions[globalVertIdx]) * MODEL_SCALE;
  const cam = renderLayout.$.camera;

  return {
    pos: cam.projection * cam.view * d.vec4f(scaledPos, 1),
    meshletId,
    normal: unpackVec3(renderLayout.$.normals[globalVertIdx]),
  };
});

const fragmentShader = tgpu.fragmentFn({
  in: {
    meshletId: d.interpolate('flat, either', d.u32),
    normal: d.vec3f,
  },
  out: d.vec4f,
})((input) => {
  'use gpu';

  const h = input.meshletId * 2654435761;
  const r = d.f32(h & 0xff) / 255;
  const g = d.f32((h >> 8) & 0xff) / 255;
  const b = d.f32((h >> 16) & 0xff) / 255;

  return d.vec4f(d.vec3f(r, g, b) * lambertian(d.vec3f(input.normal)), 1);
});

const TraditionalVertex = d.struct({
  position: d.vec4f,
  normal: d.vec4f,
});
const traditionalVertexLayout = tgpu.vertexLayout(d.arrayOf(TraditionalVertex));

const traditionalVertexShader = tgpu.vertexFn({
  in: { position: d.vec4f, normal: d.vec4f },
  out: { pos: d.builtin.position, normal: d.vec3f },
})((input) => {
  'use gpu';
  const cam = traditionalCamLayout.$.camera;
  const scaledPos = d.vec3f(input.position.xyz * MODEL_SCALE);
  return {
    pos: cam.projection * cam.view * d.vec4f(scaledPos, 1),
    normal: input.normal.xyz,
  };
});

const traditionalFragmentShader = tgpu.fragmentFn({
  in: { normal: d.vec3f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  return d.vec4f(d.vec3f(0.72) * lambertian(d.vec3f(input.normal)), 1);
});

const data = await loadMeshlets('/TypeGPU/assets/meshlets/sponza.meshlets');
const objData = await loadObj('/TypeGPU/assets/meshlets/sponza.obj');

const cullShader = tgpu.computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [64],
})((input) => {
  'use gpu';

  const meshletId = input.gid.x;
  if (meshletId >= data.meshletCount) {
    return;
  }

  // Read bounding sphere from the flat bounds array (11 floats per meshlet)
  const base = meshletId * 11;
  const center =
    d.vec3f(
      computeLayout.$.bounds[base],
      computeLayout.$.bounds[base + 1],
      computeLayout.$.bounds[base + 2],
    ) * MODEL_SCALE;
  const r = computeLayout.$.bounds[base + 3] * MODEL_SCALE;

  // Build view-projection matrix
  const cam = computeLayout.$.camera;
  const vp = cam.projection * cam.view;

  // Extract frustum planes using the Gribb/Hartmann method.
  // Row j = (columns[0][j], columns[1][j], columns[2][j], columns[3][j])
  const r0 = d.vec4f(vp.columns[0].x, vp.columns[1].x, vp.columns[2].x, vp.columns[3].x);
  const r1 = d.vec4f(vp.columns[0].y, vp.columns[1].y, vp.columns[2].y, vp.columns[3].y);
  const r2 = d.vec4f(vp.columns[0].z, vp.columns[1].z, vp.columns[2].z, vp.columns[3].z);
  const r3 = d.vec4f(vp.columns[0].w, vp.columns[1].w, vp.columns[2].w, vp.columns[3].w);

  // WebGPU uses [0, 1] NDC depth, so near = r2, far = r3 - r2
  const pLeft = r3 + r0;
  const pRight = r3 - r0;
  const pBottom = r3 + r1;
  const pTop = r3 - r1;
  const pNear = r2;
  const pFar = r3 - r2;

  // Sphere-plane test (unnormalized): sphere outside if
  //   dot(plane.xyz, center) + plane.w < -radius * length(plane.xyz)
  let visible = true;
  const planes = [
    d.vec4f(pLeft),
    d.vec4f(pRight),
    d.vec4f(pBottom),
    d.vec4f(pTop),
    d.vec4f(pNear),
    d.vec4f(pFar),
  ];
  for (const plane of tgpu.unroll(planes)) {
    if (std.dot(plane.xyz, center) + plane.w < -r * std.length(plane.xyz)) {
      visible = false;
    }
  }

  if (visible) {
    // Normal cone culling — cull meshlets that are fully backfacing the camera.
    // bounds[base+4..6]: cone apex (world-space, needs MODEL_SCALE)
    // bounds[base+7..9]: cone axis (unit direction, no scaling)
    // bounds[base+10]:   cone cutoff (dot-product threshold)
    const apex =
      d.vec3f(
        computeLayout.$.bounds[base + 4],
        computeLayout.$.bounds[base + 5],
        computeLayout.$.bounds[base + 6],
      ) * MODEL_SCALE;
    const axis = d.vec3f(
      computeLayout.$.bounds[base + 7],
      computeLayout.$.bounds[base + 8],
      computeLayout.$.bounds[base + 9],
    );
    const cutoff = computeLayout.$.bounds[base + 10];

    // Vector from the camera toward the cone apex (normalized).
    const viewDir = std.normalize(apex - cam.pos.xyz);

    // If dot(viewDir, axis) < cutoff the entire meshlet faces away.
    if (std.dot(viewDir, axis) >= cutoff) {
      visible = false;
    }
  }

  if (visible) {
    const slot = std.atomicAdd(computeLayout.$.indirectDraw.instanceCount, 1);
    computeLayout.$.visibleMeshlets[slot] = meshletId;
  }
});

function upload(buf: GPUBuffer, data: ArrayBufferView) {
  root.device.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
}

const positionsBuffer = root
  .createBuffer(d.arrayOf(PackedVec3, data.vertexCount))
  .$usage('storage');
upload(root.unwrap(positionsBuffer), data.positions);

const normalsBuffer = root.createBuffer(d.arrayOf(PackedVec3, data.vertexCount)).$usage('storage');
upload(root.unwrap(normalsBuffer), data.normals);

const meshletsBuffer = root
  .createBuffer(d.arrayOf(MeshletDesc, data.meshletCount))
  .$usage('storage');
upload(root.unwrap(meshletsBuffer), data.meshlets);

const meshletVerticesBuffer = root
  .createBuffer(d.arrayOf(d.u32, data.meshletVertexCount))
  .$usage('storage');
upload(root.unwrap(meshletVerticesBuffer), data.meshletVertices);

const triangleWords = Math.ceil(data.meshletTriangleBytes / 4);
const meshletTrianglesBuffer = root.createBuffer(d.arrayOf(d.u32, triangleWords)).$usage('storage');
root.device.queue.writeBuffer(
  root.unwrap(meshletTrianglesBuffer),
  0,
  data.meshletTriangles.buffer,
  data.meshletTriangles.byteOffset,
  triangleWords * 4,
);

const boundsBuffer = root.createBuffer(d.arrayOf(d.f32, data.meshletCount * 11)).$usage('storage');
upload(root.unwrap(boundsBuffer), data.bounds);

// Visibility list written by compute, read by vertex shader
const visibleMeshletsBuffer = root
  .createBuffer(d.arrayOf(d.u32, data.meshletCount))
  .$usage('storage');

const MAX_TRIANGLES = 124;
const indirectDrawBuffer = root.createBuffer(IndirectDraw).$usage('storage', 'indirect');
root.device.queue.writeBuffer(
  root.unwrap(indirectDrawBuffer),
  0,
  new Uint32Array([MAX_TRIANGLES * 3, 0, 0, 0]),
);

const cameraBuffer = root.createBuffer(Camera).$usage('uniform');

const cullCameraBuffer = root.createBuffer(Camera).$usage('uniform');
let cullFrozen = false;

const traditionalVertexBuffer = root
  .createBuffer(traditionalVertexLayout.schemaForCount(objData.vertexCount))
  .$usage('vertex');
root.device.queue.writeBuffer(root.unwrap(traditionalVertexBuffer), 0, objData.vertices);

const renderBindGroup = root.createBindGroup(renderLayout, {
  camera: cameraBuffer,
  positions: positionsBuffer,
  normals: normalsBuffer,
  meshlets: meshletsBuffer,
  meshletVertices: meshletVerticesBuffer,
  meshletTriangles: meshletTrianglesBuffer,
  visibleMeshlets: visibleMeshletsBuffer,
});

const computeBindGroup = root.createBindGroup(computeLayout, {
  camera: cullCameraBuffer,
  bounds: boundsBuffer,
  indirectDraw: indirectDrawBuffer,
  visibleMeshlets: visibleMeshletsBuffer,
});

const traditionalCamBindGroup = root.createBindGroup(traditionalCamLayout, {
  camera: cameraBuffer,
});

const depthStencil = {
  format: 'depth24plus' as const,
  depthWriteEnabled: true,
  depthCompare: 'less' as const,
};

let renderPipeline = root.createRenderPipeline({
  vertex: vertexShader,
  fragment: fragmentShader,
  primitive: { cullMode: 'back' },
  depthStencil,
});

let cullPipeline = root.createComputePipeline({ compute: cullShader });
const cullWorkgroups = Math.ceil(data.meshletCount / 64);

let traditionalPipeline = root.createRenderPipeline({
  attribs: traditionalVertexLayout.attrib,
  vertex: traditionalVertexShader,
  fragment: traditionalFragmentShader,
  primitive: { cullMode: 'back' },
  depthStencil,
});

const resetInstanceCount = new Uint32Array([0]);

let cullMs = 0;
let renderMs = 0;
const hasTimestamp = root.device.features.has('timestamp-query');

if (hasTimestamp) {
  cullPipeline = cullPipeline.withPerformanceCallback((s, e) => {
    cullMs = Number(e - s) / 1e6;
  });
  renderPipeline = renderPipeline.withPerformanceCallback((s, e) => {
    renderMs = Number(e - s) / 1e6;
  });
  traditionalPipeline = traditionalPipeline.withPerformanceCallback((s, e) => {
    renderMs = Number(e - s) / 1e6;
  });
}

let useMeshlets = true;

export const controls = {
  'Meshlet Rendering': {
    initial: true,
    onToggleChange: (v: boolean) => {
      useMeshlets = v;
    },
  },
};

let depthTexture: GPUTexture | null = null;

function getDepthView(): GPUTextureView {
  const w = canvas.width;
  const h = canvas.height;
  if (!depthTexture || depthTexture.width !== w || depthTexture.height !== h) {
    depthTexture?.destroy();
    depthTexture = root.device.createTexture({
      size: [w, h],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
  }
  return depthTexture.createView();
}

const { cleanupCamera, updatePosition } = setupFirstPersonCamera(
  canvas,
  {
    initPos: d.vec3f(0, 2, 0),
    speed: d.vec3f(0.005, 0.15, 1.5),
  },
  (props) => {
    cullCameraBuffer.writePartial(props);
    if (!cullFrozen) {
      cameraBuffer.writePartial(props);
    }
  },
);

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key.toLowerCase() === 'f') {
    cullFrozen = !cullFrozen;
  }
};
window.addEventListener('keydown', onKeyDown);

let animFrameId = 0;

function frame() {
  animFrameId = requestAnimationFrame(frame);
  updatePosition();

  const colorAttachment = { view: context, clearValue: [0.05, 0.05, 0.08, 1] };
  const depthAttachment = {
    view: getDepthView(),
    depthClearValue: 1,
    depthLoadOp: 'clear' as const,
    depthStoreOp: 'store' as const,
  };

  if (useMeshlets) {
    // Reset atomic instanceCount to 0 so the compute pass can recount visible meshlets.
    root.device.queue.writeBuffer(root.unwrap(indirectDrawBuffer), 4, resetInstanceCount);

    // Compute pass — frustum + cone cull, build the visibility list.
    cullPipeline.with(computeBindGroup).dispatchWorkgroups(cullWorkgroups);

    // Render pass — draw only the surviving meshlets via indirect draw.
    renderPipeline
      .withColorAttachment(colorAttachment)
      .withDepthStencilAttachment(depthAttachment)
      .with(renderBindGroup)
      .drawIndirect(root.unwrap(indirectDrawBuffer), 0);
  } else {
    // Traditional non-indexed draw — flat vertex list, no GPU culling.
    traditionalPipeline
      .withColorAttachment(colorAttachment)
      .withDepthStencilAttachment(depthAttachment)
      .with(traditionalVertexLayout, traditionalVertexBuffer)
      .with(traditionalCamBindGroup)
      .draw(objData.vertexCount);
  }

  // Timing display (values are from a recent past frame — GPU async)
  if (timingEl && hasTimestamp) {
    if (useMeshlets) {
      timingEl.textContent = `Cull: ${cullMs.toFixed(3)} ms  Render: ${renderMs.toFixed(3)} ms  [total: ${(cullMs + renderMs).toFixed(3)} ms]`;
    } else {
      timingEl.textContent = `Render: ${renderMs.toFixed(3)} ms`;
    }
  }
}

frame();

export function onCleanup() {
  cancelAnimationFrame(animFrameId);
  window.removeEventListener('keydown', onKeyDown);
  cleanupCamera();
  depthTexture?.destroy();
  root.destroy();
}
