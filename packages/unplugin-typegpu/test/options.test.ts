import { describe, expect, it } from 'vitest';
import type { Options } from '../src/core/common.ts';
import { babelTransform } from './transform.ts';

describe('options set to undefined', () => {
  // With `exactOptionalPropertyTypes`, this only type-checks when every option accepts
  // `undefined`, so that `flag ? value : undefined` can be passed straight through.
  const unset: Options = {
    include: undefined,
    exclude: undefined,
    enforce: undefined,
    forceTgpuAlias: undefined,
    autoNamingEnabled: undefined,
    unstable_obfuscate: undefined,
    unstable_sourceMaps: undefined,
    earlyPruning: undefined,
  };

  it('fall back to the defaults', () => {
    const code = `\
      import { tgpu } from 'typegpu';
      import * as d from 'typegpu/data';

      const cst = tgpu.const(d.u32, 1);
    `;

    expect(babelTransform(code, unset)).toBe(babelTransform(code, { autoNamingEnabled: true }));
    expect(babelTransform(code, unset)).toContain('__TYPEGPU_AUTONAME__');
  });
});
