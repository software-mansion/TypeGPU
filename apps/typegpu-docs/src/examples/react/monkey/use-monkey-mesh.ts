import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import * as d from 'typegpu/data';
import tgpu from 'typegpu';
import { useRoot, type VertexBufferProps } from '@typegpu/react';

const MONKEY_MODEL_PATH = '/TypeGPU/assets/3d-monkey/monkey.obj';

const MeshVertexInput = {
  modelPosition: d.vec3f,
  modelNormal: d.vec3f,
  textureUV: d.vec2f,
} as const;

const meshVertexLayout = tgpu.vertexLayout((n: number) =>
  d.arrayOf(d.struct(MeshVertexInput), n)
);

export type MeshVertex = d.WgslArray<
  d.WgslStruct<{
    readonly modelPosition: d.Vec3f;
    readonly modelNormal: d.Vec3f;
    readonly textureUV: d.Vec2f;
  }>
>;

export async function useMonkeyMesh(): Promise<VertexBufferProps<MeshVertex>> {
  const root = useRoot();
  
  const modelMesh = await load(MONKEY_MODEL_PATH, OBJLoader);
  const polygonCount = modelMesh.attributes.POSITION.value.length / 3;

  const vertexBuffer = root
    .createBuffer(meshVertexLayout.schemaForCount(polygonCount))
    .$usage('vertex')
    .$name(`model vertices of ${MONKEY_MODEL_PATH}`);

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
    layout: meshVertexLayout,
    buffer: vertexBuffer,
  };
}