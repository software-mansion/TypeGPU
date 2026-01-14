import tgpu, {
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuRoot,
  type TgpuTexture,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const INVALID_COORD = 0xffffffff;

const pingPongLayout = tgpu.bindGroupLayout({
  readView: {
    storageTexture: d.textureStorage2d('rgba32uint', 'read-only'),
  },
  writeView: {
    storageTexture: d.textureStorage2d('rgba32uint', 'write-only'),
  },
});

const initLayout = tgpu.bindGroupLayout({
  writeView: {
    storageTexture: d.textureStorage2d('rgba32uint', 'write-only'),
  },
});

const distWriteLayout = tgpu.bindGroupLayout({
  distTexture: {
    storageTexture: d.textureStorage2d('rgba16float', 'write-only'),
  },
});

/**
 * Slot for the classify function that determines which pixels are "inside" for the SDF.
 * The function receives the pixel coordinate and texture size, and returns whether
 * the pixel is inside (true) or outside (false).
 *
 * Users should provide their own implementation that reads from their textures
 * to determine inside/outside classification.
 */
export const classifySlot = tgpu.slot<(coord: d.v2u, size: d.v2u) => boolean>();

/**
 * Default distance write - writes signed distance to rgba16float texture.
 * Users can provide a custom implementation to write additional data.
 *
 * @param coord - The pixel coordinate being written
 * @param signedDist - Signed distance in pixels (positive = outside, negative = inside)
 * @param insidePx - Pixel coordinates of the nearest inside seed
 * @param outsidePx - Pixel coordinates of the nearest outside seed
 */
export const defaultDistanceWrite = (
  coord: d.v2u,
  signedDist: number,
  _insidePx: d.v2u,
  _outsidePx: d.v2u,
) => {
  'use gpu';
  std.textureStore(
    distWriteLayout.$.distTexture,
    d.vec2i(coord),
    d.vec4f(signedDist, 0, 0, 0),
  );
};

/** Slot for custom distance writing */
export const distanceWriteSlot = tgpu.slot<
  (coord: d.v2u, signedDist: number, insidePx: d.v2u, outsidePx: d.v2u) => void
>(defaultDistanceWrite);

const SampleResult = d.struct({
  inside: d.vec2u,
  outside: d.vec2u,
});

const sampleWithOffset = (
  tex: d.textureStorage2d<'rgba32uint', 'read-only'>,
  pos: d.v2i,
  offset: d.v2i,
) => {
  'use gpu';
  const dims = std.textureDimensions(tex);
  const samplePos = pos.add(offset);

  const outOfBounds = samplePos.x < 0 ||
    samplePos.y < 0 ||
    samplePos.x >= d.i32(dims.x) ||
    samplePos.y >= d.i32(dims.y);

  const safePos = std.clamp(samplePos, d.vec2i(0), d.vec2i(dims.sub(1)));
  const loaded = std.textureLoad(tex, safePos);

  const inside = loaded.xy;
  const outside = loaded.zw;

  const invalid = d.vec2u(INVALID_COORD);
  return SampleResult({
    inside: std.select(inside, invalid, outOfBounds),
    outside: std.select(outside, invalid, outOfBounds),
  });
};

const offsetAccessor = tgpu['~unstable'].accessor(d.i32);

const initFromSeedCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const size = std.textureDimensions(initLayout.$.writeView);
  if (std.any(std.ge(gid.xy, size))) {
    return;
  }

  // Use classify slot to determine if this pixel is inside
  const isInside = classifySlot.$(gid.xy, size);
  const invalid = d.vec2u(INVALID_COORD);

  // Store pixel coords directly (not UVs)
  // If inside: inside coord = this pixel, outside coord = invalid
  // If outside: outside coord = this pixel, inside coord = invalid
  const insideCoord = std.select(invalid, gid.xy, isInside);
  const outsideCoord = std.select(gid.xy, invalid, isInside);

  std.textureStore(
    initLayout.$.writeView,
    d.vec2i(gid.xy),
    d.vec4u(insideCoord, outsideCoord),
  );
});

const jumpFloodCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const size = std.textureDimensions(pingPongLayout.$.readView);
  if (std.any(std.ge(gid.xy, size))) {
    return;
  }

  const offset = offsetAccessor.$;
  const pos = d.vec2f(gid.xy);

  const invalid = d.vec2u(INVALID_COORD);
  let bestInsideCoord = d.vec2u(invalid);
  let bestOutsideCoord = d.vec2u(invalid);
  let bestInsideDist2 = d.f32(1e20); // squared distance
  let bestOutsideDist2 = d.f32(1e20); // squared distance

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const sample = sampleWithOffset(
        pingPongLayout.$.readView,
        d.vec2i(gid.xy),
        d.vec2i(dx * offset, dy * offset),
      );

      // Check inside candidate (valid if not INVALID_COORD)
      if (sample.inside.x !== INVALID_COORD) {
        const deltaIn = pos.sub(d.vec2f(sample.inside));
        const dist2 = std.dot(deltaIn, deltaIn);
        if (dist2 < bestInsideDist2) {
          bestInsideDist2 = dist2;
          bestInsideCoord = d.vec2u(sample.inside);
        }
      }

      // Check outside candidate (valid if not INVALID_COORD)
      if (sample.outside.x !== INVALID_COORD) {
        const deltaOut = pos.sub(d.vec2f(sample.outside));
        const dist2 = std.dot(deltaOut, deltaOut);
        if (dist2 < bestOutsideDist2) {
          bestOutsideDist2 = dist2;
          bestOutsideCoord = d.vec2u(sample.outside);
        }
      }
    }
  }

  std.textureStore(
    pingPongLayout.$.writeView,
    d.vec2i(gid.xy),
    d.vec4u(bestInsideCoord, bestOutsideCoord),
  );
});

const createDistanceFieldCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const size = std.textureDimensions(pingPongLayout.$.readView);
  if (std.any(std.ge(gid.xy, size))) {
    return;
  }

  const pos = d.vec2f(gid.xy);
  const texel = std.textureLoad(pingPongLayout.$.readView, d.vec2i(gid.xy));

  const insideCoord = texel.xy;
  const outsideCoord = texel.zw;

  let insideDist = d.f32(1e20);
  let outsideDist = d.f32(1e20);

  // Compute distances in pixel space
  if (insideCoord.x !== INVALID_COORD) {
    insideDist = std.distance(pos, d.vec2f(insideCoord));
  }

  if (outsideCoord.x !== INVALID_COORD) {
    outsideDist = std.distance(pos, d.vec2f(outsideCoord));
  }

  // Output signed distance in pixels
  // Positive = outside (distance to nearest inside), Negative = inside (distance to nearest outside)
  const signedDist = insideDist - outsideDist;

  // Use distance write slot for customizable output
  distanceWriteSlot.$(gid.xy, signedDist, insideCoord, outsideCoord);
});

type FloodTexture =
  & TgpuTexture<{
    size: [number, number];
    format: 'rgba32uint';
  }>
  & StorageFlag;

export type DistanceTexture =
  & TgpuTexture<{
    size: [number, number];
    format: 'rgba16float';
  }>
  & StorageFlag
  & SampledFlag;

export type JumpFloodExecutor<OwnsOutput extends boolean = boolean> =
  & {
    /**
     * Run the jump flood algorithm.
     * The classify function determines which pixels are inside/outside.
     */
    run(): void;

    /**
     * Returns a new executor with the additional bind group attached.
     * Use this to pass resources needed by custom classify or distance write functions.
     */
    with(bindGroup: TgpuBindGroup): JumpFloodExecutor<OwnsOutput>;

    /**
     * Clean up GPU resources created by this executor.
     */
    destroy(): void;
  }
  & (OwnsOutput extends true ? {
      /**
       * The output distance field texture.
       * Contains signed distance values in pixels after run() completes.
       * Positive = outside (distance to nearest inside), Negative = inside (distance to nearest outside).
       */
      readonly output: DistanceTexture;
    }
    : object);

type JumpFloodOptionsBase = {
  root: TgpuRoot;
  size: { width: number; height: number };
  /**
   * Classify function that determines which pixels are "inside" for the SDF.
   * Returns true if the pixel is inside, false if outside.
   */
  classify: (coord: d.v2u, size: d.v2u) => boolean;
  /** Optional custom distance write function. Defaults to writing signed distance to output texture. */
  distanceWrite?: typeof defaultDistanceWrite;
};

type JumpFloodOptionsWithOutput = JumpFloodOptionsBase & {
  output: DistanceTexture;
};

type JumpFloodOptionsWithoutOutput = JumpFloodOptionsBase & {
  output?: undefined;
};

/**
 * Create a Jump Flood Algorithm executor that creates its own output texture.
 */
export function createJumpFlood(
  options: JumpFloodOptionsWithoutOutput,
): JumpFloodExecutor<true>;

/**
 * Create a Jump Flood Algorithm executor with a provided output texture.
 */
export function createJumpFlood(
  options: JumpFloodOptionsWithOutput,
): JumpFloodExecutor<false>;

export function createJumpFlood(
  options: JumpFloodOptionsWithOutput | JumpFloodOptionsWithoutOutput,
): JumpFloodExecutor<boolean> {
  const {
    root,
    size,
    classify,
    output: providedOutput,
    distanceWrite,
  } = options;
  const { width, height } = size;

  // Create or use provided output texture
  const ownsOutput = !providedOutput;

  const distanceTexture: DistanceTexture = providedOutput ??
    (root['~unstable']
      .createTexture({
        size: [width, height],
        format: 'rgba16float',
      })
      .$usage('storage', 'sampled') as DistanceTexture);

  // Create flood textures (always owned by executor)
  const floodTextureA = root['~unstable']
    .createTexture({
      size: [width, height],
      format: 'rgba32uint',
    })
    .$usage('storage') as FloodTexture;

  const floodTextureB = root['~unstable']
    .createTexture({
      size: [width, height],
      format: 'rgba32uint',
    })
    .$usage('storage') as FloodTexture;

  // Create uniform for offset
  const offsetUniform = root.createUniform(d.i32);

  // Create pipelines with slot bindings
  const initFromSeedPipeline = root['~unstable']
    .with(classifySlot, classify)
    .withCompute(initFromSeedCompute)
    .createPipeline();

  const jumpFloodPipeline = root['~unstable']
    .with(offsetAccessor, offsetUniform)
    .withCompute(jumpFloodCompute)
    .createPipeline();

  const createDistancePipeline = root['~unstable']
    .with(distanceWriteSlot, distanceWrite ?? defaultDistanceWrite)
    .withCompute(createDistanceFieldCompute)
    .createPipeline();

  // Create bind groups
  const initBG = root.createBindGroup(initLayout, {
    writeView: floodTextureA.createView(
      d.textureStorage2d('rgba32uint', 'write-only'),
    ),
  });

  const pingPongBGs = [
    root.createBindGroup(pingPongLayout, {
      readView: floodTextureA.createView(
        d.textureStorage2d('rgba32uint', 'read-only'),
      ),
      writeView: floodTextureB.createView(
        d.textureStorage2d('rgba32uint', 'write-only'),
      ),
    }),
    root.createBindGroup(pingPongLayout, {
      readView: floodTextureB.createView(
        d.textureStorage2d('rgba32uint', 'read-only'),
      ),
      writeView: floodTextureA.createView(
        d.textureStorage2d('rgba32uint', 'write-only'),
      ),
    }),
  ];

  const distWriteBG = root.createBindGroup(distWriteLayout, {
    distTexture: distanceTexture.createView(
      d.textureStorage2d('rgba16float', 'write-only'),
    ),
  });

  // Precompute workgroup counts
  const workgroupsX = Math.ceil(width / 8);
  const workgroupsY = Math.ceil(height / 8);
  // Use power-of-two offset for proper JFA coverage
  const maxDim = Math.max(width, height);
  const maxRange = 1 << Math.floor(Math.log2(maxDim));

  function destroy() {
    floodTextureA.destroy();
    floodTextureB.destroy();
    if (ownsOutput) {
      distanceTexture.destroy();
    }
  }

  // Create executor factory that supports .with(bindGroup) pattern
  function createExecutor(
    additionalBindGroups: TgpuBindGroup[] = [],
  ): JumpFloodExecutor<boolean> {
    function run() {
      // Initialize from seed function
      let initPipeline = initFromSeedPipeline.with(initBG);
      for (const bg of additionalBindGroups) {
        initPipeline = initPipeline.with(bg);
      }
      initPipeline.dispatchWorkgroups(workgroupsX, workgroupsY);

      // Run jump flood iterations
      let sourceIdx = 0;
      let offset = maxRange;

      while (offset >= 1) {
        offsetUniform.write(offset);

        const bg = pingPongBGs[sourceIdx];
        if (bg) {
          let floodPipeline = jumpFloodPipeline.with(bg);
          for (const addBg of additionalBindGroups) {
            floodPipeline = floodPipeline.with(addBg);
          }
          floodPipeline.dispatchWorkgroups(workgroupsX, workgroupsY);
        }

        sourceIdx ^= 1;
        offset = Math.floor(offset / 2);
      }

      // Create final distance field
      const finalBG = pingPongBGs[sourceIdx];
      if (finalBG) {
        let distPipeline = createDistancePipeline.with(finalBG).with(
          distWriteBG,
        );
        for (const bg of additionalBindGroups) {
          distPipeline = distPipeline.with(bg);
        }
        distPipeline.dispatchWorkgroups(workgroupsX, workgroupsY);
      }
    }

    function withBindGroup(bindGroup: TgpuBindGroup) {
      return createExecutor([...additionalBindGroups, bindGroup]);
    }

    if (ownsOutput) {
      return {
        run,
        with: withBindGroup,
        destroy,
        output: distanceTexture,
      };
    }

    return {
      run,
      with: withBindGroup,
      destroy,
    };
  }

  return createExecutor();
}
