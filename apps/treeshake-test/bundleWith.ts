import { build as esbuild } from 'esbuild';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as tsdown } from 'tsdown';
import esbuildPlugin from 'unplugin-typegpu/esbuild';
import rolldownPlugin from 'unplugin-typegpu/rolldown';
import webpackPlugin from 'unplugin-typegpu/webpack';
import webpack, { type WebpackPluginInstance } from 'webpack';

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

const PACKAGES_DIR = fileURLToPath(new URL('../../packages/', import.meta.url));

/**
 * Throws if `file` is a source file of a workspace package (anything inside
 * `packages/*` that is not in a `dist` or `node_modules` directory).
 * Users install built packages from npm, so bundling sources would
 * silently measure something users never get.
 */
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
        plugins: [webpackPlugin(), webpackWorkspaceSourceGuard],
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
      plugins: [rolldownPlugin(), rolldownWorkspaceSourceGuard],
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
