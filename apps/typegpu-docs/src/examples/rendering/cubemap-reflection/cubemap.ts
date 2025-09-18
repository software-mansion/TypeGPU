import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { CubeVertex } from './dataTypes.ts';

function vert(position: [number, number, number], uv: [number, number]) {
  return CubeVertex({
    position: d.vec3f(...position),
    uv: d.vec2f(...uv),
  });
}

export const cubeVertices: d.Infer<typeof CubeVertex>[] = [
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

export type CubemapNames = 'campsite' | 'beach' | 'chapel' | 'city';
function getCubemapUrls(name: CubemapNames) {
  return ['posx', 'negx', 'posy', 'negy', 'posz', 'negz'].map(
    (side) => `/TypeGPU/assets/cubemap-reflection/${name}/${side}.jpg`,
  );
}

export async function loadCubemap(root: TgpuRoot, chosenCubemap: CubemapNames) {
  const size = 2048;
  const texture = root['~unstable']
    .createTexture({
      dimension: '2d',
      size: [size, size, 6],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render');

  await Promise.all(
    getCubemapUrls(chosenCubemap).map(async (url, i) => {
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
