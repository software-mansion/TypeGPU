import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { CubeVertex } from './dataTypes';

function vert(
  position: [number, number, number, number],
  uv: [number, number],
) {
  return CubeVertex({
    position: d.vec4f(...position),
    uv: d.vec2f(...uv),
  });
}

export const cubeVertices: d.Infer<typeof CubeVertex>[] = [
  // Bottom face
  vert([-1, -1, -1, 1], [0, 0]),
  vert([-1, -1, 1, 1], [1, 1]),
  vert([-1, -1, -1, 1], [1, 0]),
  vert([1, -1, -1, 1], [0, 0]),
  vert([1, -1, 1, 1], [0, 1]),
  vert([-1, -1, -1, 1], [1, 0]),

  // Right face
  vert([1, 1, 1, 1], [0, 1]),
  vert([1, -1, 1, 1], [1, 1]),
  vert([1, -1, -1, 1], [1, 0]),
  vert([1, 1, -1, 1], [0, 0]),
  vert([1, 1, 1, 1], [0, 1]),
  vert([1, -1, -1, 1], [1, 0]),

  // Top face
  vert([-1, 1, 1, 1], [0, 1]),
  vert([1, 1, 1, 1], [1, 1]),
  vert([1, 1, -1, 1], [1, 0]),
  vert([-1, 1, -1, 1], [0, 0]),
  vert([-1, 1, 1, 1], [0, 1]),
  vert([1, 1, -1, 1], [1, 0]),

  // Left face
  vert([-1, -1, 1, 1], [0, 1]),
  vert([-1, 1, 1, 1], [1, 1]),
  vert([-1, 1, -1, 1], [1, 0]),
  vert([-1, -1, -1, 1], [0, 0]),
  vert([-1, -1, 1, 1], [0, 1]),
  vert([-1, 1, -1, 1], [1, 0]),

  // Front face
  vert([1, 1, 1, 1], [0, 1]),
  vert([-1, 1, 1, 1], [1, 1]),
  vert([-1, -1, 1, 1], [1, 0]),
  vert([-1, -1, 1, 1], [1, 0]),
  vert([1, -1, 1, 1], [0, 0]),
  vert([1, 1, 1, 1], [0, 1]),

  // Back face
  vert([1, -1, -1, 1], [0, 1]),
  vert([-1, -1, -1, 1], [1, 1]),
  vert([-1, 1, -1, 1], [1, 0]),
  vert([1, 1, -1, 1], [0, 0]),
  vert([1, -1, -1, 1], [0, 1]),
  vert([-1, 1, -1, 1], [1, 0]),
];

const cubemapUrls = [
  'cubemapTest/posx.jpg', // right
  'cubemapTest/negx.jpg', // left
  'cubemapTest/posy.jpg', // top
  'cubemapTest/negy.jpg', // bottom
  'cubemapTest/posz.jpg', // front
  'cubemapTest/negz.jpg', // back
];

export async function loadCubemap(
  root: TgpuRoot,
  urls: string[] = cubemapUrls,
) {
  const size = 2048;
  const texture = root['~unstable']
    .createTexture({
      dimension: '2d',
      size: [size, size, 6],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render');

  await Promise.all(
    urls.map(async (url, i) => {
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
