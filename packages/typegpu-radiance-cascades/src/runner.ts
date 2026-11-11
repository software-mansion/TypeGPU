import type { SampledFlag, TgpuBindGroup, TgpuCommandEncoder, TgpuRoot } from 'typegpu';
import { define, type RadianceCascadesOptions } from './define.ts';
import {
  instantiate,
  type RadianceCascadesInstance,
  type RadianceCascadesIo,
  type RadianceCascadesOutput,
  type RadianceCascadesOutputSize,
} from './instantiate.ts';

type OutputResource = RadianceCascadesOutput;
type RadianceTexture = Extract<RadianceCascadesOutput, { resourceType: 'texture' }>;

type CascadesOptions = RadianceCascadesOptions &
  Omit<RadianceCascadesIo, 'bindGroups'> & {
    root: TgpuRoot;
  };

/** @deprecated Use `defineAndInstantiate` and `instance.step(pass)`. */
export type RadianceCascadesExecutor<
  TOutput extends OutputResource = RadianceTexture & SampledFlag,
> = {
  run(commandEncoder?: TgpuCommandEncoder): void;
  with(bindGroup: TgpuBindGroup): RadianceCascadesExecutor<TOutput>;
  destroy(): void;

  readonly output: TOutput;

  initSync(): void;

  /** Optional: prepare pipelines ahead of the first run to move compilation out of that update. */
  initAsync(): Promise<void>;
};

/** @deprecated Use `defineAndInstantiate(root, options, io)` and `instance.step(pass)`. */
export function create(
  options: CascadesOptions & { output?: undefined; size: RadianceCascadesOutputSize },
): RadianceCascadesExecutor;
/** @deprecated Use `defineAndInstantiate(root, options, io)` and `instance.step(pass)`. */
export function create<TOutput extends OutputResource>(
  options: CascadesOptions & { output: TOutput },
): RadianceCascadesExecutor<TOutput>;
export function create(options: CascadesOptions): RadianceCascadesExecutor<OutputResource> {
  const { root } = options;
  const definition = define(root, options);

  // `with` variants used to share one set of textures. They now share the definition and the
  // output, and each variant allocates its cascades on first use.
  let ownOutput: (RadianceTexture & SampledFlag) | undefined;
  if (!options.output) {
    const { width, height } = options.size ?? { width: 0, height: 0 };
    if (!width || !height) {
      throw new Error('Size could not be inferred from output, pass explicit size in options.');
    }
    ownOutput = root
      .createTexture({ size: [width, height], format: 'rgba16float' })
      .$usage('storage', 'sampled');
  }
  const output = options.output ?? (ownOutput as RadianceTexture & SampledFlag);
  const instances: RadianceCascadesInstance[] = [];

  function createExecutor(bindGroups: TgpuBindGroup[]): RadianceCascadesExecutor<OutputResource> {
    let instance: RadianceCascadesInstance | undefined;
    const getInstance = () => {
      if (!instance) {
        instance = instantiate(root, definition, { ...options, output, bindGroups });
        instances.push(instance);
      }
      return instance;
    };

    return {
      run(commandEncoder) {
        const encoder = commandEncoder ?? root.createCommandEncoder();
        const pass = encoder.beginComputePass();
        getInstance().step(pass);
        pass.end();
        if (!commandEncoder) {
          encoder.submit();
        }
      },
      with: (bindGroup) => createExecutor([...bindGroups, bindGroup]),
      destroy() {
        for (const created of instances) {
          created.destroy();
        }
        ownOutput?.destroy();
      },
      output,
      initSync: () => getInstance().initSync(),
      initAsync: () => getInstance().initAsync(),
    };
  }

  return createExecutor([]);
}

/** @deprecated Use `defineAndInstantiate` */
export const createRadianceCascades = create;
