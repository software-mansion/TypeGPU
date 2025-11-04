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
        s = (s && (true == true));
        s = (s && (true == true));
        s = (s && (true == true));
        s = (s && (false == false));
        s = (s && true);
        s = (s && !false);
        s = (s && true);
        s = (s && !false);
        s = (s && true);
        s = (s && !false);
        s = (s && true);
        s = (s && all((vec3f(1f, -1, 0f) < vec3f(1f, 1f, -1)) == vec3<bool>(false, true, false)));
        s = (s && all((vec3f(1f, -1, 0f) <= vec3f(1f, 1f, -1)) == vec3<bool>(true, true, false)));
        s = (s && all((vec3f(1f, -1, 0f) > vec3f(1f, 1f, -1)) == vec3<bool>(false, false, true)));
        s = (s && all((vec3f(1f, -1, 0f) >= vec3f(1f, 1f, -1)) == vec3<bool>(true, false, true)));
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && !false);
        s = (s && true);
        s = (s && !false);
        s = (s && all(select(vec2i(-1, -2), vec2i(1, 2), true) == vec2i(1, 2)));
        s = (s && all(select(vec4i(-1, -2, -3, -4), vec4i(1, 2, 3, 4), vec4<bool>(true, true, false, false)) == vec4i(1i, 2i, -3, -4)));
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
        s = (s && all(abs((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0f, 1f).x, vec3f(-1, 0f, 1f).y, vec3f(-1, 0f, 1f).z, 1) * vec4f(1, 2, 3, 1)) - vec4f(0, 2, 4, 1)) <= ((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0f, 1f).x, vec3f(-1, 0f, 1f).y, vec3f(-1, 0f, 1f).z, 1) * vec4f(1, 2, 3, 1)) - (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0f, 1f).x, vec3f(-1, 0f, 1f).y, vec3f(-1, 0f, 1f).z, 1) * vec4f(1, 2, 3, 1))) + 0.01f));
        s = (s && all(abs((mat4x4f(vec3f(-1, 0f, 1f).x, 0, 0, 0, 0, vec3f(-1, 0f, 1f).y, 0, 0, 0, 0, vec3f(-1, 0f, 1f).z, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - vec4f(-1, 0f, 3f, 1f)) <= ((mat4x4f(vec3f(-1, 0f, 1f).x, 0, 0, 0, 0, vec3f(-1, 0f, 1f).y, 0, 0, 0, 0, vec3f(-1, 0f, 1f).z, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - (mat4x4f(vec3f(-1, 0f, 1f).x, 0, 0, 0, 0, vec3f(-1, 0f, 1f).y, 0, 0, 0, 0, vec3f(-1, 0f, 1f).z, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1))) + 0.01f));
        s = (s && all(abs((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - vec4f(1f, -3, 2f, 1f)) <= ((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - (mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1))) + 0.01f));
        s = (s && all(abs((mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - vec4f(3f, 2f, -1, 1f)) <= ((mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - (mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1))) + 0.01f));
        s = (s && all(abs((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - vec4f(-2, 1f, 3f, 1f)) <= ((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1)) - (mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * vec4f(1, 2, 3, 1))) + 0.01f));
        s = (s && all(abs(((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0f, 1f).x, vec3f(-1, 0f, 1f).y, vec3f(-1, 0f, 1f).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - vec4f(0, 2, 4, 1)) <= (((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0f, 1f).x, vec3f(-1, 0f, 1f).y, vec3f(-1, 0f, 1f).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - ((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(-1, 0f, 1f).x, vec3f(-1, 0f, 1f).y, vec3f(-1, 0f, 1f).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1))) + 0.01f));
        s = (s && all(abs(((mat4x4f(vec3f(-1, 0f, 1f).x, 0, 0, 0, 0, vec3f(-1, 0f, 1f).y, 0, 0, 0, 0, vec3f(-1, 0f, 1f).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - vec4f(-1, 0f, 3f, 1f)) <= (((mat4x4f(vec3f(-1, 0f, 1f).x, 0, 0, 0, 0, vec3f(-1, 0f, 1f).y, 0, 0, 0, 0, vec3f(-1, 0f, 1f).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - ((mat4x4f(vec3f(-1, 0f, 1f).x, 0, 0, 0, 0, vec3f(-1, 0f, 1f).y, 0, 0, 0, 0, vec3f(-1, 0f, 1f).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1))) + 0.01f));
        s = (s && all(abs(((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - vec4f(1f, -3, 2f, 1f)) <= (((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - ((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1))) + 0.01f));
        s = (s && all(abs(((mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - vec4f(3f, 2f, -1, 1f)) <= (((mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - ((mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1))) + 0.01f));
        s = (s && all(abs(((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - vec4f(-2, 1f, 3f, 1f)) <= (((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1)) - ((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)) * vec4f(1, 2, 3, 1))) + 0.01f));
        s = (s && all(abs(((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - vec4f(0, 1, 0, 1)) <= (((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - ((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1))) + 0.01f));
        s = (s && all(abs(((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - vec4f(0, 0, 1, 1)) <= (((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - ((mat4x4f(1, 0, 0, 0, 0, cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1))) + 0.01f));
        s = (s && all(abs(((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * (mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - vec4f(2, 1, 0, 1)) <= (((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * (mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1)) - ((mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * (mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(1, 0, 0, 1))) + 0.01f));
        s = (s && all(abs(((mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 0, 0, 1)) - vec4f(0, 3, 0, 1)) <= (((mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 0, 0, 1)) - ((mat4x4f(vec3f(2, 3, 4).x, 0, 0, 0, 0, vec3f(2, 3, 4).y, 0, 0, 0, 0, vec3f(2, 3, 4).z, 0, 0, 0, 0, 1) * (mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, vec3f(0, 1, 0).x, vec3f(0, 1, 0).y, vec3f(0, 1, 0).z, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 0, 0, 1))) + 0.01f));
        s = (s && all(abs(((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 1, 0, 1)) - vec4f(-1, 0f, 0f, 1f)) <= (((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 1, 0, 1)) - ((mat4x4f(cos(1.5707963267948966), sin(1.5707963267948966), 0, 0, -sin(1.5707963267948966), cos(1.5707963267948966), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1) * (mat4x4f(cos(1.5707963267948966), 0, -sin(1.5707963267948966), 0, 0, 1, 0, 0, sin(1.5707963267948966), 0, cos(1.5707963267948966), 0, 0, 0, 0, 1) * mat4x4f(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1))) * vec4f(0, 1, 0, 1))) + 0.01f));
        return s;
      }

      fn getVec_7() -> vec3f {
        return vec3f(1, 2, 3);
      }

      fn infixOperatorsTests_6() -> bool {
        var s = true;
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && all(abs(((mat2x2f(1, 2, 3, 4) * 2) * vec2f(1, 10)) - vec2f(62, 84)) <= (((mat2x2f(1, 2, 3, 4) * 2) * vec2f(1, 10)) - ((mat2x2f(1, 2, 3, 4) * 2) * vec2f(1, 10))) + 0.01f));
        s = (s && all(abs(((vec2f(1, 10) * mat2x2f(1, 2, 3, 4)) * -1) - vec2f(-21, -43)) <= (((vec2f(1, 10) * mat2x2f(1, 2, 3, 4)) * -1) - ((vec2f(1, 10) * mat2x2f(1, 2, 3, 4)) * -1)) + 0.01f));
        s = (s && all(abs(((vec2f(1, 10) * -1) * mat2x2f(1, 2, 3, 4)) - vec2f(-21, -43)) <= (((vec2f(1, 10) * -1) * mat2x2f(1, 2, 3, 4)) - ((vec2f(1, 10) * -1) * mat2x2f(1, 2, 3, 4))) + 0.01f));
        s = (s && all((((((vec3f(1, 10, 100) * mat3x3f(0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5)) * -1) * mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9)) * -1) * mat3x3f(2, 0, 0, 0, 2, 0, 0, 0, 2)) == vec3f(321, 654, 987)));
        s = (s && all((getVec_7() * getVec_7()) == vec3f(1, 4, 9)));
        s = (s && true);
        s = (s && true);
        s = (s && true);
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
        s = (s && (defaultComplexStruct.arr[0] == 0i));
        s = (s && (defaultComplexStruct.arr[1] == 0i));
        var defaultComplexArray = array<SimpleStruct_10, 3>();
        s = (s && (3 == 3));
        s = (s && all(defaultComplexArray[0].vec == vec2f()));
        s = (s && all(defaultComplexArray[1].vec == vec2f()));
        s = (s && all(defaultComplexArray[2].vec == vec2f()));
        var simpleStruct = SimpleStruct_10(vec2f(1, 2));
        var clonedSimpleStruct = simpleStruct;
        s = (s && all(simpleStruct.vec == clonedSimpleStruct.vec));
        simpleStruct.vec[1] += 1f;
        s = (s && !all(simpleStruct.vec == clonedSimpleStruct.vec));
        var simpleArray = array<i32, 2>(3i, 4i);
        var clonedSimpleArray = simpleArray;
        s = (s && (simpleArray[0] == clonedSimpleArray[0]));
        s = (s && (simpleArray[1] == clonedSimpleArray[1]));
        simpleArray[1] += 1i;
        s = (s && !(simpleArray[1] == clonedSimpleArray[1]));
        var complexStruct = ComplexStruct_9(array<i32, 2>(5i, 6i));
        var clonedComplexStruct = complexStruct;
        s = (s && (complexStruct.arr[0] == clonedComplexStruct.arr[0]));
        s = (s && (complexStruct.arr[1] == clonedComplexStruct.arr[1]));
        complexStruct.arr[1] += 1i;
        s = (s && !(complexStruct.arr[1] == clonedComplexStruct.arr[1]));
        var complexArray = array<SimpleStruct_10, 3>(SimpleStruct_10(vec2f(7, 8)), SimpleStruct_10(vec2f(9, 10)), SimpleStruct_10(vec2f(11, 12)));
        var clonedComplexArray = complexArray;
        s = (s && all(complexArray[2].vec == clonedComplexArray[2].vec));
        complexArray[2].vec[1] += 1f;
        s = (s && !all(complexArray[2].vec == clonedComplexArray[2].vec));
        var indirectClonedStruct = complexArray[0];
        s = (s && all(indirectClonedStruct.vec == complexArray[0].vec));
        var indirectlyClonedArray = complexStruct.arr;
        s = (s && (indirectlyClonedArray[0] == complexStruct.arr[0]));
        s = (s && (indirectlyClonedArray[1] == complexStruct.arr[1]));
        return s;
      }

      fn modifyNumFn_12(ptr: ptr<function, u32>) {
        *ptr += 1u;
      }

      fn modifyVecFn_13(ptr: ptr<function, vec2f>) {
        (*ptr).x += 1f;
      }

      struct SimpleStruct_14 {
        vec: vec2f,
      }

      fn modifyStructFn_15(ptr: ptr<function, SimpleStruct_14>) {
        (*ptr).vec.x += 1f;
      }

      var<private> privateNum_16: u32;

      fn modifyNumPrivate_17(ptr: ptr<private, u32>) {
        *ptr += 1u;
      }

      var<private> privateVec_18: vec2f;

      fn modifyVecPrivate_19(ptr: ptr<private, vec2f>) {
        (*ptr).x += 1f;
      }

      var<private> privateStruct_20: SimpleStruct_14;

      fn modifyStructPrivate_21(ptr: ptr<private, SimpleStruct_14>) {
        (*ptr).vec.x += 1f;
      }

      fn pointersTest_11() -> bool {
        var s = true;
        var num = 0u;
        modifyNumFn_12(&num);
        s = (s && (num == 1u));
        var vec = vec2f();
        modifyVecFn_13(&vec);
        s = (s && all(vec == vec2f(1, 0)));
        var myStruct = SimpleStruct_14();
        modifyStructFn_15(&myStruct);
        s = (s && all(myStruct.vec == vec2f(1, 0)));
        modifyNumPrivate_17(&privateNum_16);
        s = (s && (privateNum_16 == 1u));
        modifyVecPrivate_19(&privateVec_18);
        s = (s && all(privateVec_18 == vec2f(1, 0)));
        modifyStructPrivate_21(&privateStruct_20);
        s = (s && all(privateStruct_20.vec == vec2f(1, 0)));
        return s;
      }

      @group(0) @binding(0) var<storage, read_write> result_22: i32;

      @compute @workgroup_size(1) fn computeRunTests_0() {
        var s = true;
        s = (s && logicalExpressionTests_1());
        s = (s && matrixOpsTests_5());
        s = (s && infixOperatorsTests_6());
        s = (s && arrayAndStructConstructorsTest_8());
        s = (s && pointersTest_11());
        if (s) {
          result_22 = 1i;
        }
        else {
          result_22 = 0i;
        }
      }"
    `);
  });
});
