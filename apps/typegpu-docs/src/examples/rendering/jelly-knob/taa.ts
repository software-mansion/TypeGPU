import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { TgpuComputePipeline, TgpuRoot, TgpuTextureView } from 'typegpu';
import { taaResolveLayout } from './dataTypes.ts';

export const taaResolveFn = tgpu['~unstable'].computeFn({
  workgroupSize: [16, 16],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})(({ gid }) => {
  const currentColor = std.textureLoad(
    taaResolveLayout.$.currentTexture,
    d.vec2u(gid.xy),
    0,
  );

  const historyColor = std.textureLoad(
    taaResolveLayout.$.historyTexture,
    d.vec2u(gid.xy),
    0,
  );

  let minColor = d.vec3f(9999.0);
  let maxColor = d.vec3f(-9999.0);

  const dimensions = std.textureDimensions(taaResolveLayout.$.currentTexture);

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      const sampleCoord = d.vec2i(gid.xy).add(d.vec2i(x, y));
      const clampedCoord = std.clamp(
        sampleCoord,
        d.vec2i(0, 0),
        d.vec2i(dimensions.xy).sub(d.vec2i(1)),
      );

      const neighborColor = std.textureLoad(
        taaResolveLayout.$.currentTexture,
        clampedCoord,
        0,
      );

      minColor = std.min(minColor, neighborColor.xyz);
      maxColor = std.max(maxColor, neighborColor.xyz);
    }
  }

  const historyColorClamped = std.clamp(historyColor.xyz, minColor, maxColor);

  const blendFactor = d.f32(0.9);

  const resolvedColor = d.vec4f(
    std.mix(currentColor.xyz, historyColorClamped, blendFactor),
    1.0,
  );

  std.textureStore(
    taaResolveLayout.$.outputTexture,
    d.vec2u(gid.x, gid.y),
    resolvedColor,
  );
});

export function createTaaTextures(
  root: TgpuRoot,
  width: number,
  height: number,
) {
  return [0, 1].map(() => {
    const texture = root['~unstable'].createTexture({
      size: [width, height],
      format: 'rgba8unorm',
    }).$usage('storage', 'sampled');

    return {
      write: texture.createView(d.textureStorage2d('rgba8unorm')),
      sampled: texture.createView(),
    };
  });
}

export class TAAResolver {
  #pipeline: TgpuComputePipeline;
  #textures: ReturnType<typeof createTaaTextures>;
  #root: TgpuRoot;
  #width: number;
  #height: number;

  constructor(root: TgpuRoot, width: number, height: number) {
    this.#root = root;
    this.#width = width;
    this.#height = height;

    this.#pipeline = root['~unstable']
      .withCompute(taaResolveFn)
      .createPipeline();

    this.#textures = createTaaTextures(root, width, height);
  }

  resolve(
    currentTexture: TgpuTextureView<d.WgslTexture2d<d.F32>>,
    frameCount: number,
    currentFrame: number,
  ) {
    const previousFrame = 1 - currentFrame;

    this.#pipeline.with(
      this.#root.createBindGroup(taaResolveLayout, {
        currentTexture,
        historyTexture: frameCount === 1
          ? currentTexture
          : this.#textures[previousFrame].sampled,
        outputTexture: this.#textures[currentFrame].write,
      }),
    ).dispatchWorkgroups(
      Math.ceil(this.#width / 16),
      Math.ceil(this.#height / 16),
    );

    return this.#textures[currentFrame].sampled;
  }

  resize(width: number, height: number) {
    this.#width = width;
    this.#height = height;
    this.#textures = createTaaTextures(this.#root, width, height);
  }

  getResolvedTexture(frame: number) {
    return this.#textures[frame].sampled;
  }
}
