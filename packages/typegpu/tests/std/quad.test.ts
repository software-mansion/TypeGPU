import { describe, expect, expectTypeOf, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';

describe('quad std builtins', () => {
  it('emits every quad operation and preserves value types', () => {
    const testFn = tgpu.fn([d.f32, d.vec4u])((scalar, vector) => {
      const broadcast = std.quadBroadcast(scalar, 2);
      const diagonal = std.quadSwapDiagonal(vector);
      const swappedX = std.quadSwapX(vector);
      const swappedY = std.quadSwapY(vector);

      if (false) {
        expectTypeOf(broadcast).toEqualTypeOf<number>();
        expectTypeOf(diagonal).toEqualTypeOf<d.v4u>();
        expectTypeOf(swappedX).toEqualTypeOf<d.v4u>();
        expectTypeOf(swappedY).toEqualTypeOf<d.v4u>();
      }
    });

    expect(tgpu.resolve([testFn], { enableExtensions: ['subgroups'] })).toMatchInlineSnapshot(`
      "enable subgroups;

      fn testFn(scalar: f32, vector: vec4u) {
        let broadcast = quadBroadcast(scalar, 2i);
        let diagonal = quadSwapDiagonal(vector);
        let swappedX = quadSwapX(vector);
        let swappedY = quadSwapY(vector);
      }"
    `);
  });
});
