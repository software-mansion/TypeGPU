import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { common, type TgpuRoot } from 'typegpu';
import { modelVertexLayout } from './schemas.ts';

export async function loadModel(root: TgpuRoot, modelPath: string) {
  const mesh = await load(modelPath, OBJLoader);
  const { POSITION, NORMAL, TEXCOORD_0 } = mesh.attributes as Record<
    string,
    { value: Float32Array }
  >;
  const vertexCount = POSITION.value.length / 3;

  const vertexBuffer = root
    .createBuffer(modelVertexLayout.schemaForCount(vertexCount))
    .$usage('vertex');

  common.writeSoA(vertexBuffer, {
    position: POSITION.value,
    normal: NORMAL.value,
    uv: TEXCOORD_0.value,
  });

  return { vertexBuffer, vertexCount };
}
