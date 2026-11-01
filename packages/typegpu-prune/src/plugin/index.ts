import remapping, { type EncodedSourceMap } from '@jridgewell/remapping';
import { createUnplugin, type UnpluginFactory } from 'unplugin';
import { createTypegpuTransform, type Options as TypegpuOptions } from 'unplugin-typegpu';
import { transformPrecompile } from '../compiler/transform.ts';

export interface Options {
  /**
   * Whether `precompile()` calls get compiled at build time. When disabled, the arrows run
   * at runtime on full TypeGPU (the dev workflow).
   *
   * @default `true` for `vite build`, otherwise `process.env.NODE_ENV === 'production'`
   */
  precompile?: boolean | undefined;
  /**
   * Options for unplugin-typegpu. This plugin runs it on every module itself,
   * so it replaces unplugin-typegpu in the build config instead of going next to it.
   */
  typegpu?: TypegpuOptions | undefined;
}

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options = {}) => {
  let enabled = options.precompile ?? process.env.NODE_ENV === 'production';
  const typegpuTransform = createTypegpuTransform(options.typegpu);

  return {
    name: 'typegpu-prune',
    // Precompiled arrows have to be replaced before the TypeGPU transform sees them
    enforce: 'pre',
    vite: {
      config(_, env) {
        if (options.precompile === undefined) {
          enabled = env.command === 'build';
        }
      },
      configResolved(config) {
        if (config.plugins.some((plugin) => plugin.name === 'unplugin-typegpu')) {
          throw new Error(
            '[@typegpu/prune] The prune plugin already runs unplugin-typegpu. ' +
              'Remove unplugin-typegpu from the plugins, and pass its options through `typegpu` instead.',
          );
        }
      },
    },
    transform: {
      filter: {
        id: /\.[cm]?[jt]sx?(?:\?.*)?$/,
      },
      async handler(code, rawId) {
        const id = rawId.replace(/\?.*$/, '');
        const warn = (message: string) => this.warn(message);

        const precompiled =
          enabled && !id.includes('/node_modules/')
            ? await transformPrecompile(code, id, { typegpuOptions: options.typegpu })
            : undefined;
        for (const warning of precompiled?.warnings ?? []) {
          warn(warning);
        }

        // Whatever runs at runtime (in dev, everything) still needs the TypeGPU transform
        const transformed = typegpuTransform(precompiled?.code ?? code, rawId, warn);

        if (!precompiled) {
          return transformed && { code: transformed.code, map: transformed.map };
        }
        if (!transformed) {
          return { code: precompiled.code, map: precompiled.map };
        }
        return {
          code: transformed.code,
          map: remapping(
            [transformed.map as EncodedSourceMap, precompiled.map as EncodedSourceMap],
            () => null,
          ).toString(),
        };
      },
    },
  };
};

const prune = /*#__PURE__*/ createUnplugin(unpluginFactory);

export default prune;
