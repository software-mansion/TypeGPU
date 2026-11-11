import type { TgpuBindGroup, TgpuRoot } from 'typegpu';
import { define, type JumpFloodOptions } from './jumpFlood/define.ts';
import {
  instantiate,
  type ColorTexture,
  type JumpFloodInstance,
  type SdfTexture,
} from './jumpFlood/instantiate.ts';

import { classifySlot as kernelClassifySlot } from './jumpFlood/kernels.ts';
export type { ColorTexture, SdfTexture } from './jumpFlood/instantiate.ts';

/**
 * Slot for the classify function that determines which pixels are "inside" for the SDF.
 *
 * @deprecated The `jumpFlood` module binds `classify` itself, through its `define` options.
 */
export const classifySlot = kernelClassifySlot;

/**
 * @deprecated Use {@link JumpFloodInstance} from `jumpFlood.defineAndInstantiate`.
 */
export type Executor = {
  /** Run the jump flood algorithm. */
  run(): void;
  /** The SDF output texture (rgba16float). */
  readonly sdfOutput: SdfTexture;
  /** The color output texture (rgba8unorm). */
  readonly colorOutput: ColorTexture;
  /**
   * Returns a new executor with the additional bind group attached.
   * Use this to pass resources needed by custom classify or getter functions.
   */
  with(bindGroup: TgpuBindGroup): Executor;
  /** Clean up GPU resources created by this executor. */
  destroy(): void;

  /**
   * Eagerly initializes every pipeline by calling `initSync` on each.
   * Calling this is optional.
   */
  initSync(): void;
  /**
   * Eagerly initializes every pipeline by calling `initAsync` on each.
   * Calling this is optional.
   */
  initAsync(): Promise<void>;
};

type LegacyJumpFloodOptions = JumpFloodOptions & {
  root: TgpuRoot;
  size: { width: number; height: number };
};

/**
 * Create a Jump Flood Algorithm executor with separate SDF and color output textures.
 *
 * @deprecated Use `jumpFlood.defineAndInstantiate(root, { classify, getSdf, getColor }, { size })`
 * and record it with `instance.step(pass)`. Extra bind groups go to `io.bindGroups`.
 */
export function createJumpFlood(options: LegacyJumpFloodOptions): Executor {
  const { root, size, classify, getSdf, getColor } = options;
  const definition = define(root, { classify, getSdf, getColor });
  const base = instantiate(root, definition, { size });
  // Every executor derived with `.with()` writes into the same outputs, and `destroy` on any of
  // them frees everything, like before.
  const instances: JumpFloodInstance[] = [base];

  function destroy() {
    for (const instance of instances) {
      instance.destroy();
    }
  }

  function createExecutor(instance: JumpFloodInstance, bindGroups: TgpuBindGroup[]): Executor {
    return {
      run() {
        const encoder = root.createCommandEncoder();
        const pass = encoder.beginComputePass();
        instance.step(pass);
        pass.end();
        encoder.submit();
      },
      with(bindGroup) {
        const extended = [...bindGroups, bindGroup];
        const derived = instantiate(root, definition, {
          size,
          bindGroups: extended,
          sdfOutput: base.sdfOutput,
          colorOutput: base.colorOutput,
        });
        instances.push(derived);
        return createExecutor(derived, extended);
      },
      destroy,
      sdfOutput: base.sdfOutput,
      colorOutput: base.colorOutput,
      initSync: () => instance.initSync(),
      initAsync: () => instance.initAsync(),
    };
  }

  return createExecutor(base, []);
}
