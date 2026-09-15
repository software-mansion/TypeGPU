import type { LoadHookSync } from 'node:module';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import install from '../src/node.ts';
import denoInstall from '../src/deno.ts';

const { registerHooks } = vi.hoisted(() => ({ registerHooks: vi.fn() }));
vi.mock('node:module', () => ({ registerHooks }));

const shader = `export const shader = () => { 'use gpu'; return 42; };`;
const context = { format: 'module', conditions: [], importAttributes: {} };

function loadHook(options?: Parameters<typeof install>[0]): LoadHookSync {
  install(options);
  return registerHooks.mock.lastCall?.[0].load;
}

beforeEach(() => registerHooks.mockReset());

describe('Node.js and Deno loader hooks', () => {
  it('exposes the same installer through the Deno alias', () => {
    expect(denoInstall).toBe(install);
  });
  it('returns the registration handle for deregistration', () => {
    const handle = { deregister: vi.fn() };
    registerHooks.mockReturnValue(handle);
    expect(install()).toBe(handle);
  });

  it.each(['ts', 'js', 'jsx', 'tsx', 'mts', 'mjs', 'cts', 'cjs'])(
    'transforms .%s modules and preserves the loader result',
    (extension) => {
      const load = loadHook();
      const result = { source: shader, format: 'module', shortCircuit: true };
      const nextLoad = vi.fn(() => result);
      const url = `file:///shaders/my%20shader.${extension}?version=1#shader`;
      const transformed = load(url, context, nextLoad);
      expect(nextLoad).toHaveBeenCalledWith(url, context);
      expect(transformed).toEqual({
        ...result,
        source: expect.stringContaining('__TYPEGPU_META__'),
      });
    },
  );

  it.each([new TextEncoder().encode(shader), new TextEncoder().encode(shader).buffer])(
    'decodes binary source',
    (source) => {
      const transformed = loadHook()('file:///shader.ts', context, () => ({
        source,
        format: 'module',
      }));
      expect(transformed.source).toContain('__TYPEGPU_META__');
    },
  );

  it('supports remote URLs and include/exclude globs with decoded file paths', () => {
    const load = loadHook({ include: '**/my shaders/*.ts', exclude: '**/skip.ts' });
    const result = { source: shader, format: 'module' };
    expect(load('file:///my%20shaders/test.ts', context, () => result).source).toContain(
      '__TYPEGPU_META__',
    );
    expect(load('file:///my%20shaders/skip.ts', context, () => result)).toBe(result);
    expect(load('file:///other/test.ts', context, () => result)).toBe(result);
    expect(loadHook()('https://example.com/shader.ts?v=1', context, () => result).source).toContain(
      '__TYPEGPU_META__',
    );
  });

  it.each([
    ['node:fs', { format: 'builtin', source: undefined }],
    ['file:///data.json', { format: 'json', source: shader }],
    ['file:///shader.wgsl', { format: 'module', source: shader }],
    ['file:///plain.ts', { format: 'module', source: 'export const value = 42;' }],
  ] as const)('passes through %s unchanged', (url, result) => {
    expect(loadHook()(url, context, () => result)).toBe(result);
  });

  it('honors earlyPruning and autoNamingEnabled options', () => {
    const result = { source: 'const value = custom.fn([])(() => 1);', format: 'module' };
    const options = { forceTgpuAlias: 'custom' };
    expect(loadHook(options)('file:///shader.ts', context, () => result)).toBe(result);
    expect(
      loadHook({ ...options, earlyPruning: false })('file:///shader.ts', context, () => result)
        .source,
    ).toContain('__TYPEGPU_AUTONAME__');
    expect(
      loadHook({ ...options, earlyPruning: false, autoNamingEnabled: false })(
        'file:///shader.ts',
        context,
        () => result,
      ).source,
    ).not.toContain('__TYPEGPU_AUTONAME__');
  });
});
