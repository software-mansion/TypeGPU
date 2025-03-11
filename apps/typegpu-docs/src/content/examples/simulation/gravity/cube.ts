import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import * as d from 'typegpu/data';

export const cubeModel = await load('assets/gravity/cube_blend.obj', OBJLoader);
const textureResponse = await fetch('assets/gravity/cube_texture.png');
const imageBitmap = await createImageBitmap(await textureResponse.blob());

const positions = cubeModel.attributes.POSITION.value;
const normals = cubeModel.attributes.NORMAL
  ? cubeModel.attributes.NORMAL.value
  : new Float32Array(positions.length);
const uvs = cubeModel.attributes.TEXCOORD_0
  ? cubeModel.attributes.TEXCOORD_0.value
  : new Float32Array((positions.length / 3) * 2);

const cubeVertices = [];
for (let i = 0; i < positions.length / 3; i++) {
  cubeVertices.push({
    position: d.vec3f(
      positions[3 * i],
      positions[3 * i + 1],
      positions[3 * i + 2],
    ),
    normal: d.vec3f(normals[3 * i], normals[3 * i + 1], normals[3 * i + 2]),
    uv: d.vec2f(uvs[2 * i], 1 - uvs[2 * i + 1]),
  });
}
export const vertices = cubeVertices;
