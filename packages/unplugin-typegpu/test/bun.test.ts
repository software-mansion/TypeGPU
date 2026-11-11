import { afterEach, assert, expect, it, vi } from 'vitest';
import bunPlugin from '../src/bun.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

it.each([undefined, true, false])('respects earlyPruning: %s', async (earlyPruning) => {
  const code = 'const myStruct = d.struct({ value: d.f32 });';
  vi.stubGlobal('Bun', { file: () => ({ text: async () => code }) });
  const onLoad = vi.fn<Bun.PluginBuilder['onLoad']>();
  await bunPlugin({ earlyPruning }).setup({ onLoad } as unknown as Bun.PluginBuilder);

  const call = onLoad.mock.calls[0];
  assert(call);
  const result = await call[1]({
    path: '/test.ts',
    loader: 'ts',
    namespace: 'file',
    async defer() {},
  });
  assert(result && 'contents' in result);

  if (earlyPruning === false) {
    expect(result.contents).toContain('__TYPEGPU_AUTONAME__');
    expect(result.contents).toContain('"myStruct"');
  } else {
    expect(result.contents).toBe(code);
  }
  expect(result.loader).toBe('ts');
});

it.each([
  [undefined, '/project/node_modules/lib/index.ts', false],
  [undefined, '/project/src/index.ts', true],
  [[], '/project/node_modules/lib/index.ts', true],
  [/src/, '/project/src/index.ts', false],
] as const)('respects exclude: %s (%s)', async (exclude, path, shouldTransform) => {
  const code = 'const myStruct = d.struct({ value: d.f32 });';
  vi.stubGlobal('Bun', { file: () => ({ text: async () => code }) });
  const onLoad = vi.fn<Bun.PluginBuilder['onLoad']>();
  await bunPlugin({ earlyPruning: false, exclude: exclude as RegExp[] | RegExp | undefined }).setup(
    { onLoad } as unknown as Bun.PluginBuilder,
  );

  const call = onLoad.mock.calls[0];
  assert(call);
  const result = await call[1]({ path, loader: 'ts', namespace: 'file', async defer() {} });
  assert(result && 'contents' in result);

  if (shouldTransform) {
    expect(result.contents).toContain('__TYPEGPU_AUTONAME__');
  } else {
    expect(result.contents).toBe(code);
  }
});
