import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import typegpuPlugin from 'unplugin-typegpu/esbuild';
import type { CaptureOptions, CaptureResult } from '../../src/capture.ts';

/**
 * Captures a fixture's default-exported arrow, bundled together with `capture` so that both
 * share one `typegpu` instance, as the build plugin does
 */
export async function captureFixture(
  entry: string,
  options: CaptureOptions = {},
): Promise<CaptureResult & { emit: typeof import('../../src/capture.ts').emit }> {
  const dir = await mkdtemp(join(tmpdir(), 'typegpu-prune-capture-'));
  const source = (path: string) => JSON.stringify(fileURLToPath(new URL(path, import.meta.url)));
  const entryFile = join(dir, 'entry.ts');
  const outfile = join(dir, 'out.mjs');
  await writeFile(
    entryFile,
    `import { capture, emit } from ${source('../../src/capture.ts')};
import fn from ${source(`../fixtures/${entry}`)};
export default async () => ({ ...(await capture(fn, ${JSON.stringify(options)})), emit });
`,
  );
  await build({
    entryPoints: [entryFile],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
    plugins: [typegpuPlugin({})],
  });
  const { default: run } = await import(pathToFileURL(outfile).href);
  return run();
}
