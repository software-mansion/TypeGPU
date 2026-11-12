import { build as esbuild } from 'esbuild';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as tsdown } from 'tsdown';
import esbuildPlugin from 'unplugin-typegpu/esbuild';
import rolldownPlugin from 'unplugin-typegpu/rolldown';
import webpackPlugin from 'unplugin-typegpu/webpack';
import webpack from 'webpack';

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

export type ResultRecord = {
  testFilename: string;
  bundler: string;
  size: number;
};

export async function bundleWithEsbuild(entryUrl: URL, outDir: URL): Promise<URL> {
  const entryFileName = path.basename(entryUrl.pathname, '.js');
  const outPath = new URL(`${entryFileName}.esbuild.js`, outDir);
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

  return new Promise((resolve, reject) => {
    webpack(
      {
        entry: entryPath.pathname,
        output: {
          path: path.dirname(outPath.pathname),
          filename: path.basename(outPath.pathname),
        },
        plugins: [webpackPlugin()],
        resolve: {
          // `$` makes webpack match the exact specifier
          alias: Object.fromEntries(
            Object.entries(builtWorkspaceDeps).map(([name, builtPath]) => [`${name}$`, builtPath]),
          ),
        },
        optimization: {
          minimize: true,
        },
      },
      (err, stats) => {
        if (err || stats?.hasErrors()) {
          console.error(stats?.toString());
          reject(err || new Error('Webpack bundling failed'));
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

  try {
    await tsdown({
      plugins: [rolldownPlugin()],
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

export async function getFileSize(filePath: URL): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.size;
}
