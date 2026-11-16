import type { TgpuBindGroup, TgpuCommandEncoder, TgpuComputePass, TgpuRoot } from 'typegpu';
import { define, type HolographicOptions } from './define.ts';
import {
  type HolographicInstance,
  type HolographicOutputTexture,
  type HolographicSectorTexture,
  instantiate,
} from './instantiate.ts';
import { getByteSize } from './layout.ts';

type Options = HolographicOptions & {
  root: TgpuRoot;
  size: { width: number; height: number };
};

type RunOptions = {
  /** Each run starts from zero incident light. Default: 1 */
  iterations?: number;
  encoder?: TgpuCommandEncoder | GPUCommandEncoder;
  pass?: TgpuComputePass | GPUComputePassEncoder;
};

/** @deprecated Use `defineAndInstantiate` and `instance.step(pass)`. */
export type Executor = {
  /**
   * Records the solve into one compute pass. A supplied encoder is not submitted and a
   * supplied pass is not ended; with neither, the work is submitted on its own.
   */
  run(options?: RunOptions): void;
  /** Returns an executor with an extra bind group attached to all internal passes */
  with(bindGroup: TgpuBindGroup): Executor;
  /** Angular mean radiance, normalized by 2π */
  readonly output: HolographicOutputTexture;
  /** Radiance from the +X, +Y, −X and −Y sectors, one layer each */
  readonly sectors: HolographicSectorTexture;
  /** Logical size of the allocations owned by the executor */
  readonly byteSize: number;
  /** Releases the output textures and intermediate buffers */
  destroy(): void;
  /** Eagerly initializes every pipeline. Calling this is optional. */
  initSync(): void;
  /** Eagerly initializes every pipeline. Calling this is optional. */
  initAsync(): Promise<void>;
};

/**
 * Four-sector HRC, using the interval and fluence recurrences of Freeman et al. (2025).
 * @deprecated Use `defineAndInstantiate(root, options, io)` and `instance.step(pass)`.
 */
export function create(options: Options): Executor {
  const { root, size } = options;
  const definition = define(root, options);
  const instances: HolographicInstance[] = [];
  const base = instantiate(root, definition, { size });
  instances.push(base);
  const byteSize = getByteSize([size.width, size.height], definition.rgb, definition.hasSource);

  function createExecutor(bindGroups: readonly TgpuBindGroup[]): Executor {
    // `with` variants used to share every allocation. They now share the definition and the
    // output textures, and each variant allocates its intervals on first use.
    let instance: HolographicInstance | undefined = bindGroups.length === 0 ? base : undefined;
    const getInstance = () => {
      if (!instance) {
        instance = instantiate(root, definition, {
          size,
          bindGroups,
          output: base.output,
          sectors: base.sectors,
        });
        instances.push(instance);
      }
      return instance;
    };

    return {
      output: base.output,
      sectors: base.sectors,
      byteSize,
      run({ encoder, pass, iterations = 1 } = {}) {
        const current = getInstance();
        const commands = encoder ?? (pass ? undefined : root.createCommandEncoder());
        const computePass = pass ?? (commands as TgpuCommandEncoder).beginComputePass();
        current.iterations = iterations;
        current.step(computePass);
        if (!pass) computePass.end();
        if (!pass && !encoder) (commands as TgpuCommandEncoder).submit();
      },
      with: (bindGroup) => createExecutor([...bindGroups, bindGroup]),
      destroy() {
        // Variants borrow the base textures, so they go first
        for (const created of instances.toReversed()) created.destroy();
      },
      initSync: () => getInstance().initSync(),
      initAsync: () => getInstance().initAsync(),
    };
  }

  return createExecutor([]);
}
