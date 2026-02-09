import tgpu, {
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuRoot,
  type TgpuTexture,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const INVALID_COORD = 0xffff;

const pingPongLayout = tgpu.bindGroupLayout({
  readView: {
    storageTexture: d.textureStorage2d('rgba16uint', 'read-only'),
  },
  writeView: {
    storageTexture: d.textureStorage2d('rgba16uint', 'write-only'),
  },
});

const initLayout = tgpu.bindGroupLayout({
  writeView: {
    storageTexture: d.textureStorage2d('rgba16uint', 'write-only'),
  },
});

const distWriteLayout = tgpu.bindGroupLayout({
  sdfTexture: {
    storageTexture: d.textureStorage2d('rgba16float', 'write-only'),
  },
  colorTexture: {
    storageTexture: d.textureStorage2d('rgba8unorm', 'write-only'),
  },
});

/**
 * Slot for the classify function that determines which pixels are "inside" for the SDF.
 * The function receives the pixel coordinate and texture size, and returns whether
 * the pixel is inside (true) or outside (false).
 */
export const classifySlot = tgpu.slot<(coord: d.v2u, size: d.v2u) => boolean>();

/** Slot for SDF getter - returns the signed distance value to store. */
const sdfSlot = tgpu.slot<
  (
    coord: d.v2u,
    size: d.v2u,
    signedDist: number,
    insidePx: d.v2u,
    outsidePx: d.v2u,
  ) => number
>();

/** Slot for color getter - returns the color value to store. */
const colorSlot = tgpu.slot<
  (
    coord: d.v2u,
    size: d.v2u,
    signedDist: number,
    insidePx: d.v2u,
    outsidePx: d.v2u,
  ) => d.v4f
>();

const sampleWithOffset = (
  tex: d.textureStorage2d<'rgba16uint', 'read-only'>,
  dims: d.v2u,
  pos: d.v2i,
  offset: d.v2i,
) => {
  'use gpu';
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
  return d.vec4u(
    std.select(inside, invalid, outOfBounds),
    std.select(outside, invalid, outOfBounds),
  );
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
        size,
        d.vec2i(gid.xy),
        d.vec2i(dx * offset, dy * offset),
      );

      // Check inside candidate (valid if not INVALID_COORD)
      if (sample.x !== INVALID_COORD) {
        const deltaIn = pos.sub(d.vec2f(sample.xy));
        const dist2 = std.dot(deltaIn, deltaIn);
        if (dist2 < bestInsideDist2) {
          bestInsideDist2 = dist2;
          bestInsideCoord = d.vec2u(sample.xy);
        }
      }

      // Check outside candidate (valid if not INVALID_COORD)
      if (sample.z !== INVALID_COORD) {
        const deltaOut = pos.sub(d.vec2f(sample.zw));
        const dist2 = std.dot(deltaOut, deltaOut);
        if (dist2 < bestOutsideDist2) {
          bestOutsideDist2 = dist2;
          bestOutsideCoord = d.vec2u(sample.zw);
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

  // Get SDF and color values from slots
  const sdfValue = sdfSlot.$(
    gid.xy,
    size,
    signedDist,
    insideCoord,
    outsideCoord,
  );

  const colorValue = colorSlot.$(
    gid.xy,
    size,
    signedDist,
    insideCoord,
    outsideCoord,
  );

  std.textureStore(
    distWriteLayout.$.sdfTexture,
    d.vec2i(gid.xy),
    d.vec4f(sdfValue, 0, 0, 0),
  );

  std.textureStore(
    distWriteLayout.$.colorTexture,
    d.vec2i(gid.xy),
    colorValue,
  );
});

type FloodTexture =
  & TgpuTexture<{
    size: [number, number];
    format: 'rgba16uint';
  }>
  & StorageFlag;

export type SdfTexture =
  & TgpuTexture<{
    size: [number, number];
    format: 'rgba16float';
  }>
  & StorageFlag
  & SampledFlag;

export type ColorTexture =
  & TgpuTexture<{
    size: [number, number];
    format: 'rgba8unorm';
  }>
  & StorageFlag
  & SampledFlag;

export type JumpFloodExecutor = {
  /** Run the jump flood algorithm. */
  run(): void;
  /** The SDF output texture (r32float). */
  readonly sdfOutput: SdfTexture;
  /** The color output texture (rgba8unorm). */
  readonly colorOutput: ColorTexture;
  /** Clean up GPU resources created by this executor. */
  /**
   * Returns a new executor with the additional bind group attached.
   * Use this to pass resources needed by custom classify or getter functions.
   */
  with(bindGroup: TgpuBindGroup): JumpFloodExecutor;
  /** Clean up GPU resources created by this executor. */
  destroy(): void;
};

type JumpFloodOptions = {
  root: TgpuRoot;
  size: { width: number; height: number };
  /**
   * Classify function that determines which pixels are "inside" for the SDF.
   * Returns true if the pixel is inside, false if outside.
   */
  classify: (coord: d.v2u, size: d.v2u) => boolean;
  /**
   * Get the SDF value to store. Receives signed distance in pixels.
   */
  getSdf: (
    coord: d.v2u,
    size: d.v2u,
    signedDist: number,
    insidePx: d.v2u,
    outsidePx: d.v2u,
  ) => number;
  /**
   * Get the color value to store.
   */
  getColor: (
    coord: d.v2u,
    size: d.v2u,
    signedDist: number,
    insidePx: d.v2u,
    outsidePx: d.v2u,
  ) => d.v4f;
};

/**
 * Create a Jump Flood Algorithm executor with separate SDF and color output textures.
 */
export function createJumpFlood(options: JumpFloodOptions): JumpFloodExecutor {
  const { root, size, classify, getSdf, getColor } = options;
  const { width, height } = size;

  // Create output textures
  const sdfTexture = root['~unstable']
    .createTexture({
      size: [width, height],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled') as SdfTexture;

  const colorTexture = root['~unstable']
    .createTexture({
      size: [width, height],
      format: 'rgba8unorm',
    })
    .$usage('storage', 'sampled') as ColorTexture;

  // Create flood textures
  const floodTextureA = root['~unstable']
    .createTexture({
      size: [width, height],
      format: 'rgba16uint',
    })
    .$usage('storage') as FloodTexture;

  const floodTextureB = root['~unstable']
    .createTexture({
      size: [width, height],
      format: 'rgba16uint',
    })
    .$usage('storage') as FloodTexture;

  const offsetUniform = root.createUniform(d.i32);

  const initFromSeedPipeline = root['~unstable']
    .with(classifySlot, classify)
    .withCompute(initFromSeedCompute)
    .createPipeline();

  const jumpFloodPipeline = root['~unstable']
    .with(offsetAccessor, offsetUniform)
    .withCompute(jumpFloodCompute)
    .createPipeline();

  const createDistancePipeline = root['~unstable']
    .with(sdfSlot, getSdf)
    .with(colorSlot, getColor)
    .withCompute(createDistanceFieldCompute)
    .createPipeline();

  // Create bind groups
  const initBG = root.createBindGroup(initLayout, {
    writeView: floodTextureA.createView(
      d.textureStorage2d('rgba16uint', 'write-only'),
    ),
  });

  const pingPongBGs = [
    root.createBindGroup(pingPongLayout, {
      readView: floodTextureA.createView(
        d.textureStorage2d('rgba16uint', 'read-only'),
      ),
      writeView: floodTextureB.createView(
        d.textureStorage2d('rgba16uint', 'write-only'),
      ),
    }),
    root.createBindGroup(pingPongLayout, {
      readView: floodTextureB.createView(
        d.textureStorage2d('rgba16uint', 'read-only'),
      ),
      writeView: floodTextureA.createView(
        d.textureStorage2d('rgba16uint', 'write-only'),
      ),
    }),
  ];

  const distWriteBG = root.createBindGroup(distWriteLayout, {
    sdfTexture: sdfTexture.createView(
      d.textureStorage2d('rgba16float', 'write-only'),
    ),
    colorTexture: colorTexture.createView(
      d.textureStorage2d('rgba8unorm', 'write-only'),
    ),
  });

  const workgroupsX = Math.ceil(width / 8);
  const workgroupsY = Math.ceil(height / 8);
  const maxDim = Math.max(width, height);
  const maxRange = 1 << Math.floor(Math.log2(maxDim));

  function destroy() {
    floodTextureA.destroy();
    floodTextureB.destroy();
    sdfTexture.destroy();
    colorTexture.destroy();
  }

  // Determine which ping-pong texture contains the final result.
  // After all iterations, sourceIdx will have been flipped, so compute it.
  const iterationCount = (() => {
    let count = 0;
    let o = maxRange;
    while (o >= 1) {
      count++;
      o = Math.floor(o / 2);
    }
    return count;
  })();
  const finalSourceIdx = iterationCount % 2 === 0 ? 0 : 1;

  function createExecutor(
    additionalBindGroups: TgpuBindGroup[] = [],
  ): JumpFloodExecutor {
    // Pre-cache pipeline+bindgroup combos to avoid re-chaining per frame.
    let prebuiltInitPipeline = initFromSeedPipeline.with(initBG);
    for (const bg of additionalBindGroups) {
      prebuiltInitPipeline = prebuiltInitPipeline.with(bg);
    }

    const prebuiltFloodPipelines = pingPongBGs.map((bg) => {
      let p = jumpFloodPipeline.with(bg);
      for (const addBg of additionalBindGroups) {
        p = p.with(addBg);
      }
      return p;
    });

    const prebuiltDistPipelines = pingPongBGs.map((bg) => {
      let p = createDistancePipeline.with(bg).with(distWriteBG);
      for (const addBg of additionalBindGroups) {
        p = p.with(addBg);
      }
      return p;
    });

    function run() {
      prebuiltInitPipeline.dispatchWorkgroups(workgroupsX, workgroupsY);

      // Run jump flood iterations
      let sourceIdx = 0;
      let offset = maxRange;

      while (offset >= 1) {
        offsetUniform.write(offset);
        prebuiltFloodPipelines[sourceIdx]?.dispatchWorkgroups(
          workgroupsX,
          workgroupsY,
        );
        sourceIdx ^= 1;
        offset = Math.floor(offset / 2);
      }

      // Create final distance field
      prebuiltDistPipelines[finalSourceIdx]?.dispatchWorkgroups(
        workgroupsX,
        workgroupsY,
      );
    }

    return {
      run,
      with: (bindGroup) => createExecutor([...additionalBindGroups, bindGroup]),
      destroy,
      sdfOutput: sdfTexture,
      colorOutput: colorTexture,
    };
  }

  return createExecutor();
}
