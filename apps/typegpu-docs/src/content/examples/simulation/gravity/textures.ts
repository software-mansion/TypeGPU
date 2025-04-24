import { type TgpuRoot, tgpu } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { type SkyBox, sphereTextureNames } from './enums.ts';
import { CelestialBody, SkyBoxVertex } from './schemas.ts';

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

function getSkyBoxUrls(name: SkyBox) {
  return ['posx', 'negx', 'posy', 'negy', 'posz', 'negz'].map(
    (side) => `/TypeGPU/assets/gravity/skyboxes/${name}/${side}.jpg`,
  );
}

export async function loadSkyBox(root: TgpuRoot, selectedSkyBox: SkyBox) {
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

export const radiusOf = tgpu['~unstable'].fn(
  [CelestialBody],
  d.f32,
)((body) => {
  'kernel & js';
  return std.pow((body.mass * 0.75) / Math.PI, 0.333) * body.radiusMultiplier;
});
