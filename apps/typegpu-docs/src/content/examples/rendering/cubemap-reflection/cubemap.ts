import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import type { CubeVertex } from './dataTypes';

export const cubeVertices: d.Infer<typeof CubeVertex>[] = [
  // Bottom face
  {
    position: d.vec4f(1, -1, 1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(-1, -1, 1, 1),
    uv: d.vec2f(1, 1),
  },
  {
    position: d.vec4f(-1, -1, -1, 1),
    uv: d.vec2f(1, 0),
  },
  {
    position: d.vec4f(1, -1, -1, 1),
    uv: d.vec2f(0, 0),
  },
  {
    position: d.vec4f(1, -1, 1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(-1, -1, -1, 1),
    uv: d.vec2f(1, 0),
  },

  // Right face
  {
    position: d.vec4f(1, 1, 1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(1, -1, 1, 1),
    uv: d.vec2f(1, 1),
  },
  {
    position: d.vec4f(1, -1, -1, 1),
    uv: d.vec2f(1, 0),
  },
  {
    position: d.vec4f(1, 1, -1, 1),
    uv: d.vec2f(0, 0),
  },
  {
    position: d.vec4f(1, 1, 1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(1, -1, -1, 1),
    uv: d.vec2f(1, 0),
  },

  // Top face
  {
    position: d.vec4f(-1, 1, 1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(1, 1, 1, 1),
    uv: d.vec2f(1, 1),
  },
  {
    position: d.vec4f(1, 1, -1, 1),
    uv: d.vec2f(1, 0),
  },
  {
    position: d.vec4f(-1, 1, -1, 1),
    uv: d.vec2f(0, 0),
  },
  {
    position: d.vec4f(-1, 1, 1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(1, 1, -1, 1),
    uv: d.vec2f(1, 0),
  },

  // Left face
  {
    position: d.vec4f(-1, -1, 1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(-1, 1, 1, 1),
    uv: d.vec2f(1, 1),
  },
  {
    position: d.vec4f(-1, 1, -1, 1),
    uv: d.vec2f(1, 0),
  },
  {
    position: d.vec4f(-1, -1, -1, 1),
    uv: d.vec2f(0, 0),
  },
  {
    position: d.vec4f(-1, -1, 1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(-1, 1, -1, 1),
    uv: d.vec2f(1, 0),
  },

  // Front face
  {
    position: d.vec4f(1, 1, 1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(-1, 1, 1, 1),
    uv: d.vec2f(1, 1),
  },
  {
    position: d.vec4f(-1, -1, 1, 1),
    uv: d.vec2f(1, 0),
  },
  {
    position: d.vec4f(-1, -1, 1, 1),
    uv: d.vec2f(1, 0),
  },
  {
    position: d.vec4f(1, -1, 1, 1),
    uv: d.vec2f(0, 0),
  },
  {
    position: d.vec4f(1, 1, 1, 1),
    uv: d.vec2f(0, 1),
  },

  // Back face
  {
    position: d.vec4f(1, -1, -1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(-1, -1, -1, 1),
    uv: d.vec2f(1, 1),
  },
  {
    position: d.vec4f(-1, 1, -1, 1),
    uv: d.vec2f(1, 0),
  },
  {
    position: d.vec4f(1, 1, -1, 1),
    uv: d.vec2f(0, 0),
  },
  {
    position: d.vec4f(1, -1, -1, 1),
    uv: d.vec2f(0, 1),
  },
  {
    position: d.vec4f(-1, 1, -1, 1),
    uv: d.vec2f(1, 0),
  },
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
    .$usage('sampled', 'render', 'storage');

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
