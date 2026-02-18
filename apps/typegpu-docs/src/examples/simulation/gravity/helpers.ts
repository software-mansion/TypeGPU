import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { d, type TgpuRoot } from 'typegpu';
import { sphereTextureNames } from './enums.ts';
import {
  type CelestialBody,
  renderVertexLayout,
  SkyBoxVertex,
} from './schemas.ts';

function vert(
  position: [number, number, number],
  uv: [number, number],
) {
  return SkyBoxVertex({
    position: d.vec3f(...position),
    uv: d.vec2f(...uv),
  });
}

export const skyBoxVertices: d.Infer<typeof SkyBoxVertex>[] = [
  // Bottom face
  vert([-1, -1, -1], [0, 0]),
  vert([1, -1, -1], [1, 0]),
  vert([1, -1, 1], [1, 1]),
  vert([1, -1, 1], [1, 1]),
  vert([-1, -1, 1], [0, 1]),
  vert([-1, -1, -1], [0, 0]),

  // Right face
  vert([1, 1, 1], [0, 1]),
  vert([1, -1, 1], [1, 1]),
  vert([1, -1, -1], [1, 0]),
  vert([1, 1, -1], [0, 0]),
  vert([1, 1, 1], [0, 1]),
  vert([1, -1, -1], [1, 0]),

  // Top face
  vert([-1, 1, 1], [0, 1]),
  vert([1, 1, 1], [1, 1]),
  vert([1, 1, -1], [1, 0]),
  vert([-1, 1, -1], [0, 0]),
  vert([-1, 1, 1], [0, 1]),
  vert([1, 1, -1], [1, 0]),

  // Left face
  vert([-1, -1, 1], [0, 1]),
  vert([-1, 1, 1], [1, 1]),
  vert([-1, 1, -1], [1, 0]),
  vert([-1, -1, -1], [0, 0]),
  vert([-1, -1, 1], [0, 1]),
  vert([-1, 1, -1], [1, 0]),

  // Front face
  vert([1, 1, 1], [0, 1]),
  vert([-1, 1, 1], [1, 1]),
  vert([-1, -1, 1], [1, 0]),
  vert([-1, -1, 1], [1, 0]),
  vert([1, -1, 1], [0, 0]),
  vert([1, 1, 1], [0, 1]),

  // Back face
  vert([1, -1, -1], [0, 1]),
  vert([-1, -1, -1], [1, 1]),
  vert([-1, 1, -1], [1, 0]),
  vert([1, 1, -1], [0, 0]),
  vert([1, -1, -1], [0, 1]),
  vert([-1, 1, -1], [1, 0]),
];

function getSkyBoxUrls() {
  return ['posx', 'negx', 'posy', 'negy', 'posz', 'negz'].map(
    (side) => `/TypeGPU/assets/gravity/skyboxes/milky-way/${side}.jpg`,
  );
}

export async function loadSkyBox(root: TgpuRoot) {
  const size = 2048;
  const texture = root['~unstable']
    .createTexture({
      dimension: '2d',
      size: [size, size, 6],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render');

  const bitmaps = await Promise.all(
    getSkyBoxUrls().map(async (url) => {
      const response = await fetch(url);
      const blob = await response.blob();
      return await createImageBitmap(blob);
    }),
  );

  texture.write(bitmaps);

  return texture;
}

export async function loadModel(root: TgpuRoot, modelPath: string) {
  const modelMesh = await load(modelPath, OBJLoader);
  const vertexCount = modelMesh.attributes.POSITION.value.length / 3;

  const vertexBuffer = root
    .createBuffer(renderVertexLayout.schemaForCount(vertexCount))
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

  vertexBuffer.write(modelVertices);

  return {
    vertexBuffer,
    vertexCount,
  };
}

export async function loadSphereTextures(root: TgpuRoot) {
  const texture = root['~unstable']
    .createTexture({
      dimension: '2d',
      size: [2048, 1024, sphereTextureNames.length],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render');

  const planets = await Promise.all(
    sphereTextureNames.map(async (name) => {
      const url = `/TypeGPU/assets/gravity/textures/${name}.jpg`;
      const response = await fetch(url);
      const blob = await response.blob();
      return await createImageBitmap(blob);
    }),
  );
  texture.write(planets);

  return texture;
}

export const radiusOf = (body: CelestialBody): number => {
  'use gpu';
  return (((body.mass * 0.75) / Math.PI) ** 0.333) * body.radiusMultiplier;
};
