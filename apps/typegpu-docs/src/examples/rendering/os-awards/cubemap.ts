import { tgpu, d, std, type TgpuRoot } from 'typegpu';

const convertLayout = tgpu.bindGroupLayout({
  equirect: { texture: d.texture2d(d.f32) },
  linearSampler: { sampler: 'filtering' },
  faces: { storageTexture: d.textureStorage2dArray('rgba8unorm', 'write-only') },
});

const faceDirection = (uv: d.v2f, face: number): d.v3f => {
  'use gpu';
  if (face === 0) {
    return std.normalize(d.vec3f(1, -uv.y, -uv.x));
  }
  if (face === 1) {
    return std.normalize(d.vec3f(-1, -uv.y, uv.x));
  }
  if (face === 2) {
    return std.normalize(d.vec3f(uv.x, 1, uv.y));
  }
  if (face === 3) {
    return std.normalize(d.vec3f(uv.x, -1, -uv.y));
  }
  if (face === 4) {
    return std.normalize(d.vec3f(uv.x, -uv.y, 1));
  }
  return std.normalize(d.vec3f(-uv.x, -uv.y, -1));
};

export const directionToEquirectUv = (direction: d.v3f): d.v2f => {
  'use gpu';
  const u = std.atan2(direction.z, direction.x) / (2 * Math.PI) + 0.5;
  const v = std.acos(std.clamp(direction.y, -1, 1)) / Math.PI;
  return d.vec2f(u, v);
};

export async function loadEnvironmentCubemap(root: TgpuRoot, url: string) {
  const response = await fetch(url);
  const bitmap = await createImageBitmap(await response.blob());

  const equirectTexture = root
    .createTexture({
      size: [bitmap.width, bitmap.height],
      format: 'rgba8unorm',
      viewFormats: ['rgba8unorm-srgb'],
    })
    .$usage('sampled', 'render');
  equirectTexture.write(bitmap);

  const faceSize = Math.min(Math.floor(bitmap.width / 4), 1024);
  const mipLevelCount = Math.floor(Math.log2(faceSize)) + 1;
  const cubemapTexture = root
    .createTexture({ size: [faceSize, faceSize, 6], format: 'rgba8unorm', mipLevelCount })
    .$usage('sampled', 'storage', 'render');

  const convertPipeline = root.createGuardedComputePipeline(
    (x: number, y: number, face: number) => {
      'use gpu';
      const faceUv = ((d.vec2f(x, y) + 0.5) / faceSize) * 2 - 1;
      const color = std.textureSampleLevel(
        convertLayout.$.equirect,
        convertLayout.$.linearSampler,
        directionToEquirectUv(faceDirection(faceUv, face)),
        0,
      );
      std.textureStore(convertLayout.$.faces, d.vec2u(x, y), face, color);
    },
  );

  const convertBindGroup = root.createBindGroup(convertLayout, {
    equirect: equirectTexture.createView(d.texture2d(d.f32), {
      format: 'rgba8unorm-srgb',
    }),
    linearSampler: root.createSampler({ magFilter: 'linear', minFilter: 'linear' }),
    faces: cubemapTexture.createView(d.textureStorage2dArray('rgba8unorm', 'write-only'), {
      baseMipLevel: 0,
      mipLevelCount: 1,
    }),
  });

  convertPipeline.with(convertBindGroup).dispatchThreads(faceSize, faceSize, 6);
  cubemapTexture.generateMipmaps();

  return { texture: cubemapTexture, equirectTexture, mipLevelCount };
}
