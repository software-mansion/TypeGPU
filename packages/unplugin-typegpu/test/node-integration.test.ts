import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const version = spawnSync('deno', ['--version'], { encoding: 'utf8' }).stdout;
const match = version?.match(/deno (\d+)\.(\d+)/);
const supportsHooks =
  match && (Number(match[1]) > 2 || (Number(match[1]) === 2 && Number(match[2]) >= 8));

describe.each(['node', 'deno'])('%s loader integration', (runtime) => {
  it.skipIf(runtime === 'deno' && !supportsHooks).each(['dynamic import', 'preload'])(
    'transforms modules using %s',
    (mode) => {
      const directory = mkdtempSync(join(tmpdir(), 'typegpu-deno-'));
      try {
        const entrypoint = fileURLToPath(new URL(`../src/${runtime}.ts`, import.meta.url));
        writeFileSync(
          join(directory, 'deno.json'),
          JSON.stringify({
            nodeModulesDir: 'manual',
            lock: false,
            compilerOptions: { jsx: 'react', jsxFactory: 'h' },
          }),
        );
        writeFileSync(
          join(directory, 'preload.ts'),
          `
        import install from ${JSON.stringify(entrypoint)};
        export const hooks = install();
      `,
        );
        let main = `import assert from 'node:assert/strict';\nimport { hooks } from './preload.ts';\n`;
        for (const extension of [
          'ts',
          'js',
          'mts',
          'mjs',
          'cts',
          'cjs',
          ...(runtime === 'deno' ? ['tsx', 'jsx'] : []),
        ]) {
          const typed = ['ts', 'tsx', 'mts', 'cts'].includes(extension);
          const jsx = ['tsx', 'jsx'].includes(extension);
          const commonjs = ['cts', 'cjs'].includes(extension);
          writeFileSync(
            join(directory, `shader.${extension}`),
            `
          const shader = (x${typed ? ': number' : ''}) => { 'use gpu'; return x; };
          ${jsx ? 'const h = (tag, props) => tag; const element = <div />;' : ''}
          ${commonjs ? 'module.exports = { shader };' : 'export { shader };'}
        `,
          );
          main += `
          import { shader as shader_${extension} } from './shader.${extension}';
          assert.equal(shader_${extension}(42), 42);
          assert.ok(globalThis.__TYPEGPU_META__?.has(shader_${extension}), '${extension}');
        `;
        }
        writeFileSync(
          join(directory, 'after.ts'),
          `export const shader = () => { 'use gpu'; return 1; };`,
        );
        main += `
        hooks.deregister();
        const after = await import('./after.ts');
        assert.equal(globalThis.__TYPEGPU_META__.has(after.shader), false);
        console.log('All shaders transformed; deregistration passed');
      `;
        writeFileSync(join(directory, 'main.ts'), main);
        writeFileSync(
          join(directory, 'bootstrap.ts'),
          `
        import './preload.ts';
        await import('./main.ts');
      `,
        );
        const result = spawnSync(
          runtime === 'node' ? process.execPath : 'deno',
          [
            ...(runtime === 'deno'
              ? ['run', '--allow-read', '--allow-env', '--config', join(directory, 'deno.json')]
              : []),
            ...(mode === 'preload'
              ? ['--import', join(directory, 'preload.ts'), join(directory, 'main.ts')]
              : [join(directory, 'bootstrap.ts')]),
          ],
          {
            encoding: 'utf8',
            timeout: 20_000,
            env: { ...process.env, DENO_DIR: join(directory, 'cache') },
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain('All shaders transformed; deregistration passed');
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
