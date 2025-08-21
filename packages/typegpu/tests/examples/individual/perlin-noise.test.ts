/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('perlin noise example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'perlin-noise',
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct mainCompute_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var<uniform> size_2: vec4u;

      @group(0) @binding(1) var<storage, read_write> memory_3: array<vec3f>;

      var<private> seed_7: vec2f;

      fn seed3_6(value: vec3f) {
        seed_7 = (value.xy + vec2f(value.z));
      }

      fn randSeed3_5(seed: vec3f) {
        seed3_6(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_7, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_7, vec2f(54.47856521606445, 345.8415222167969));
        seed_7.x = fract((cos(a) * 136.8168));
        seed_7.y = fract((cos(b) * 534.7645));
        return seed_7.y;
      }

      fn randOnUnitSphere_8() -> vec3f {
        var z = ((2 * item_9()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = ((6.283185307179586 * item_9()) - 3.141592653589793);
        var x = (sin(theta) * oneMinusZSq);
        var y = (cos(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient_4(pos: vec3i) -> vec3f {
        randSeed3_5((1e-3 * vec3f(pos)));
        return randOnUnitSphere_8();
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(input: mainCompute_Input_1) {
        var size = size_2;
        var idx = ((input.gid.x + (input.gid.y * size.x)) + ((input.gid.z * size.x) * size.y));
        memory_3[idx] = computeJunctionGradient_4(vec3i(input.gid.xyz));
      }"
    `);
  });
});
