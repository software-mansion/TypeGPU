import { describe, expect } from 'vitest';
import { it } from '../utils/extendedIt.ts';

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

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() -> f32 {
          return 6f;
        }"
      `);
    });

    it('handles member access for local vectors', () => {
      const main = tgpu.fn([], d.f32)(() => {
        const size = d.vec3f(1, 2, 3);
        return size.x * size.y * size.z;
      });

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() -> f32 {
          var size = vec3f(1, 2, 3);
          return ((size.x * size.y) * size.z);
        }"
      `);
    });
  });

  it('should properly resolve this', ({ root }) => {
    class MyController {
      myBuffer = root.createUniform(d.u32);
      myFn = tgpu.fn([], d.u32)(() => {
        return this.myBuffer.$;
      });
    }

    const myController = new MyController();

    expect(tgpu.resolve([myController.myFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> item_1: u32;

      fn item() -> u32 {
        return item_1;
      }"
    `);
  });
});
