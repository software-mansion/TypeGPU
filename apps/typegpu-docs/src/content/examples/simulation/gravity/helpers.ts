import { load } from '@loaders.gl/core';
import { OBJLoader } from '@loaders.gl/obj';
import { tgpu, type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { sphereTextureNames } from './enums.ts';
import { CelestialBody, renderVertexLayout, SkyBoxVertex } from './schemas.ts';

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

  await Promise.all(
    getSkyBoxUrls().map(async (url, i) => {
      const response = await fetch(url);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      root.device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: root.unwrap(texture), mipLevel: 0, origin: [0, 0, i] },
        [size, size],
      );
    }),
  );

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

  await Promise.all(
    sphereTextureNames.map(async (name, i) => {
      const url = `/TypeGPU/assets/gravity/textures/${name}.jpg`;
      const response = await fetch(url);
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);

      root.device.queue.copyExternalImageToTexture(
        { source: imageBitmap },
        { texture: root.unwrap(texture), mipLevel: 0, origin: [0, 0, i] },
        [2048, 1024],
      );
    }),
  );

  return texture;
}

export const radiusOf = tgpu.fn([CelestialBody], d.f32)((body) =>
  std.pow((body.mass * 0.75) / Math.PI, 0.333) * body.radiusMultiplier
);
