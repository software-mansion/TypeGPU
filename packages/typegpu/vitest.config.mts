import { createJiti } from 'jiti';
import type TypeGPUPlugin from 'unplugin-typegpu/vite';
import { defineConfig, Plugin } from 'vitest/config';

const jiti = createJiti(import.meta.url);
const typegpu = await jiti.import<typeof TypeGPUPlugin>(
  'unplugin-typegpu/vite',
  { default: true },
);

const comprehensivePluginDetector = (): Plugin => {
  return {
    name: 'comprehensive-plugin-detective',
    enforce: 'pre',

    configResolved(config) {
      console.log('Setting up superior plugin');

      const plugins = config.plugins;

      if (config.esbuild !== false) {
        console.log('-- esbuild is enabled in config');
        console.log(`-- options: ${JSON.stringify(config.esbuild)}`);
      }

      const prePlugins = plugins.filter((p) =>
        p && p.enforce === 'pre' && p.transform &&
        p.name !== 'comprehensive-plugin-detective'
      );
      const normalPlugins = plugins.filter((p) =>
        p && !p.enforce && p.transform
      );
      const postPlugins = plugins.filter((p) =>
        p && p.enforce === 'post' && p.transform
      );

      console.log('Plugin monitoring order:');
      console.log('-- pre plugins:');
      prePlugins.forEach((p, i) =>
        console.log(`     ${i + 1}. ${p.name || 'unnamed'}`)
      );

      console.log('-- normal plugins (RENAME HAPPENS THERE, I CHECKED):');
      normalPlugins.forEach((p, i) =>
        console.log(`     ${i + 1}. ${p.name || 'unnamed'}`)
      );

      console.log('-- post plugins:');
      postPlugins.forEach((p, i) =>
        console.log(`     ${i + 1}. ${p.name || 'unnamed'}`)
      );

      normalPlugins.forEach((plugin) => {
        const originalTransform = plugin.transform;
        if (!originalTransform) {
          return;
        }

        const isEsbuild = plugin.name.includes('esbuild');

        if (isEsbuild) { // main suspect
          plugin.transform = async function (
            this: any,
            code: string,
            id: string,
            options?: {
              ssr?: boolean;
            } | undefined,
          ) {
            if (!id.includes('nameClashes.test.ts')) {
              if (typeof originalTransform === 'function') {
                return originalTransform.call(this, code, id, options);
              }
              return originalTransform.handler.call(this, code, id, options);
            }

            console.log('BEFORE');
            console.log(code);

            const resultPromise = typeof originalTransform === 'function'
              ? originalTransform.call(this, code, id, options)
              : originalTransform.handler.call(this, code, id, options);

            const result = await resultPromise;

            if (typeof result === 'string') {
              console.log('AFTER');
              console.log(result);
            } else if (
              result && typeof result === 'object' && 'code' in result
            ) {
              console.log('AFTER');
              console.log(result.code);
            }

            return result;
          };
        }
      });
    },
  };
};

export default defineConfig({
  plugins: [
    comprehensivePluginDetector(),
    typegpu({ forceTgpuAlias: 'tgpu', earlyPruning: false }),
  ],
  test: {
    globalSetup: ['setupVitest.ts'],
    testTimeout: 0,
    hookTimeout: 0,
  },
  esbuild: {
    keepNames: true,
    minifyIdentifiers: false,
  },
});
