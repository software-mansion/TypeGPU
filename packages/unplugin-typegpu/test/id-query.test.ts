import { describe, expect, it } from 'vitest';
import type {
  UnpluginBuildContext,
  UnpluginContext,
  UnpluginContextMeta,
} from 'unplugin';
import { unpluginFactory } from '../src/core/factory.ts';

const plugin = unpluginFactory(
  {
    include: [/\.m?[jt]sx?(?:\?.*)?$/],
    autoNamingEnabled: false,
    earlyPruning: false,
  },
  {} as UnpluginContextMeta,
);

const ctx = { warn: () => {} } as unknown as UnpluginBuildContext &
  UnpluginContext;

const code = `\
import { tgpu } from 'typegpu';

const increment = tgpu.fn([])(() => {
  const x: number = 2+2;
});
`;

describe('module ids with query parameters', () => {
  it('parses TypeScript when the query contains a dot', () => {
    const result = plugin.transform.handler.call(
      ctx,
      code,
      '/src/kernel.ts?v=1.2.3',
    );
    expect(result).toBeDefined();
    expect(result?.code).toContain('__TYPEGPU_META__');
  });

  it('parses TypeScript when the query has no dot', () => {
    const result = plugin.transform.handler.call(
      ctx,
      code,
      '/src/kernel.ts?raw',
    );
    expect(result).toBeDefined();
    expect(result?.code).toContain('__TYPEGPU_META__');
  });
});
