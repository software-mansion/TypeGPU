import { perlin3d, randf } from '@typegpu/noise';
import type { TgpuRoot, TgpuTextureView } from 'typegpu';
import tgpu, { d, std } from 'typegpu';
import { CUBEMAP_SIZE } from './constants.ts';

const spaceNebula = (rd: d.v3f): d.v3f => {
  'use gpu';
  let color = d.vec3f(0.01, 0.01, 0.03);

  const n1 = perlin3d.sample(rd.mul(1.2)) * 0.5 + 0.5;
  const n2 = perlin3d.sample(rd.mul(2.5).add(50)) * 0.5 + 0.5;
  const n3 = perlin3d.sample(rd.mul(5).add(150)) * 0.5 + 0.5;
  const n4 = perlin3d.sample(rd.mul(0.8).add(300)) * 0.5 + 0.5;

  const colorShift = perlin3d.sample(rd.mul(0.5).add(500)) * 0.5 + 0.5;

  const purple = d.vec3f(0.6, 0.1, 0.8).mul(std.pow(n1, 1.8) * 0.5);

  const blue = d.vec3f(0.1, 0.3, 0.7).mul(std.pow(n2, 2) * 0.4);

  const cyan = d.vec3f(0.1, 0.6, 0.6).mul(std.pow(n3 * n4, 1.5) * 0.3);

  const pink = d.vec3f(0.7, 0.2, 0.4).mul(std.pow(1 - n1, 3) * n2 * 0.4);

  const gold = d.vec3f(0.8, 0.5, 0.1).mul(std.pow(n2 * n3, 3) * 0.6);

  const purpleBlue = std.mix(purple, blue, colorShift);
  const warmCool = std.mix(pink, cyan, n4);

  color = color.add(purpleBlue).add(warmCool).add(gold);

  const emission = std.pow(n1 * n2 * n3, 4) * 2;
  const emissionColor = std.mix(
    d.vec3f(0.8, 0.4, 1),
    d.vec3f(0.4, 0.8, 1),
    colorShift,
  );
  color = color.add(emissionColor.mul(emission));

  return color;
};

export const spaceBackground = (rd: d.v3f): d.v3f => {
  'use gpu';
  let color = d.vec3f(spaceNebula(rd));

  const starScale = d.f32(50);
  const starPos = rd.mul(starScale);
  const starCell = std.floor(starPos);
  const starFract = std.fract(starPos);
  randf.seed3(starCell);
  const starCenter = d
    .vec3f(randf.sample(), randf.sample(), randf.sample())
    .mul(0.6)
    .add(0.2);
  const distToStar = std.length(starFract.sub(starCenter));
  const starIntensity = std.pow(std.max(1 - distToStar * 4, 0), 4);
  const starHash = randf.sample();
  const starVisible = std.step(0.85, starHash);
  const starColor = std.mix(
    d.vec3f(1, 0.9, 0.8),
    d.vec3f(0.8, 0.9, 1),
    starHash,
  );
  color = color.add(starColor.mul(starIntensity * starVisible * 3));

  const bigStarScale = d.f32(20);
  const bigStarPos = rd.mul(bigStarScale);
  const bigStarCell = std.floor(bigStarPos);
  const bigStarFract = std.fract(bigStarPos);
  randf.seed3(bigStarCell);
  const bigStarCenter = d
    .vec3f(randf.sample(), randf.sample(), randf.sample())
    .mul(0.5)
    .add(0.25);
  const distToBigStar = std.length(bigStarFract.sub(bigStarCenter));
  const bigStarIntensity = std.pow(std.max(1 - distToBigStar * 3, 0), 3);
  const bigStarHash = randf.sample();
  const bigStarVisible = std.step(0.95, bigStarHash);
  color = color.add(
    d.vec3f(1, 0.95, 0.9).mul(bigStarIntensity * bigStarVisible * 8),
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
    size: d.vec3u(64, 64, 64),
  });

  const faceOutputLayout = tgpu.bindGroupLayout({
    outputTexture: { storageTexture: d.textureStorage2d('rgba16float') },
  });

  const faceForwardUniform = root.createUniform(d.vec3f);
  const faceRightUniform = root.createUniform(d.vec3f);
  const faceUpUniform = root.createUniform(d.vec3f);

  const renderFacePipeline = root['~unstable']
    .pipe(perlinCache.inject())
    .createGuardedComputePipeline((x, y) => {
      'use gpu';
      const u = ((d.f32(x) + 0.5) / CUBEMAP_SIZE) * 2 - 1;
      const v = ((d.f32(y) + 0.5) / CUBEMAP_SIZE) * 2 - 1;

      const direction = std.normalize(
        faceForwardUniform.$.add(faceRightUniform.$.mul(u)).add(
          faceUpUniform.$.mul(v),
        ),
      );

      const color = spaceBackground(direction);

      std.textureStore(
        faceOutputLayout.$.outputTexture,
        d.vec2u(x, y),
        d.vec4f(color, 1),
      );
    });

  for (let face = 0; face < 6; face++) {
    const faceConfig = CUBEMAP_FACES[face];
    faceForwardUniform.write(faceConfig.forward);
    faceRightUniform.write(faceConfig.right);
    faceUpUniform.write(faceConfig.up);

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
