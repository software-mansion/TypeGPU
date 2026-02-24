import { describe, expect } from 'vitest';
import { it } from '../utils/extendedIt.ts';

import tgpu, { d, std } from '../../src/index.js';

describe('extension based pruning', () => {
  it('should include extension code when the feature is used', () => {
    const someFn = tgpu.fn([], d.f32)(() => {
      if (std.extensionEnabled('f16')) {
        return d.f16(1.1) + d.f16(2.2) + d.f16(3.3);
      } else {
        return d.f32(4.4) + d.f32(5.5) + d.f32(6.6);
      }
    });

    expect(tgpu.resolve([someFn], { enableExtensions: ['f16'] }))
      .toMatchInlineSnapshot(`
        "enable f16;

        fn someFn() -> f32 {
          {
            return 6.599609375f;
          }
        }"
      `);

    expect(tgpu.resolve([someFn])).toMatchInlineSnapshot(`
      "fn someFn() -> f32 {
        {
          return 16.5f;
        }
      }"
    `);
  });
});
