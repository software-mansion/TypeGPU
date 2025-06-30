import { describe, expect } from 'vitest';
import { it } from '../utils/extendedIt.ts';
import { parse, parseResolved } from '../utils/parseResolved.ts';

// Library entrypoints
import { tgpu } from '../../src/index.ts';
import * as d from '../../src/data/index.ts';

describe('codeGen', () => {
  describe('vectors', () => {
    it('handles member access for external vectors', () => {
      const size = d.vec3f(1, 2, 3);
      const main = tgpu.fn([], d.f32)(() => {
        return size.x * size.y * size.z;
      });

      expect(parseResolved({ main })).toBe(
        parse('fn main() -> f32 { return ((1 * 2) * 3); }'),
      );
    });

    it('handles member access for local vectors', () => {
      const main = tgpu.fn([], d.f32)(() => {
        const size = d.vec3f(1, 2, 3);
        return size.x * size.y * size.z;
      });

      expect(parseResolved({ main })).toBe(parse(`
        fn main() -> f32 {
          var size = vec3f(1, 2, 3);
          return ((size.x * size.y) * size.z);
        }
      `));
    });
  });
});
