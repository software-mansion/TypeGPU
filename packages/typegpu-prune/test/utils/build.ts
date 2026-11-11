import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import prune from '../../src/plugin/esbuild.ts';

const repoRoot = fileURLToPath(new URL('../../../..', import.meta.url));

/** Whether a bundled source file is part of TypeGPU itself */
export const isTypegpuSource = (path: string) => /(^|\/)packages\/typegpu\/src\//.test(path);

export interface BuiltFixture {
  /** Absolute path of the bundle, ready to be imported */
  path: string;
  code: string;
  /** Source files with code in the bundle, relative to the repository root */
  sources: string[];
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
    metafile: true,
    absWorkingDir: repoRoot,
    plugins: [prune({ precompile: options.precompile })],
  });
  const code = result.outputFiles[0]?.text ?? '';
  await writeFile(outfile, code);
  const sources = Object.values(result.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([path]) => path),
  );
  return { path: outfile, code, sources };
}
