import type {
  IndexFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuRoot,
  VertexFlag,
} from 'typegpu';
import { d } from 'typegpu';
import { mat4 } from 'wgpu-matrix';
import {
  bindGroupLayout,
  InstanceInfo,
  type Material,
  VertexInfo,
} from './schema.ts';

function createVertex(
  position: d.v3f,
  normal: d.v3f,
) {
  return VertexInfo({
    position: d.vec4f(position, 1),
    normal: d.vec4f(normal, 0),
  });
}

function createFaceVertices(
  positions: [number, number, number][],
  normal: [number, number, number],
) {
  return positions.map((pos) =>
    createVertex(d.vec3f(...pos), d.vec3f(...normal))
  );
}

function createModelMatrix(position: d.v3f, rotation: d.v3f) {
  const modelMatrix = d.mat4x4f.identity();

  if (rotation[0] !== 0) {
    mat4.rotateX(modelMatrix, rotation[0], modelMatrix);
  }
  if (rotation[1] !== 0) {
    mat4.rotateY(modelMatrix, rotation[1], modelMatrix);
  }
  if (rotation[2] !== 0) {
    mat4.rotateZ(modelMatrix, rotation[2], modelMatrix);
  }

  return mat4.translate(modelMatrix, position, modelMatrix);
}

function createGeometry(
  root: TgpuRoot,
  vertices: ReturnType<typeof createVertex>[],
  indices: number[],
  material: d.Infer<typeof Material>,
  modelMatrix: d.m4x4f,
) {
  const vertexBuffer = root
    .createBuffer(d.arrayOf(VertexInfo, vertices.length), vertices)
    .$usage('vertex');
  const indexBuffer = root
    .createBuffer(d.arrayOf(d.u16, indices.length), indices)
    .$usage('index');

  const bindGroup = root.createBindGroup(bindGroupLayout, {
    instanceInfo: root
      .createBuffer(InstanceInfo, { modelMatrix, material })
      .$usage('uniform'),
  });

  return { vertexBuffer, indexBuffer, instanceInfo: bindGroup };
}

export function createPlane({
  root,
  material,
  size = [1, 1] as [number, number],
  position = d.vec3f(0, 0, 0),
  rotation = d.vec3f(0, 0, 0),
}: {
  root: TgpuRoot;
  material: d.Infer<typeof Material>;
  size?: [number, number];
  position?: d.v3f;
  rotation?: d.v3f;
}): {
  vertexBuffer: TgpuBuffer<d.WgslArray<typeof VertexInfo>> & VertexFlag;
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;
  instanceInfo: TgpuBindGroup<{
    instanceInfo: { uniform: typeof InstanceInfo };
  }>;
  indexCount: 6;
} {
  const w = size[0] / 2;
  const h = size[1] / 2;

  // deno-fmt-ignore
  const vertices = createFaceVertices([
    [-w, h, 0], [-w, -h, 0], [w, -h, 0], [w, h, 0],
  ], [0, 0, 1]);

  // deno-fmt-ignore
  const indices = [
    0, 1, 3,
    1, 2, 3
  ];

  const modelMatrix = createModelMatrix(position, rotation);
  const geometry = createGeometry(
    root,
    vertices,
    indices,
    material,
    modelMatrix,
  );

  return {
    ...geometry,
    indexCount: 6,
  };
}

export function createCuboid({
  root,
  material,
  size = [1, 1, 1] as [number, number, number],
  position = d.vec3f(0, 0, 0),
  rotation = d.vec3f(0, 0, 0),
}: {
  root: TgpuRoot;
  material: d.Infer<typeof Material>;
  size?: [width: number, height: number, depth: number];
  position?: d.v3f;
  rotation?: d.v3f;
}): {
  vertexBuffer: TgpuBuffer<d.WgslArray<typeof VertexInfo>> & VertexFlag;
  indexBuffer: TgpuBuffer<d.WgslArray<d.U16>> & IndexFlag;
  instanceInfo: TgpuBindGroup<{
    instanceInfo: { uniform: typeof InstanceInfo };
  }>;
  indexCount: 36;
} {
  const w = size[0] / 2; // width
  const h = size[1] / 2; // height
  const d = size[2] / 2; // depth

  // deno-fmt-ignore
  const vertices = [
    // Front face
    ...createFaceVertices([[-w, -h, d], [w, -h, d], [w, h, d], [-w, h, d]], [0, 0, 1]),
    // Back face
    ...createFaceVertices([[-w, -h, -d], [-w, h, -d], [w, h, -d], [w, -h, -d]], [0, 0, -1]),
    // Left face
    ...createFaceVertices([[-w, -h, -d], [-w, -h, d], [-w, h, d], [-w, h, -d]], [-1, 0, 0]),
    // Right face
    ...createFaceVertices([[w, -h, -d], [w, h, -d], [w, h, d], [w, -h, d]], [1, 0, 0]),
    // Top face
    ...createFaceVertices([[-w, h, -d], [-w, h, d], [w, h, d], [w, h, -d]], [0, 1, 0]),
    // Bottom face
    ...createFaceVertices([[-w, -h, -d], [w, -h, -d], [w, -h, d], [-w, -h, d]], [0, -1, 0]),
  ];

  // deno-fmt-ignore
  const indices = [
    // Front face
    0, 1, 2,  0, 2, 3,
    // Back face
    4, 5, 6,  4, 6, 7,
    // Left face
    8, 9, 10,  8, 10, 11,
    // Right face
    12, 13, 14,  12, 14, 15,
    // Top face
    16, 17, 18,  16, 18, 19,
    // Bottom face
    20, 21, 22,  20, 22, 23,
  ];

  const modelMatrix = createModelMatrix(position, rotation);
  const geometry = createGeometry(
    root,
    vertices,
    indices,
    material,
    modelMatrix,
  );

  return {
    ...geometry,
    indexCount: 36,
  };
}
