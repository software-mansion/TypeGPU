/**
 * The build-time evaluator: bundles a `precompile()` arrow together with the serializer
 * for Node (applying unplugin-typegpu), runs it, and returns the generated code.
 */

import { build, type Plugin } from 'esbuild';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import typegpuPlugin from 'unplugin-typegpu/esbuild';
import type { SerializeResult } from './serialize.ts';
import type { Options as TypegpuOptions } from 'unplugin-typegpu';

function serializerPath(): string {
  // Source in the monorepo, compiled output once published
  const candidates = ['./serialize.ts', './serialize.js', './serialize.mjs'].map((file) =>
    fileURLToPath(new URL(file, import.meta.url)),
  );
  const found = candidates.find((file) => existsSync(file));
  if (!found) {
    throw new Error('[@typegpu/prune] Could not find the build-time serializer.');
  }
  return found;
}

/** Resolves imports of the virtual arrow module, and every `typegpu` import, as if they came from the user's file */
function resolveFromUserFile(arrowFile: string, userDir: string): Plugin {
  return {
    name: 'typegpu-prune:resolve',
    setup(ctx) {
      ctx.onResolve({ filter: /.*/ }, async (args) => {
        const fromArrow = args.importer === arrowFile;
        const isTypegpu = /^typegpu(\/.*)?$/.test(args.path);
        if ((!fromArrow && !isTypegpu) || args.pluginData?.prune) {
          return undefined;
        }
        const result = await ctx.resolve(args.path, {
          kind: args.kind,
          resolveDir: userDir,
          pluginData: { prune: true },
        });
        if (result.errors.length > 0) {
          return { errors: result.errors };
        }
        return { path: result.path, external: result.external, namespace: result.namespace };
      });
    },
  };
}

export interface EvaluateOptions {
  /** Absolute path of the file the call is in */
  filename: string;
  /** Source of the virtual module: imports, copied constants, `export default <arrow>` and `export const options` */
  moduleSource: string;
  /** Options for unplugin-typegpu, applied to everything the arrow imports */
  typegpuOptions?: TypegpuOptions | undefined;
}

export async function evaluatePrecompile(options: EvaluateOptions): Promise<SerializeResult> {
  const hash = createHash('sha256')
    .update(options.filename)
    .update(options.moduleSource)
    .digest('hex')
    .slice(0, 16);
  const requestedDir = join(tmpdir(), 'typegpu-prune', `${hash}-${process.pid}-${Date.now()}`);
  await mkdir(requestedDir, { recursive: true });
  // esbuild reports importers by their real path (the temp dir is a symlink on macOS)
  const workDir = await realpath(requestedDir);

  const ext = /\.[cm]?tsx$|\.jsx$/.test(options.filename) ? 'tsx' : 'ts';
  const arrowFile = join(workDir, `arrow.${ext}`);
  const entryFile = join(workDir, 'entry.ts');
  const outFile = join(workDir, 'out.mjs');

  try {
    await writeFile(arrowFile, options.moduleSource);
    await writeFile(
      entryFile,
      `import { serializePrecompiled } from ${JSON.stringify(serializerPath())};
import fn, { options } from ${JSON.stringify(arrowFile)};
export default () => serializePrecompiled(fn, options);
`,
    );

    await build({
      entryPoints: [entryFile],
      outfile: outFile,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      sourcemap: 'inline',
      logLevel: 'silent',
      plugins: [
        resolveFromUserFile(arrowFile, dirname(options.filename)),
        typegpuPlugin(options.typegpuOptions ?? {}),
      ],
    });

    // Every evaluation brings its own copy of TypeGPU, which would otherwise warn about duplicates
    const globals = globalThis as { __TYPEGPU_VERSION__?: unknown };
    const hostVersion = globals.__TYPEGPU_VERSION__;
    delete globals.__TYPEGPU_VERSION__;
    let mod: { default: () => Promise<SerializeResult> };
    try {
      mod = await import(`${pathToFileURL(outFile).href}?t=${Date.now()}`);
    } finally {
      if (hostVersion === undefined) {
        delete globals.__TYPEGPU_VERSION__;
      } else {
        globals.__TYPEGPU_VERSION__ = hostVersion;
      }
    }
    return await mod.default();
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
