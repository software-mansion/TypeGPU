import { build as esbuild } from 'esbuild';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { build as tsdown } from 'tsdown';
import esbuildPlugin from 'unplugin-typegpu/esbuild';
import rolldownPlugin from 'unplugin-typegpu/rolldown';
import webpackPlugin from 'unplugin-typegpu/webpack';
import webpack from 'webpack';

export type ResultRecord = {
  testFilename: string;
  bundler: string;
  size: number;
};

export async function bundleWithEsbuild(entryUrl: URL, outDir: URL): Promise<URL> {
  const entryFileName = path.basename(entryUrl.pathname, '.ts');
  const outPath = new URL(`${entryFileName}.esbuild.js`, outDir);
  await esbuild({
    plugins: [esbuildPlugin({})],
    entryPoints: [entryUrl.pathname],
    bundle: true,
    outfile: outPath.pathname,
    format: 'esm',
    minify: true,
    treeShaking: true,
  });
  return outPath;
}

export async function bundleWithWebpack(entryPath: URL, outDir: URL): Promise<URL> {
  const entryFileName = path.basename(entryPath.pathname, '.ts');
  const outPath = new URL(`./${entryFileName}.webpack.js`, outDir);

  return new Promise((resolve, reject) => {
    webpack(
      {
        entry: entryPath.pathname,
        output: {
          path: path.dirname(outPath.pathname),
          filename: path.basename(outPath.pathname),
        },
        plugins: [webpackPlugin({})],
        module: {
          rules: [
            {
              test: /\.ts$/,
              use: {
                loader: 'ts-loader',
                options: {
                  compilerOptions: {
                    module: 'es2015',
                    target: 'es2015',
                    esModuleInterop: true,
                    allowSyntheticDefaultImports: true,
                    skipLibCheck: true,
                  },
                  transpileOnly: true,
                },
              },
              exclude: /node_modules/,
            },
          ],
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
  const entryFileName = path.basename(entryUrl.pathname, '.ts');
  const outPath = new URL(`./${entryFileName}.tsdown.js`, outDir);

  try {
    await tsdown({
      plugins: [rolldownPlugin({})],
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
