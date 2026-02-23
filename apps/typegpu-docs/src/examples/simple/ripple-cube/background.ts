import { perlin3d, randf } from '@typegpu/noise';
import type { TgpuRoot, TgpuTextureView } from 'typegpu';
import tgpu, { d, std } from 'typegpu';
import { CUBEMAP_SIZE } from './constants.ts';

const spaceNebula = (rd: d.v3f): d.v3f => {
  'use gpu';
  const n1 = perlin3d.sample(rd.mul(1.2)) * 0.5 + 0.5;
  const n2 = perlin3d.sample(rd.mul(2.5).add(50)) * 0.5 + 0.5;
  const n3 = perlin3d.sample(rd.mul(5).add(150)) * 0.5 + 0.5;
  const n4 = perlin3d.sample(rd.mul(0.8).add(300)) * 0.5 + 0.5;
  const colorShift = perlin3d.sample(rd.mul(0.5).add(500)) * 0.5 + 0.5;

  const purple = d.vec3f(0.6, 0.1, 0.8).mul(n1 ** 1.8 * 0.5);
  const blue = d.vec3f(0.1, 0.3, 0.7).mul(n2 ** 2 * 0.4);
  const cyan = d.vec3f(0.1, 0.6, 0.6).mul((n3 * n4) ** 1.5 * 0.3);
  const pink = d.vec3f(0.7, 0.2, 0.4).mul((1 - n1) ** 3 * n2 * 0.4);
  const gold = d.vec3f(0.8, 0.5, 0.1).mul((n2 * n3) ** 3 * 0.6);

  let color = d
    .vec3f(0.01, 0.01, 0.03)
    .add(std.mix(purple, blue, colorShift))
    .add(std.mix(pink, cyan, n4))
    .add(gold);

  color = color.add(
    std
      .mix(d.vec3f(0.8, 0.4, 1), d.vec3f(0.4, 0.8, 1), colorShift)
      .mul((n1 * n2 * n3) ** 4 * 2),
  );

  return color;
};

export const spaceBackground = (rd: d.v3f): d.v3f => {
  'use gpu';
  let color = spaceNebula(rd);

  // Small stars
  const starPos = rd.mul(50);
  randf.seed3(std.floor(starPos));
  const starCenter = d
    .vec3f(randf.sample(), randf.sample(), randf.sample())
    .mul(0.6)
    .add(0.2);
  const starDist = std.length(std.fract(starPos).sub(starCenter));
  const starHash = randf.sample();
  color = color.add(
    std
      .mix(d.vec3f(1, 0.9, 0.8), d.vec3f(0.8, 0.9, 1), starHash)
      .mul(std.max(1 - starDist * 4, 0) ** 4 * std.step(0.85, starHash) * 3),
  );

  // Big stars
  const bigStarPos = rd.mul(20);
  randf.seed3(std.floor(bigStarPos));
  const bigStarCenter = d
    .vec3f(randf.sample(), randf.sample(), randf.sample())
    .mul(0.5)
    .add(0.25);
  const bigStarDist = std.length(std.fract(bigStarPos).sub(bigStarCenter));
  color = color.add(
    d
      .vec3f(1, 0.95, 0.9)
      .mul(
        std.max(1 - bigStarDist * 3, 0) ** 3 * std.step(0.95, randf.sample()) *
          8,
      ),
  );

  return color;
};

const CUBEMAP_FACES = [
  {
    forward: d.vec3f(1, 0, 0),
    right: d.vec3f(0, 0, -1),
    up: d.vec3f(0, -1, 0),
  },
  {
    forward: d.vec3f(-1, 0, 0),
    right: d.vec3f(0, 0, 1),
    up: d.vec3f(0, -1, 0),
  },
  {
    forward: d.vec3f(0, 1, 0),
    right: d.vec3f(1, 0, 0),
    up: d.vec3f(0, 0, 1),
  },
  {
    forward: d.vec3f(0, -1, 0),
    right: d.vec3f(1, 0, 0),
    up: d.vec3f(0, 0, -1),
  },
  {
    forward: d.vec3f(0, 0, 1),
    right: d.vec3f(1, 0, 0),
    up: d.vec3f(0, -1, 0),
  },
  {
    forward: d.vec3f(0, 0, -1),
    right: d.vec3f(-1, 0, 0),
    up: d.vec3f(0, -1, 0),
  },
] as const;

export interface BackgroundCubemap {
  view: TgpuTextureView<d.WgslTextureCube<d.F32>>;
}

export function createBackgroundCubemap(root: TgpuRoot): BackgroundCubemap {
  const texture = root['~unstable']
    .createTexture({
      size: [CUBEMAP_SIZE, CUBEMAP_SIZE, 6],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');

  const perlinCache = perlin3d.staticCache({
    root,
    size: d.vec3u(128, 128, 128),
  });

  const faceOutputLayout = tgpu.bindGroupLayout({
    outputTexture: { storageTexture: d.textureStorage2d('rgba16float') },
  });

  const FaceBasis = d.struct({ forward: d.vec3f, right: d.vec3f, up: d.vec3f });
  const faceBasisUniform = root.createUniform(FaceBasis);

  const renderFacePipeline = root
    .pipe(perlinCache.inject())
    .createGuardedComputePipeline((x, y) => {
      'use gpu';
      const u = ((d.f32(x) + 0.5) / CUBEMAP_SIZE) * 2 - 1;
      const v = ((d.f32(y) + 0.5) / CUBEMAP_SIZE) * 2 - 1;
      const basis = faceBasisUniform.$;

      const direction = std.normalize(
        basis.forward.add(basis.right.mul(u)).add(basis.up.mul(v)),
      );

      const color = spaceBackground(direction);

      std.textureStore(
        faceOutputLayout.$.outputTexture,
        d.vec2u(x, y),
        d.vec4f(color, 1),
      );
    });

  for (let face = 0; face < 6; face++) {
    faceBasisUniform.write(CUBEMAP_FACES[face]);

    const faceView = texture.createView(d.textureStorage2d('rgba16float'), {
      baseArrayLayer: face,
      arrayLayerCount: 1,
      baseMipLevel: 0,
      mipLevelCount: 1,
    });

    const faceBindGroup = root.createBindGroup(faceOutputLayout, {
      outputTexture: faceView,
    });

    renderFacePipeline
      .with(faceBindGroup)
      .dispatchThreads(CUBEMAP_SIZE, CUBEMAP_SIZE);
  }

  perlinCache.destroy();

  const view = texture.createView(d.textureCube(d.f32));

  return { view };
}
