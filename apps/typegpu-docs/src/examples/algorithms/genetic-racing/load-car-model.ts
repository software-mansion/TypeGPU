import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import tgpu, { d, type TgpuRoot } from 'typegpu';

export const carModelVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(d.struct({ modelPosition: d.vec3f, modelNormal: d.vec3f }), n),
);

// Pre-computed from OBJ bounds
export const MODEL_Z_CENTER = (-0.8078 + 0.9979) / 2;
export const MODEL_HALF_LENGTH = (0.9979 - -0.8078) / 2;

export async function loadCarModel(root: TgpuRoot) {
  const mesh = await load('/TypeGPU/assets/genetic-car/car-hatchback-blue.obj', OBJLoader);
  const positions = mesh.attributes.POSITION.value as Float32Array;
  const vertexCount = positions.length / 3;

  const normals = new Float32Array(positions.length);
  for (let i = 0; i < vertexCount; i += 3) {
    const i0 = i * 3,
      i1 = (i + 1) * 3,
      i2 = (i + 2) * 3;
    const e1x = positions[i1] - positions[i0];
    const e1y = positions[i1 + 1] - positions[i0 + 1];
    const e1z = positions[i1 + 2] - positions[i0 + 2];
    const e2x = positions[i2] - positions[i0];
    const e2y = positions[i2 + 1] - positions[i0 + 1];
    const e2z = positions[i2 + 2] - positions[i0 + 2];
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz) || 1;
    for (let j = 0; j < 3; j++) {
      normals[(i + j) * 3] = nx / len;
      normals[(i + j) * 3 + 1] = ny / len;
      normals[(i + j) * 3 + 2] = nz / len;
    }
  }

  const vertices = [];
  for (let i = 0; i < vertexCount; i++) {
    vertices.push({
      modelPosition: d.vec3f(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]),
      modelNormal: d.vec3f(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]),
    });
  }

  const vertexBuffer = root
    .createBuffer(carModelVertexLayout.schemaForCount(vertexCount))
    .$usage('vertex');
  vertexBuffer.write(vertices);

  return { vertexBuffer, vertexCount };
}
