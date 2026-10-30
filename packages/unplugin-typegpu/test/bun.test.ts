import { afterEach, assert, expect, it, vi } from 'vitest';
import bunPlugin from '../src/bun.ts';
import { babelTransform } from './transform.ts';

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

it('warns once and preserves unsupported metadata when obfuscating', async () => {
  using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  const built = babelTransform(`
    export const a = () => { 'use gpu'; };
    export const b = () => { 'use gpu'; };
  `) as string;
  const code = built.replace(/\bv: \d+/g, 'v: 1');

  vi.stubGlobal('Bun', { file: () => ({ text: async () => code }) });
  const onLoad = vi.fn<Bun.PluginBuilder['onLoad']>();
  await bunPlugin({ unstable_obfuscate: true, autoNamingEnabled: false }).setup({
    onLoad,
  } as unknown as Bun.PluginBuilder);

  const call = onLoad.mock.calls[0];
  assert(call);
  const result = await call[1]({
    path: '/test.ts',
    loader: 'ts',
    namespace: 'file',
    async defer() {},
  });
  assert(result && 'contents' in result);

  expect(result.contents).toBe(code);
  expect(warn.mock.calls.length).toBe(1);
  expect(warn.mock.calls[0]![0]).toMatchInlineSnapshot(
    `"[unplugin-typegpu] Cannot obfuscate already transformed functions in /test.ts: unsupported metadata version 1 (expected 2)."`,
  );
});
