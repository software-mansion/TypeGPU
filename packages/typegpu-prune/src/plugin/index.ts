import { createUnplugin, type UnpluginFactory } from 'unplugin';
import { PACKAGE_NAME, transformPrecompile } from '../compiler/transform.ts';

export interface Options {
  /**
   * Whether `precompile()` calls get compiled at build time. When disabled, the arrows run
   * at runtime on full TypeGPU (the dev workflow).
   *
   * @default `true` for `vite build`, otherwise `process.env.NODE_ENV === 'production'`
   */
  precompile?: boolean | undefined;
  /** Options for unplugin-typegpu, applied to the code precompiled arrows import */
  typegpu?: Record<string, unknown> | undefined;
}

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options = {}, meta) => {
  let enabled = options.precompile ?? process.env.NODE_ENV === 'production';

  // In esbuild, a plugin that loads a file stops the plugins after it from seeing it,
  // so when there's nothing to precompile, we stay out of the way of unplugin-typegpu.
  // Vite decides on `enabled` later, and chains transforms anyway.
  if (!enabled && meta.framework !== 'vite') {
    return { name: 'typegpu-prune' };
  }

  return {
    name: 'typegpu-prune',
    // Before unplugin-typegpu, so that precompiled arrows never reach it
    enforce: 'pre',
    vite: {
      config(_, env) {
        if (options.precompile === undefined) {
          enabled = env.command === 'build';
        }
      },
    },
    transform: {
      filter: {
        id: /\.[cm]?[jt]sx?(?:\?.*)?$/,
        code: PACKAGE_NAME,
      },
      async handler(code, id) {
        if (!enabled || id.includes('/node_modules/')) {
          return undefined;
        }
        const result = await transformPrecompile(code, id.replace(/\?.*$/, ''), {
          typegpuOptions: options.typegpu,
        });
        if (!result) {
          return undefined;
        }
        for (const warning of result.warnings) {
          this.warn(warning);
        }
        return { code: result.code, map: result.map };
      },
    },
  };
};

const prune = /*#__PURE__*/ createUnplugin(unpluginFactory);

export default prune;
