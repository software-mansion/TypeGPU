import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { renderInstanceLayout } from './schemas.ts';

export async function loadModel(root: TgpuRoot, modelPath: string) {
  const modelMesh = await load(modelPath, OBJLoader);
  const vertexCount = modelMesh.attributes.POSITION.value.length / 3;

  const vertexBuffer = root
    .createBuffer(renderInstanceLayout.schemaForCount(vertexCount))
    .$usage('vertex')
    .$name(`model vertices of ${modelPath}`);

  const modelVertices = [];
  for (let i = 0; i < vertexCount; i++) {
    modelVertices.push({
      position: d.vec3f(
        modelMesh.attributes.POSITION.value[3 * i],
        modelMesh.attributes.POSITION.value[3 * i + 1],
        modelMesh.attributes.POSITION.value[3 * i + 2],
      ),
      normal: d.vec3f(
        modelMesh.attributes.NORMAL.value[3 * i],
        modelMesh.attributes.NORMAL.value[3 * i + 1],
        modelMesh.attributes.NORMAL.value[3 * i + 2],
      ),
      uv: d.vec2f(
        modelMesh.attributes.TEXCOORD_0.value[2 * i],
        1 - modelMesh.attributes.TEXCOORD_0.value[2 * i + 1],
      ),
    });
  }
  modelVertices.reverse();

  vertexBuffer.write(modelVertices);

  return {
    vertexBuffer,
    vertexCount,
  };
}
