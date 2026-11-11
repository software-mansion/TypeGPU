import type { TgpuRoot } from 'typegpu';
import type * as d from 'typegpu/data';
import {
  classifySlot,
  colorSlot,
  colorWriteView,
  distWriteLayout,
  finalizeCompute,
  finalizeReadLayout,
  floodReadView,
  floodWriteView,
  initFromSeedCompute,
  initLayout,
  jumpFloodCompute,
  pingPongLayout,
  sdfSlot,
  sdfWriteView,
} from './kernels.ts';

/**
 * Shader-changing options of the `jumpFlood` module.
 *
 * @category Module
 */
export interface JumpFloodOptions {
  /**
   * Determines which pixels are "inside" for the SDF.
   * Receives the pixel coordinate and texture size, returns `true` if the pixel is inside.
   */
  classify: (coord: d.v2u, size: d.v2u) => boolean;
  /**
   * Returns the SDF value to store. Receives the signed distance in pixels, and the nearest
   * inside and outside pixels.
   */
  getSdf: (
    coord: d.v2u,
    size: d.v2u,
    signedDist: number,
    insidePx: d.v2u,
    outsidePx: d.v2u,
  ) => number;
  /**
   * Returns the color value to store. Receives the signed distance in pixels, and the nearest
   * inside and outside pixels.
   */
  getColor: (
    coord: d.v2u,
    size: d.v2u,
    signedDist: number,
    insidePx: d.v2u,
    outsidePx: d.v2u,
  ) => d.v4f;
}

/**
 * Builds the `jumpFlood` pipelines for the given callbacks. Doesn't depend on the texture size,
 * so one definition serves every size.
 *
 * @category Module
 */
export function define(root: TgpuRoot, options: JumpFloodOptions) {
  return {
    pipelines: {
      init: root
        .with(classifySlot, options.classify)
        .createComputePipeline({ compute: initFromSeedCompute }),
      flood: root.createComputePipeline({ compute: jumpFloodCompute }),
      finalize: root
        .with(sdfSlot, options.getSdf)
        .with(colorSlot, options.getColor)
        .createComputePipeline({ compute: finalizeCompute }),
    },
    layouts: {
      init: initLayout,
      pingPong: pingPongLayout,
      finalizeRead: finalizeReadLayout,
      distWrite: distWriteLayout,
    },
    views: {
      floodRead: floodReadView,
      floodWrite: floodWriteView,
      sdfWrite: sdfWriteView,
      colorWrite: colorWriteView,
    },
    /** Each dispatch covers a `workgroupSize` x `workgroupSize` tile of pixels. */
    workgroupSize: 8,
  };
}

/**
 * What {@link define} returns, and {@link instantiate} takes.
 *
 * @category Module
 */
export type JumpFloodDefinition = ReturnType<typeof define>;
