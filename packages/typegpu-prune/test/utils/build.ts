import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prune from '../../src/plugin/esbuild.ts';

export interface BuiltFixture {
  /** Absolute path of the bundle, ready to be imported */
  path: string;
  code: string;
}

/** Bundles a fixture the way an app would be bundled, with or without precompiling */
export async function buildFixture(
  entry: string,
  options: { precompile: boolean; minify?: boolean },
): Promise<BuiltFixture> {
  const dir = await mkdtemp(join(tmpdir(), 'typegpu-prune-test-'));
  const outfile = join(dir, 'bundle.mjs');
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../fixtures/${entry}`, import.meta.url))],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: options.minify ?? false,
    write: false,
    outfile,
    logLevel: 'silent',
    plugins: [prune({ precompile: options.precompile })],
  });
  const code = result.outputFiles[0]?.text ?? '';
  await writeFile(outfile, code);
  return { path: outfile, code };
}
