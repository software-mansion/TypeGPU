import { afterEach, assert, expect, it, vi } from 'vitest';
import bunPlugin from '../src/bun.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('warns with the plugin name when a file does not parse', async () => {
  vi.stubGlobal('Bun', { file: () => ({ text: async () => 'const = tgpu;' }) });
  using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const onLoad = vi.fn<Bun.PluginBuilder['onLoad']>();
  await bunPlugin().setup({ onLoad } as unknown as Bun.PluginBuilder);

  const call = onLoad.mock.calls[0];
  assert(call);
  const result = await call[1]({
    path: '/broken.ts',
    loader: 'ts',
    namespace: 'file',
    async defer() {},
  });
  assert(result && 'contents' in result);

  expect(result.contents).toBe('const = tgpu;');
  expect(warn).toHaveBeenCalledOnce();
  expect(warn.mock.calls[0]?.[0]).toMatch(
    /^\[unplugin-typegpu\] Failed to parse \/broken\.ts\. Cause: /,
  );
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
