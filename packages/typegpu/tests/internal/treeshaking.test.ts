import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getName } from '../../src/shared/meta.ts';
import * as numeric from '../../src/std/numeric.ts';

const numericPath = fileURLToPath(new URL('../../src/std/numeric.ts', import.meta.url));

async function bundle(contents: string): Promise<string> {
  const result = await build({
    stdin: { contents, loader: 'ts', resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return result.outputFiles[0]?.text ?? '';
}

/** Names of the `dualImpl` functions that ended up in the bundle */
function bundledNames(code: string, names: Set<string>): string[] {
  return [...code.matchAll(/name:\s*["'`](\w+)["'`]/g)]
    .map((match) => match[1] as string)
    .filter((name) => names.has(name));
}

describe('tree-shaking', () => {
  // esbuild and terser (used by webpack) only respect `#__NO_SIDE_EFFECTS__` within
  // the file that declares the function, so calls into other modules need `#__PURE__`
  it('drops unused std/numeric functions in esbuild', async () => {
    const names = new Set(
      Object.values(numeric)
        .map((value) => getName(value))
        .filter((name): name is string => name !== undefined),
    );
    expect(names.size).toBeGreaterThan(40);

    const code = await bundle(
      `import { ceil } from ${JSON.stringify(numericPath)};\nconsole.log(ceil);`,
    );

    expect(bundledNames(code, names)).toStrictEqual(['ceil']);
  });
});
