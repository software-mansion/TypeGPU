import { exec } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { defineConfig } from 'tsup';

function promiseExec(command: string) {
  return new Promise<string>((resolve, reject) => {
    exec(command, (err, stdout, _stderr) => {
      if (err !== null) {
        reject(err);
      }

      resolve(stdout);
    });
  });
}

/**
 * Resolved imports of .ne files, generated corresponding
 * .ts files for them,
 */
function nearleyPlugin() {
  return {
    name: 'NearleyPlugin',
    setup(build) {
      build.onResolve({ filter: /\.ne$/ }, (args) => {
        const absoluteSrc = path.join(args.resolveDir, args.path);

        const absoluteDist = path.resolve(
          args.resolveDir,
          args.path.replace(/\.ne$/, '.ts'),
        );

        return {
          namespace: args.namespace,
          path: absoluteSrc,
          // Passing data to the `onLoad` step
          pluginData: { absoluteSrc, absoluteDist },
        };
      });

      build.onLoad({ filter: /\.ne$/ }, async (args) => {
        // Data passed in from the `onResolve` step
        const { absoluteSrc, absoluteDist } = args.pluginData;
        const stdout = await promiseExec(`nearleyc ${absoluteSrc}`);

        const code = `\
/* eslint-disable */
// @ts-nocheck
${stdout}`;

        await writeFile(absoluteDist, code, 'utf-8');

        return {
          contents: code,
          loader: 'ts',
        };
      });
    },
  };
}

export default defineConfig({
  entryPoints: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs', 'esm'],
  tsconfig: './tsconfig.json',
  target: 'es2017',
  splitting: true,
  sourcemap: true,
  minify: true,
  clean: true,
  dts: true,
  esbuildPlugins: [nearleyPlugin()],
});
