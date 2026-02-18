import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { d, type TgpuRoot } from 'typegpu';
import { modelVertexLayout } from './schemas.ts';

export async function loadModel(
  root: TgpuRoot,
  modelPath: string,
  texturePath: string,
) {
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

  const textureResponse = await fetch(texturePath);
  const imageBitmap = await createImageBitmap(await textureResponse.blob());
  const texture = root['~unstable']
    .createTexture({
      size: [imageBitmap.width, imageBitmap.height],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render')
    .$name(`texture from ${texturePath}`);

  texture.write(imageBitmap);

  return {
    vertexBuffer,
    polygonCount,
    texture,
  };
}
