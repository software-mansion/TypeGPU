import { describe, expect } from 'vitest';
import { it } from '../utils/extendedIt.ts';

import tgpu, { d } from '../../src/index.js';

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

  it('should properly resolve the "this" keyword', ({ root }) => {
    class MyController {
      myBuffer = root.createUniform(d.u32);
      myFn = tgpu.fn([], d.u32)(() => {
        return this.myBuffer.$;
      });
    }

    const myController = new MyController();

    expect(tgpu.resolve([myController.myFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> myBuffer: u32;

      fn myFn() -> u32 {
        return myBuffer;
      }"
    `);
  });
});
