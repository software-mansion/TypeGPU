import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { d, type TgpuRoot } from 'typegpu';
import { modelVertexLayout } from './schemas.ts';

export async function loadModel(root: TgpuRoot, modelPath: string) {
  const modelMesh = await load(modelPath, OBJLoader);
  const polygonCount = modelMesh.attributes.POSITION.value.length / 3;

  const vertexBuffer = root
    .createBuffer(modelVertexLayout.schemaForCount(polygonCount))
    .$usage('vertex')
    .$name(`model vertices of ${modelPath}`);

  const modelVertices = [];
  for (let i = 0; i < polygonCount; i++) {
    modelVertices.push({
      modelPosition: d.vec3f(
        modelMesh.attributes.POSITION.value[3 * i],
        modelMesh.attributes.POSITION.value[3 * i + 1],
        modelMesh.attributes.POSITION.value[3 * i + 2],
      ),
      modelNormal: d.vec3f(
        modelMesh.attributes.NORMAL.value[3 * i],
        modelMesh.attributes.NORMAL.value[3 * i + 1],
        modelMesh.attributes.NORMAL.value[3 * i + 2],
      ),
    });
  }
  modelVertices.reverse();

  vertexBuffer.write(modelVertices);

  return {
    vertexBuffer,
    polygonCount,
  };
}
