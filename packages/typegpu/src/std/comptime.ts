import { bool } from '../data/numeric.ts';
import { snip } from '../data/snippet.ts';
import { WgslTypeError } from '../errors.ts';
import { setName } from '../shared/meta.ts';
import { $gpuCallable } from '../shared/symbols.ts';
import { type DualFn, isKnownAtComptime as isSnippetKnownAtComptime } from '../types.ts';

/**
 * Returns `true` if the value passed into it is statically known at comptime (during shader
 * generation), and `false` if the value is determined by shader execution.
 * During normal JavaScript execution every value is available right away, so it always
 * returns `true`.
 *
 * Note that shader constants are NOT considered statically known at comptime, therefore
 * `isKnownAtComptime()` returns `false` for them.
 *
 * A good example of where this is useful, it being able to opt into optimizations that are
 * only valid when a value is statically known, like unrolling a loop whose iteration count
 * depends on the size of an array:
 *
 * @example
 * ```ts
 * const layout = tgpu.bindGroupLayout({
 *   // Swapping this for `d.arrayOf(d.vec2f)` (a runtime-sized array)
 *   // makes the loop below stay a loop.
 *   boids: { storage: d.arrayOf(d.vec2f, 3) },
 * });
 *
 * function centroid() {
 *   'use gpu';
 *   let sum = d.vec2f();
 *
 *   for (
 *     const boid of std.isKnownAtComptime(layout.$.boids.length)
 *       ? tgpu.unroll(layout.$.boids)
 *       : layout.$.boids
 *   ) {
 *     sum += boid;
 *   }
 *
 *   return sum / d.f32(layout.$.boids.length);
 * }
 * ```
 *
 * Generates:
 *
 * ```wgsl
 * @group(0) @binding(0) var<storage, read> boids: array<vec2f, 3>;
 *
 * fn centroid() -> vec2f {
 *   var sum = vec2f();
 *   // unrolled iteration #0
 *   sum = (sum + boids[0u]);
 *   // unrolled iteration #1
 *   sum = (sum + boids[1u]);
 *   // unrolled iteration #2
 *   sum = (sum + boids[2u]);
 *   // ---
 *   return (sum / 3f);
 * }
 * ```
 *
 * @note
 * Only the *value* of the argument is inspected, the expression itself is never emitted into
 * the generated shader. Passing an expression with possible side effects (e.g. a call to a
 * `tgpu.fn`) throws during shader generation, because those side effects would run in JS but
 * silently not happen on the GPU.
 *
 * Such an expression is determined by shader execution, so it is never known at comptime and
 * the check would always yield `false`. Remove the check, and if the side effect itself is
 * needed, run it as a separate statement.
 */
export const isKnownAtComptime = /* @__PURE__ */ (() => {
  const impl = ((_value: unknown) => true) as DualFn<(value: unknown) => boolean>;
  impl.toString = () => 'isKnownAtComptime';
  setName(impl, 'isKnownAtComptime');
  impl[$gpuCallable] = {
    call(_ctx, [value]) {
      if (!value) {
        throw new WgslTypeError('`isKnownAtComptime` was called without any arguments');
      }

      if (value.possibleSideEffects) {
        throw new WgslTypeError(
          '`isKnownAtComptime` received an argument with possible side effects. The expression is never emitted into the shader, so its side effects would silently not happen, and a side-effectful expression is never known at comptime anyway, so the result would always be `false`. Remove the check, and run the side effect as a separate statement if it is needed.',
        );
      }

      return snip(
        isSnippetKnownAtComptime(value),
        bool,
        /* origin */ 'constant',
        /* possibleSideEffects */ false,
      );
    },
  };
  return impl;
})();
