import { build } from 'esbuild';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getName } from '../../src/shared/meta.ts';

const stdDir = new URL('../../src/std/', import.meta.url);

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

const stdModules = readdirSync(stdDir).filter(
  (file) => file.endsWith('.ts') && file !== 'index.ts',
);

describe('tree-shaking', () => {
  // A module whose exports are all unused gets dropped thanks to `sideEffects: false`, but once
  // one export is used, the rest only goes away if creating it is known to be side-effect free.
  // esbuild and terser (used by webpack) only respect `#__NO_SIDE_EFFECTS__` within the file that
  // declares the function, so module-level calls into other modules need `#__PURE__`.
  it.each(stdModules)('drops unused functions of std/%s in esbuild', async (file) => {
    const path = fileURLToPath(new URL(file, stdDir));
    const module = (await import(/* @vite-ignore */ path)) as Record<string, unknown>;
    // Only functions created in this module (not re-exported from elsewhere)
    const declared = [...readFileSync(path, 'utf8').matchAll(/^export const (\w+)/gm)].map(
      (match) => match[1] as string,
    );
    const own = declared
      .map((key) => [key, module[key]] as const)
      .filter(([, value]) => getName(value) !== undefined);
    const names = new Set(own.map(([, value]) => getName(value) as string));
    const [exportName, used] = own[0] ?? [];
    if (!exportName) {
      return;
    }

    const code = await bundle(
      `import { ${exportName} } from ${JSON.stringify(path)};\nconsole.log(${exportName});`,
    );

    const usedName = getName(used) as string;
    expect(bundledNames(code, names).filter((name) => name !== usedName)).toStrictEqual([]);
  });
});
