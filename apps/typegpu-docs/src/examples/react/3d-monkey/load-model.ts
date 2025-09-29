import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import type { TgpuBuffer, VertexFlag } from 'typegpu';
import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { modelVertexLayout } from './schemas.ts';

export type ModelVertex = d.WgslArray<
  d.WgslStruct<{
    readonly modelPosition: d.Vec3f;
    readonly modelNormal: d.Vec3f;
    readonly textureUV: d.Vec2f;
  }>
>;

export type VertexBuffer = TgpuBuffer<ModelVertex> & VertexFlag;

export type Model = {
  vertexBuffer: VertexBuffer;
  polygonCount: number;
};

export async function loadModel(
  root: TgpuRoot,
  modelPath: string,
): Promise<Model> {
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
      textureUV: d.vec2f(
        modelMesh.attributes.TEXCOORD_0.value[2 * i],
        1 - modelMesh.attributes.TEXCOORD_0.value[2 * i + 1],
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
