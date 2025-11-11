import { describe, expect } from 'vitest';
import { it } from '../utils/extendedIt.ts';

import { tgpu } from '../../src/index.ts';
import * as d from '../../src/data/index.ts';
import * as std from '../../src/std/index.ts';

describe('extension based pruning', () => {
  it('should include extension code when the feature is used', () => {
    const someFn = tgpu.fn([], d.f32)(() => {
      if (std.extensionEnabled('f16')) {
        return d.f16(1.1) + d.f16(2.2) + d.f16(3.3);
      } else {
        return d.f32(4.4) + d.f32(5.5) + d.f32(6.6);
      }
    });

    expect(tgpu.resolve({
      externals: { someFn },
      enableExtensions: ['f16'],
    })).toMatchInlineSnapshot(`
      "enable f16;

      fn someFn_0() -> f32 {
        {
          return 6.599609375f;
        }
      }"
    `);

    expect(
      tgpu.resolve({
        externals: { someFn },
      }),
    ).toMatchInlineSnapshot(`
      "fn someFn_0() -> f32 {
        {
          return 16.5f;
        }
      }"
    `);
  });
});
