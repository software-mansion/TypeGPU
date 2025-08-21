/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('tgsl parsing test example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'tests',
      name: 'tgsl-parsing-test',
      controlTriggers: ['Run tests'],
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "fn negate_2(input: vec3<bool>) -> vec3<bool> {
        return vec3<bool>(!input.x, !input.y, !input.z);
      }

      struct Schema_3 {
        vec2b: vec2<bool>,
        vec4b: vec4<bool>,
        vec3b: vec3<bool>,
        bool: bool,
      }

      fn negateStruct_4(input: Schema_3) -> Schema_3 {
        var result = Schema_3(!(input.vec2b), !(input.vec4b), !(input.vec3b), !input.bool);
        return result;
      }

      fn logicalExpressionTests_1() -> bool {
        var s = true;
        s = (s && ((vec2i(1, 3) == vec2i(1, 3)).x == true));
        s = (s && ((vec2i(1, 3) == vec2i(1, 3)).y == true));
        s = (s && ((vec2i(1, 3) == vec2i(1, 2)).x == true));
        s = (s && ((vec2i(1, 3) == vec2i(1, 2)).y == false));
        s = (s && all(vec4<bool>(true, true, true, true)));
        s = (s && !all(vec4<bool>(true, false, true, true)));
        s = (s && any(vec4<bool>(false, false, true, false)));
        s = (s && !any(vec4<bool>(false, false, false, false)));
        s = (s && all(vec2i(1, 3) == vec2i(1, 3)));
        s = (s && !all(vec2i(1, 3) == vec2i(1, 2)));
        s = (s && all((vec3i(1, 2, 3) != vec3i(1, 2, 4)) == vec3<bool>(false, false, true)));
        s = (s && all((vec3f(1, -1, 0) < vec3f(1, 1, -1)) == vec3<bool>(false, true, false)));
        s = (s && all((vec3f(1, -1, 0) <= vec3f(1, 1, -1)) == vec3<bool>(true, true, false)));
        s = (s && all((vec3f(1, -1, 0) > vec3f(1, 1, -1)) == vec3<bool>(false, false, true)));
        s = (s && all((vec3f(1, -1, 0) >= vec3f(1, 1, -1)) == vec3<bool>(true, false, true)));
        s = (s && all(!(vec2<bool>(false, true)) == vec2<bool>(true, false)));
        s = (s && all((vec4<bool>(true, true, false, false) | vec4<bool>(true, false, true, false)) == vec4<bool>(true, true, true, false)));
        s = (s && all((vec4<bool>(true, true, false, false) & vec4<bool>(true, false, true, false)) == vec4<bool>(true, false, false, false)));
        s = (s && all(abs(vec3f(1) - vec3f(0.9990000128746033, 1, 1.0010000467300415)) <= (vec3f(1) - vec3f(1)) + 0.01));
        s = (s && !all(abs(vec3f(1) - vec3f(0.8999999761581421, 1, 1.100000023841858)) <= (vec3f(1) - vec3f(1)) + 0.01));
        s = (s && all(abs(vec3f(1) - vec3f(0.8999999761581421, 1, 1.100000023841858)) <= (vec3f(1) - vec3f(1)) + 0.2));
        s = (s && !all(abs(vec3f(1) - vec3f(0.699999988079071, 1, 1.2999999523162842)) <= (vec3f(1) - vec3f(1)) + 0.2));
        s = (s && all(select(vec2i(-1, -2), vec2i(1, 2), true) == vec2i(1, 2)));
        s = (s && all(select(vec4i(-1, -2, -3, -4), vec4i(1, 2, 3, 4), vec4<bool>(true, true, false, false)) == vec4i(1, 2, -3, -4)));
        var vec = vec3<bool>(true, false, true);
        s = (s && all(!(vec) == negate_2(vec)));
        var inputStruct = Schema_3(vec2<bool>(false, true), vec4<bool>(false, true, false, true), vec3<bool>(true, true, false), true);
        var resultStruct = negateStruct_4(inputStruct);
        s = (s && all(!(inputStruct.vec2b) == resultStruct.vec2b));
        s = (s && all(!(inputStruct.vec4b) == resultStruct.vec4b));
        s = (s && all(!(inputStruct.vec3b) == resultStruct.vec3b));
        s = (s && (!inputStruct.bool == resultStruct.bool));
        return s;
      }

      fn matrixOpsTests_5() -> bool {
        var s = true;
        s = (s && all(abs((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0, 1).x, vec3f(-1, 0, 1).y, vec3f(-1, 0, 1).z, 1) * vec4f(1, 2, 3, 1)) - vec4f(0, 2, 4, 1)) <= ((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0, 1).x, vec3f(-1, 0, 1).y, vec3f(-1, 0, 1).z, 1) * vec4f(1, 2, 3, 1)) - (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0, 1).x, vec3f(-1, 0, 1).y, vec3f(-1, 0, 1).z, 1) * vec4f(1, 2, 3, 1))) + 0.01));
        s = (s && all(abs((mat4x4f(vec3f(-1, 0, 1).x, 0, 0, 0, 0, vec3f(-1, 0, 1).y, 0, 0, 0, 0, vec3f(-1, 0, 1).z, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - vec4f(-1, 0, 3, 1)) <= ((mat4x4f(vec3f(-1, 0, 1).x, 0, 0, 0, 0, vec3f(-1, 0, 1).y, 0, 0, 0, 0, vec3f(-1, 0, 1).z, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - (mat4x4f(vec3f(-1, 0, 1).x, 0, 0, 0, 0, vec3f(-1, 0, 1).y, 0, 0, 0, 0, vec3f(-1, 0, 1).z, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1))) + 0.01));
        s = (s && all(abs((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - vec4f(1, -3, 2, 1)) <= ((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - (mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1))) + 0.01));
        s = (s && all(abs((mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - vec4f(3, 2, -1, 1)) <= ((mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - (mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1))) + 0.01));
        s = (s && all(abs((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - vec4f(-2, 1, 3, 1)) <= ((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - (mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1))) + 0.01));
        s = (s && all(abs(((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0, 1).x, vec3f(-1, 0, 1).y, vec3f(-1, 0, 1).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - vec4f(0, 2, 4, 1)) <= (((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0, 1).x, vec3f(-1, 0, 1).y, vec3f(-1, 0, 1).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - ((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0, 1).x, vec3f(-1, 0, 1).y, vec3f(-1, 0, 1).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1))) + 0.01));
        s = (s && all(abs(((mat4x4f(vec3f(-1, 0, 1).x, 0, 0, 0, 0, vec3f(-1, 0, 1).y, 0, 0, 0, 0, vec3f(-1, 0, 1).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - vec4f(-1, 0, 3, 1)) <= (((mat4x4f(vec3f(-1, 0, 1).x, 0, 0, 0, 0, vec3f(-1, 0, 1).y, 0, 0, 0, 0, vec3f(-1, 0, 1).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - ((mat4x4f(vec3f(-1, 0, 1).x, 0, 0, 0, 0, vec3f(-1, 0, 1).y, 0, 0, 0, 0, vec3f(-1, 0, 1).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1))) + 0.01));
        s = (s && all(abs(((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - vec4f(1, -3, 2, 1)) <= (((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - ((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1))) + 0.01));
        s = (s && all(abs(((mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - vec4f(3, 2, -1, 1)) <= (((mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - ((mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1))) + 0.01));
        s = (s && all(abs(((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - vec4f(-2, 1, 3, 1)) <= (((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - ((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1))) + 0.01));
        s = (s && all(abs(((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - vec4f(0, 1, 0, 1)) <= (((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - ((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1))) + 0.01));
        s = (s && all(abs(((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - vec4f(0, 0, 1, 1)) <= (((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - ((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1))) + 0.01));
        s = (s && all(abs(((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * (mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - vec4f(2, 1, 0, 1)) <= (((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * (mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - ((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * (mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1))) + 0.01));
        s = (s && all(abs(((mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 0, 0, 1)) - vec4f(0, 3, 0, 1)) <= (((mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 0, 0, 1)) - ((mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 0, 0, 1))) + 0.01));
        s = (s && all(abs(((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 1, 0, 1)) - vec4f(-1, 0, 0, 1)) <= (((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 1, 0, 1)) - ((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 1, 0, 1))) + 0.01));
        return s;
      }

      fn getVec_7() -> vec3f {
        return vec3f(1, 2, 3);
      }

      fn infixOperatorsTests_6() -> bool {
        var s = true;
        s = (s && all(abs(vec2f(2, 4) - vec2f(2, 4)) <= (vec2f(2, 4) - vec2f(2, 4)) + 0.01));
        s = (s && all(vec3u(6, 9, 12) == vec3u(6, 9, 12)));
        s = (s && all(vec4i(12, 16, 20, 24) == vec4i(12, 16, 20, 24)));
        s = (s && all(vec2i(3, 8) == vec2i(3, 8)));
        s = (s && all(vec2u(6, 12) == vec2u(6, 12)));
        s = (s && all(abs(((mat2x2f(1, 2, 3, 4) * 2) * vec2f(1, 10)) - vec2f(62, 84)) <= (((mat2x2f(1, 2, 3, 4) * 2) * vec2f(1, 10)) - ((mat2x2f(1, 2, 3, 4) * 2) * vec2f(1, 10))) + 0.01));
        s = (s && all(abs(((vec2f(1, 10) * mat2x2f(1, 2, 3, 4)) * -1) - vec2f(-21, -43)) <= (((vec2f(1, 10) * mat2x2f(1, 2, 3, 4)) * -1) - ((vec2f(1, 10) * mat2x2f(1, 2, 3, 4)) * -1)) + 0.01));
        s = (s && all(abs(((vec2f(1, 10) * -1) * mat2x2f(1, 2, 3, 4)) - vec2f(-21, -43)) <= (((vec2f(1, 10) * -1) * mat2x2f(1, 2, 3, 4)) - ((vec2f(1, 10) * -1) * mat2x2f(1, 2, 3, 4))) + 0.01));
        s = (s && all((((((vec3f(1, 10, 100) * mat3x3f(0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5)) * -1) * mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9)) * -1) * mat3x3f(2, 0, 0, 0, 2, 0, 0, 0, 2)) == vec3f(321, 654, 987)));
        s = (s && all((getVec_7() * getVec_7()) == vec3f(1, 4, 9)));
        s = (s && all(vec3f(12, 13, 14) == vec3f(12, 13, 14)));
        s = (s && all(vec3f(5, 4, 3) == vec3f(5, 4, 3)));
        s = (s && all(vec3f(15, 10, 6) == vec3f(15, 10, 6)));
        return s;
      }

      struct ComplexStruct_9 {
        arr: array<i32, 2>,
      }

      struct SimpleStruct_10 {
        vec: vec2f,
      }

      fn arrayAndStructConstructorsTest_8() -> bool {
        var s = true;
        var defaultComplexStruct = ComplexStruct_9();
        s = (s && (2 == 2));
        s = (s && (defaultComplexStruct.arr[0] == 0));
        s = (s && (defaultComplexStruct.arr[1] == 0));
        var defaultComplexArray = array<SimpleStruct_10, 3>();
        s = (s && (3 == 3));
        s = (s && all(defaultComplexArray[0].vec == vec2f()));
        s = (s && all(defaultComplexArray[1].vec == vec2f()));
        s = (s && all(defaultComplexArray[2].vec == vec2f()));
        var simpleStruct = SimpleStruct_10(vec2f(1, 2));
        var clonedSimpleStruct = simpleStruct;
        s = (s && all(simpleStruct.vec == clonedSimpleStruct.vec));
        simpleStruct.vec[1] += 1;
        s = (s && !all(simpleStruct.vec == clonedSimpleStruct.vec));
        var simpleArray = array<i32, 2>(3, 4);
        var clonedSimpleArray = simpleArray;
        s = (s && (simpleArray[0] == clonedSimpleArray[0]));
        s = (s && (simpleArray[1] == clonedSimpleArray[1]));
        simpleArray[1] += 1;
        s = (s && !(simpleArray[1] == clonedSimpleArray[1]));
        var complexStruct = ComplexStruct_9(array<i32, 2>(5, 6));
        var clonedComplexStruct = complexStruct;
        s = (s && (complexStruct.arr[0] == clonedComplexStruct.arr[0]));
        s = (s && (complexStruct.arr[1] == clonedComplexStruct.arr[1]));
        complexStruct.arr[1] += 1;
        s = (s && !(complexStruct.arr[1] == clonedComplexStruct.arr[1]));
        var complexArray = array<SimpleStruct_10, 3>(SimpleStruct_10(vec2f(7, 8)), SimpleStruct_10(vec2f(9, 10)), SimpleStruct_10(vec2f(11, 12)));
        var clonedComplexArray = complexArray;
        s = (s && all(complexArray[2].vec == clonedComplexArray[2].vec));
        complexArray[2].vec[1] += 1;
        s = (s && !all(complexArray[2].vec == clonedComplexArray[2].vec));
        var indirectClonedStruct = complexArray[0];
        s = (s && all(indirectClonedStruct.vec == complexArray[0].vec));
        var indirectlyClonedArray = complexStruct.arr;
        s = (s && (indirectlyClonedArray[0] == complexStruct.arr[0]));
        s = (s && (indirectlyClonedArray[1] == complexStruct.arr[1]));
        return s;
      }

      @group(0) @binding(0) var<storage, read_write> result_11: i32;

      @compute @workgroup_size(1) fn computeRunTests_0() {
        var s = true;
        s = (s && logicalExpressionTests_1());
        s = (s && matrixOpsTests_5());
        s = (s && infixOperatorsTests_6());
        s = (s && arrayAndStructConstructorsTest_8());
        if (s) {
          result_11 = 1;
        }
        else {
          result_11 = 0;
        }
      }"
    `);
  });
});
