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

const finalizeReadLayout = tgpu.bindGroupLayout({
  readView: {
    storageTexture: d.textureStorage2d('rgba16uint', 'read-only'),
  },
});

/**
 * Slot for the classify function that determines which pixels are "inside" for the SDF.
 * The function receives the pixel coordinate and texture size, and returns whether
 * the pixel is inside (true) or outside (false).
 */
export const classifySlot = tgpu.slot<(coord: d.v2u, size: d.v2u) => boolean>();

/** Slot for SDF getter - returns the signed distance value to store. */
const sdfSlot =
  tgpu.slot<
    (coord: d.v2u, size: d.v2u, signedDist: number, insidePx: d.v2u, outsidePx: d.v2u) => number
  >();

/** Slot for color getter - returns the color value to store. */
const colorSlot =
  tgpu.slot<
    (coord: d.v2u, size: d.v2u, signedDist: number, insidePx: d.v2u, outsidePx: d.v2u) => d.v4f
  >();

const sampleWithOffset = (
  tex: d.textureStorage2d<'rgba16uint', 'read-only'>,
  dims: d.v2u,
  pos: d.v2i,
  offset: d.v2i,
) => {
  'use gpu';
  const samplePos = pos.add(offset);

  const outOfBounds =
    samplePos.x < 0 ||
    samplePos.y < 0 ||
    samplePos.x >= d.i32(dims.x) ||
    samplePos.y >= d.i32(dims.y);

  if (outOfBounds) {
    return d.vec4u(INVALID_COORD);
  }

  return std.textureLoad(tex, samplePos);
};

const offsetAccessor = tgpu.accessor(d.i32);

const initFromSeedCompute = tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const size = std.textureDimensions(initLayout.$.writeView);
  if (gid.x >= size.x || gid.y >= size.y) {
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

  std.textureStore(initLayout.$.writeView, d.vec2i(gid.xy), d.vec4u(insideCoord, outsideCoord));
});

const jumpFloodCompute = tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const size = std.textureDimensions(pingPongLayout.$.readView);
  if (gid.x >= size.x || gid.y >= size.y) {
    return;
  }

  const offset = offsetAccessor.$;
  const pos = d.vec2i(gid.xy);

  const invalid = d.vec2u(INVALID_COORD);
  let bestInsideCoord = d.vec2u(invalid);
  let bestOutsideCoord = d.vec2u(invalid);

  let bestInsideDist2 = d.i32(2147483647);
  let bestOutsideDist2 = d.i32(2147483647);

  for (const dy of tgpu.unroll([-1, 0, 1])) {
    for (const dx of tgpu.unroll([-1, 0, 1])) {
      const sample = sampleWithOffset(
        pingPongLayout.$.readView,
        size,
        pos,
        d.vec2i(dx, dy) * offset,
      );

      if (sample.x !== INVALID_COORD) {
        const deltaIn = pos - d.vec2i(sample.xy);
        const dist2 = deltaIn.x * deltaIn.x + deltaIn.y * deltaIn.y;

        if (dist2 < bestInsideDist2) {
          bestInsideDist2 = dist2;
          bestInsideCoord = d.vec2u(sample.xy);
        }
      }

      if (sample.z !== INVALID_COORD) {
        const deltaOut = pos - d.vec2i(sample.zw);
        const dist2 = deltaOut.x * deltaOut.x + deltaOut.y * deltaOut.y;

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

// Runs a final JFA pass at offset=1 and immediately computes the signed distance
const finalizeCompute = tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const size = std.textureDimensions(finalizeReadLayout.$.readView);
  if (gid.x >= size.x || gid.y >= size.y) {
    return;
  }

  const pos = d.vec2i(gid.xy);
  const invalid = d.vec2u(INVALID_COORD);
  let bestInsideCoord = d.vec2u(invalid);
  let bestOutsideCoord = d.vec2u(invalid);
  let bestInsideDist2 = d.i32(2147483647);
  let bestOutsideDist2 = d.i32(2147483647);

  for (const dy of tgpu.unroll([-1, 0, 1])) {
    for (const dx of tgpu.unroll([-1, 0, 1])) {
      const sample = sampleWithOffset(finalizeReadLayout.$.readView, size, pos, d.vec2i(dx, dy));

      if (sample.x !== INVALID_COORD) {
        const deltaIn = pos - d.vec2i(sample.xy);
        const dist2 = deltaIn.x * deltaIn.x + deltaIn.y * deltaIn.y;

        if (dist2 < bestInsideDist2) {
          bestInsideDist2 = dist2;
          bestInsideCoord = d.vec2u(sample.xy);
        }
      }

      if (sample.z !== INVALID_COORD) {
        const deltaOut = pos - d.vec2i(sample.zw);
        const dist2 = deltaOut.x * deltaOut.x + deltaOut.y * deltaOut.y;

        if (dist2 < bestOutsideDist2) {
          bestOutsideDist2 = dist2;
          bestOutsideCoord = d.vec2u(sample.zw);
        }
      }
    }
  }

  const posF = d.vec2f(gid.xy);
  let insideDist = d.f32(3.4 * 10 ** 38);
  let outsideDist = d.f32(3.4 * 10 ** 38);

  if (bestInsideCoord.x !== INVALID_COORD) {
    insideDist = std.distance(posF, d.vec2f(bestInsideCoord));
  }

  if (bestOutsideCoord.x !== INVALID_COORD) {
    outsideDist = std.distance(posF, d.vec2f(bestOutsideCoord));
  }

  const signedDist = insideDist - outsideDist;
  const sdfValue = sdfSlot.$(gid.xy, size, signedDist, bestInsideCoord, bestOutsideCoord);
  const colorValue = colorSlot.$(gid.xy, size, signedDist, bestInsideCoord, bestOutsideCoord);

  std.textureStore(distWriteLayout.$.sdfTexture, d.vec2i(gid.xy), d.vec4f(sdfValue, 0, 0, 0));
  std.textureStore(distWriteLayout.$.colorTexture, d.vec2i(gid.xy), colorValue);
});

export type SdfTexture = TgpuTexture<{
  size: [number, number];
  format: 'rgba16float';
}> &
  StorageFlag &
  SampledFlag;

export type ColorTexture = TgpuTexture<{
  size: [number, number];
  format: 'rgba8unorm';
}> &
  StorageFlag &
  SampledFlag;

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
  const sdfTexture = root
    .createTexture({
      size: [width, height],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');

  const colorTexture = root
    .createTexture({
      size: [width, height],
      format: 'rgba8unorm',
    })
    .$usage('storage', 'sampled');

  // Create flood textures
  const floodTextureA = root
    .createTexture({
      size: [width, height],
      format: 'rgba16uint',
    })
    .$usage('storage');

  const floodTextureB = root
    .createTexture({
      size: [width, height],
      format: 'rgba16uint',
    })
    .$usage('storage');

  const offsetUniform = root.createUniform(d.i32);

  const initFromSeedPipeline = root
    .with(classifySlot, classify)
    .createComputePipeline({ compute: initFromSeedCompute });

  const jumpFloodPipeline = root
    .with(offsetAccessor, offsetUniform)
    .createComputePipeline({ compute: jumpFloodCompute });

  const finalizePipeline = root
    .with(sdfSlot, getSdf)
    .with(colorSlot, getColor)
    .createComputePipeline({ compute: finalizeCompute });

  // Create bind groups
  const initBG = root.createBindGroup(initLayout, {
    writeView: floodTextureA.createView(d.textureStorage2d('rgba16uint', 'write-only')),
  });

  const pingPongBGs = [
    root.createBindGroup(pingPongLayout, {
      readView: floodTextureA.createView(d.textureStorage2d('rgba16uint', 'read-only')),
      writeView: floodTextureB.createView(d.textureStorage2d('rgba16uint', 'write-only')),
    }),
    root.createBindGroup(pingPongLayout, {
      readView: floodTextureB.createView(d.textureStorage2d('rgba16uint', 'read-only')),
      writeView: floodTextureA.createView(d.textureStorage2d('rgba16uint', 'write-only')),
    }),
  ];

  const distWriteBG = root.createBindGroup(distWriteLayout, {
    sdfTexture: sdfTexture.createView(d.textureStorage2d('rgba16float', 'write-only')),
    colorTexture: colorTexture.createView(d.textureStorage2d('rgba8unorm', 'write-only')),
  });

  const finalizeReadBGs = [
    root.createBindGroup(finalizeReadLayout, {
      readView: floodTextureA.createView(d.textureStorage2d('rgba16uint', 'read-only')),
    }),
    root.createBindGroup(finalizeReadLayout, {
      readView: floodTextureB.createView(d.textureStorage2d('rgba16uint', 'read-only')),
    }),
  ];

  const workgroupsX = Math.ceil(width / 8);
  const workgroupsY = Math.ceil(height / 8);
  const maxDim = Math.max(width, height);

  // Largest power-of-two strictly less than maxDim.
  const maxRange = 2 ** Math.floor(Math.log2(Math.max(maxDim - 1, 1)));

  function destroy() {
    floodTextureA.destroy();
    floodTextureB.destroy();
    sdfTexture.destroy();
    colorTexture.destroy();
  }

  function createExecutor(additionalBindGroups: TgpuBindGroup[] = []): JumpFloodExecutor {
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

    const prebuiltFinalizePipelines = finalizeReadBGs.map((bg) => {
      let p = finalizePipeline.with(bg).with(distWriteBG);
      for (const addBg of additionalBindGroups) {
        p = p.with(addBg);
      }
      return p;
    });

    function run() {
      prebuiltInitPipeline.dispatchWorkgroups(workgroupsX, workgroupsY);

      let sourceIdx = 0;
      let offset = maxRange;

      while (offset >= 1) {
        offsetUniform.write(offset);
        prebuiltFloodPipelines[sourceIdx]?.dispatchWorkgroups(workgroupsX, workgroupsY);
        sourceIdx ^= 1;
        offset = Math.floor(offset / 2);
      }

      // Finalize: JFA+1 at offset=1 fused with distance field output
      prebuiltFinalizePipelines[sourceIdx]?.dispatchWorkgroups(workgroupsX, workgroupsY);
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
