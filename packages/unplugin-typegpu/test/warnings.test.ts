import type { UnpluginBuildContext, UnpluginContext } from 'unplugin';
import { describe, expect, it, vi } from 'vitest';
import babelPlugin from '../src/babel.ts';
import type { PluginState } from '../src/core/common.ts';
import { unpluginFactory } from '../src/core/factory.ts';

const broken = 'const = tgpu;';

describe('warning prefixes', () => {
  it('hands a bundler the bare message, since the bundler names the plugin itself', () => {
    using consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const warn = vi.fn();
    const plugin = unpluginFactory({}, { framework: 'rollup' });

    const result = plugin.transform.handler.call(
      { warn } as unknown as UnpluginBuildContext & UnpluginContext,
      broken,
      '/broken.ts',
    );

    expect(result).toBeUndefined();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatch(/^Failed to parse \/broken\.ts\. Cause: /);
  });

  it('names the plugin in the Babel plugin', () => {
    using consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = { opts: {} } as PluginState;

    babelPlugin().pre.call(state);
    state.warn('something happened');

    expect(consoleWarn).toHaveBeenCalledExactlyOnceWith('[unplugin-typegpu] something happened');
  });
});
