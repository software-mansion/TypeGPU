import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebpackPluginInstance } from 'webpack';

// NOTE: Bundlers are imported lazily, so that worker threads (see `bundleWorker.ts`)
// only load the bundler they are using, which significantly reduces memory usage.

/**
 * Workspace packages that `typegpu` depends on are consumed from source during
 * development, but from their built files when installed from npm. We alias
 * them to their built files, so that we measure what users actually get.
 */
const builtWorkspaceDeps: Record<string, string> = {
  tinyest: fileURLToPath(new URL('../../packages/tinyest/dist/index.js', import.meta.url)),
};

for (const [name, builtPath] of Object.entries(builtWorkspaceDeps)) {
  if (!existsSync(builtPath)) {
    throw new Error(
      `'${name}' is not built (missing ${builtPath}). Run 'pnpm --filter ${name} build'.`,
    );
  }
}

/**
 * Webpack's default JS minimizer (see `optimization.minimizer` in webpack's
 * `lib/config/defaults.js`), but minifying on the calling thread.
 *
 * By default, every compilation spins up its own worker thread with a cold Terser
 * instance, which for hundreds of tiny single-asset builds costs more CPU than the
 * minification itself. We parallelize across builds instead (see `runTests.ts`).
 *
 * Falls back to webpack's default minimizer if the plugin can't be resolved,
 * which is slower, but produces the same output.
 */
function createInThreadMinimizer(): WebpackPluginInstance | '...' {
  try {
    const MinimizerPlugin = createRequire(import.meta.resolve('webpack'))(
      'minimizer-webpack-plugin',
    );
    return new MinimizerPlugin({
      test: /^[^?#]*\.(?:[cm]?js)(?:[?#].*)?$/i,
      minify: MinimizerPlugin.terserMinify,
      minimizerOptions: { compress: { passes: 2 } },
      parallel: false,
    });
  } catch {
    console.warn('Could not resolve minimizer-webpack-plugin, using the default minimizer.');
    return '...';
  }
}

let webpackMinimizer: ReturnType<typeof createInThreadMinimizer> | undefined;

const PACKAGES_DIR = fileURLToPath(new URL('../../packages/', import.meta.url));

function assertNotWorkspaceSource(file: string) {
  const relative = path.relative(PACKAGES_DIR, file.split('?')[0] ?? file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return;
  }
  const segments = relative.split(path.sep);
  if (segments.includes('dist') || segments.includes('node_modules')) {
    return;
  }
  throw new Error(
    `Bundled a workspace source file: ${file}\n` +
      `If a new workspace dependency was added to 'typegpu', add it to 'builtWorkspaceDeps' in bundleWith.ts, and build it in the 'test' script.`,
  );
}

const rolldownWorkspaceSourceGuard = {
  name: 'treeshake-test:no-workspace-source',
  load(id: string) {
    assertNotWorkspaceSource(id);
    return null;
  },
};

const webpackWorkspaceSourceGuard: WebpackPluginInstance = {
  apply(compiler) {
    const name = 'treeshake-test:no-workspace-source';
    compiler.hooks.normalModuleFactory.tap(name, (factory) => {
      factory.hooks.afterResolve.tap(name, (data) => {
        const resource = data.createData.resource;
        if (resource) {
          assertNotWorkspaceSource(resource);
        }
      });
    });
  },
};

export type ResultRecord = {
  testFilename: string;
  bundler: string;
  size: number;
};

export async function bundleWithEsbuild(entryUrl: URL, outDir: URL): Promise<URL> {
  const entryFileName = path.basename(entryUrl.pathname, '.js');
  const outPath = new URL(`${entryFileName}.esbuild.js`, outDir);
  const [{ build: esbuild }, { default: esbuildPlugin }] = await Promise.all([
    import('esbuild'),
    import('unplugin-typegpu/esbuild'),
  ]);
  await esbuild({
    plugins: [esbuildPlugin()],
    entryPoints: [entryUrl.pathname],
    alias: builtWorkspaceDeps,
    bundle: true,
    outfile: outPath.pathname,
    format: 'esm',
    minify: true,
    treeShaking: true,
  });
  return outPath;
}

export async function bundleWithWebpack(entryPath: URL, outDir: URL): Promise<URL> {
  const entryFileName = path.basename(entryPath.pathname, '.js');
  const outPath = new URL(`./${entryFileName}.webpack.js`, outDir);
  const [{ default: webpack }, { cachedTypegpuPlugin }] = await Promise.all([
    import('webpack'),
    import('./cachedTypegpuPlugin.ts'),
  ]);
  webpackMinimizer ??= createInThreadMinimizer();

  return new Promise((resolve, reject) => {
    webpack(
      {
        mode: 'production',
        entry: entryPath.pathname,
        output: {
          path: path.dirname(outPath.pathname),
          filename: path.basename(outPath.pathname),
        },
        plugins: [cachedTypegpuPlugin.webpack(), webpackWorkspaceSourceGuard],
        resolve: {
          // `$` makes webpack match the exact specifier
          alias: Object.fromEntries(
            Object.entries(builtWorkspaceDeps).map(([name, builtPath]) => [`${name}$`, builtPath]),
          ),
        },
        optimization: {
          minimize: true,
          minimizer: [webpackMinimizer],
        },
        // Nothing to reuse between isolated one-off builds, and the stats
        // object is only needed when reporting errors.
        cache: false,
        stats: 'errors-only',
      },
      (err, stats) => {
        if (err || stats?.hasErrors()) {
          reject(
            err ?? new Error(`Webpack bundling failed for ${entryFileName}\n${stats?.toString()}`),
          );
        } else {
          resolve(outPath);
        }
      },
    );
  });
}

export async function bundleWithTsdown(entryUrl: URL, outDir: URL): Promise<URL> {
  const entryFileName = path.basename(entryUrl.pathname, '.js');
  const outPath = new URL(`./${entryFileName}.tsdown.js`, outDir);
  const [{ build: tsdown }, { cachedTypegpuPlugin }] = await Promise.all([
    import('tsdown'),
    import('./cachedTypegpuPlugin.ts'),
  ]);

  try {
    await tsdown({
      plugins: [cachedTypegpuPlugin.rolldown(), rolldownWorkspaceSourceGuard],
      outputOptions: {
        name: path.basename(outPath.pathname),
        dir: path.dirname(outPath.pathname),
      },
      minify: true,
      platform: 'neutral',
      clean: false,
      entry: {
        [`${entryFileName}.tsdown`]: entryUrl.pathname,
      },
      noExternal: /.*/,
      alias: builtWorkspaceDeps,
    });

    return outPath;
  } catch (error) {
    throw new Error(`tsdown bundling failed`, { cause: error });
  }
}

export type Bundler = (entryUrl: URL, outDir: URL) => Promise<URL>;

export const availableBundlers = {
  // https://github.com/software-mansion/TypeGPU/issues/2026
  // esbuild: bundleWithEsbuild,
  tsdown: bundleWithTsdown,
  webpack: bundleWithWebpack,
} satisfies Record<string, Bundler>;

export type BundlerName = keyof typeof availableBundlers;

export async function getFileSize(filePath: URL): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.size;
}
