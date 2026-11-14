import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { tgpu, d, common, type TgpuRoot } from 'typegpu';
import { modelRadius } from './impostor.ts';

const ModelVertex = d.struct({
  position: d.vec3f,
  normal: d.vec3f,
});

export const modelVertexLayout = tgpu.vertexLayout(d.arrayOf(ModelVertex));

export async function loadModel(root: TgpuRoot, modelPath: string) {
  const mesh = await load(modelPath, OBJLoader);
  const { POSITION, NORMAL } = mesh.attributes as Record<string, { value: Float32Array }>;
  const vertexCount = POSITION.value.length / 3;
  const positions = POSITION.value.slice();
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    minimum[axis] = Math.min(minimum[axis], positions[i]);
    maximum[axis] = Math.max(maximum[axis], positions[i]);
  }
  const center = minimum.map((value, axis) => (value + maximum[axis]) / 2);
  let radius = 0;
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) {
      positions[i + axis] -= center[axis];
    }
    radius = Math.max(radius, Math.hypot(positions[i], positions[i + 1], positions[i + 2]));
  }
  for (let i = 0; i < positions.length; i++) {
    positions[i] *= modelRadius / radius;
  }

  const vertexBuffer = root
    .createBuffer(modelVertexLayout.schemaForCount(vertexCount))
    .$usage('vertex');

  common.writeSoA(vertexBuffer, {
    position: positions,
    normal: NORMAL.value,
  });

  return { vertexBuffer, vertexCount };
}

export type Model = Awaited<ReturnType<typeof loadModel>>;
