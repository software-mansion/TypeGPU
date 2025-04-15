import type { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import { SkyBoxVertex } from './schemas.ts';

function vert(
  position: [number, number, number, number],
  uv: [number, number],
) {
  return SkyBoxVertex({
    position: d.vec4f(...position),
    uv: d.vec2f(...uv),
  });
}

export const skyBoxVertices: d.Infer<typeof SkyBoxVertex>[] = [
  // Bottom face
  vert([-1, -1, -1, 1], [0, 0]),
  vert([1, -1, -1, 1], [1, 0]),
  vert([1, -1, 1, 1], [1, 1]),
  vert([1, -1, 1, 1], [1, 1]),
  vert([-1, -1, 1, 1], [0, 1]),
  vert([-1, -1, -1, 1], [0, 0]),

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

export type SkyBoxNames = 'campsite' | 'beach';
function getSkyBoxUrls(name: SkyBoxNames) {
  return ['posx', 'negx', 'posy', 'negy', 'posz', 'negz'].map(
    (side) => `/TypeGPU/assets/gravity/skyboxes/${name}/${side}.jpg`,
  );
}

export async function loadSkyBox(root: TgpuRoot, selectedSkyBox: SkyBoxNames) {
  const size = 2048;
  const texture = root['~unstable']
    .createTexture({
      dimension: '2d',
      size: [size, size, 6],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render');

  await Promise.all(
    getSkyBoxUrls(selectedSkyBox).map(async (url, i) => {
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

export type SphereTextureNames = 'earth' | 'moon';
export async function loadSphereTexture(
  root: TgpuRoot,
  sphereTexture: SphereTextureNames,
) {
  const texturePath = `/TypeGPU/assets/gravity/textures/${sphereTexture}.jpg`;
  const textureResponse = await fetch(texturePath);
  const imageBitmap = await createImageBitmap(await textureResponse.blob());
  const texture = root['~unstable']
    .createTexture({
      size: [imageBitmap.width, imageBitmap.height],
      format: 'rgba8unorm',
    })
    .$usage('sampled', 'render')
    .$name(`texture from ${texturePath}`);

  root.device.queue.copyExternalImageToTexture(
    { source: imageBitmap },
    { texture: root.unwrap(texture) },
    [imageBitmap.width, imageBitmap.height],
  );

  return texture;
}
