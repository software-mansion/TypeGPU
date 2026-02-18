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
      "fn negate(input: vec3<bool>) -> vec3<bool> {
        return vec3<bool>(!input.x, !input.y, !input.z);
      }

      struct Schema {
        vec2b: vec2<bool>,
        vec4b: vec4<bool>,
        vec3b: vec3<bool>,
        bool: bool,
      }

      fn negateStruct(input: Schema) -> Schema {
        var result = Schema(!(input.vec2b), !(input.vec4b), !(input.vec3b), !input.bool);
        return result;
      }

      fn logicalExpressionTests() -> bool {
        var s = true;
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && !false);
        s = (s && true);
        s = (s && !false);
        s = (s && true);
        s = (s && !false);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && !false);
        s = (s && true);
        s = (s && !false);
        s = (s && true);
        s = (s && true);
        var vec = vec3<bool>(true, false, true);
        s = (s && all(!(vec) == negate(vec)));
        var inputStruct = Schema(vec2<bool>(false, true), vec4<bool>(false, true, false, true), vec3<bool>(true, true, false), true);
        var resultStruct = negateStruct(inputStruct);
        s = (s && all(!(inputStruct.vec2b) == resultStruct.vec2b));
        s = (s && all(!(inputStruct.vec4b) == resultStruct.vec4b));
        s = (s && all(!(inputStruct.vec3b) == resultStruct.vec3b));
        s = (s && (!inputStruct.bool == resultStruct.bool));
        return s;
      }

      fn matrixOpsTests() -> bool {
        var s = true;
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        return s;
      }

      fn getVec() -> vec3f {
        return vec3f(1, 2, 3);
      }

      fn infixOperatorsTests() -> bool {
        var s = true;
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && true);
        s = (s && all((getVec() * getVec()) == vec3f(1, 4, 9)));
        s = (s && true);
        s = (s && true);
        s = (s && true);
        return s;
      }

      struct ComplexStruct {
        arr: array<i32, 2>,
      }

      struct SimpleStruct {
        vec: vec2f,
      }

      fn arrayAndStructConstructorsTest() -> bool {
        var s = true;
        var defaultComplexStruct = ComplexStruct();
        s = (s && (2 == 2i));
        s = (s && (defaultComplexStruct.arr[0i] == 0i));
        s = (s && (defaultComplexStruct.arr[1i] == 0i));
        var defaultComplexArray = array<SimpleStruct, 3>();
        s = (s && (3 == 3i));
        s = (s && all(defaultComplexArray[0i].vec == vec2f()));
        s = (s && all(defaultComplexArray[1i].vec == vec2f()));
        s = (s && all(defaultComplexArray[2i].vec == vec2f()));
        var simpleStruct = SimpleStruct(vec2f(1, 2));
        var clonedSimpleStruct = simpleStruct;
        s = (s && all(simpleStruct.vec == clonedSimpleStruct.vec));
        simpleStruct.vec[1i] += 1f;
        s = (s && !all(simpleStruct.vec == clonedSimpleStruct.vec));
        var simpleArray = array<i32, 2>(3i, 4i);
        var clonedSimpleArray = simpleArray;
        s = (s && (simpleArray[0i] == clonedSimpleArray[0i]));
        s = (s && (simpleArray[1i] == clonedSimpleArray[1i]));
        simpleArray[1i] += 1i;
        s = (s && !(simpleArray[1i] == clonedSimpleArray[1i]));
        var complexStruct = ComplexStruct(array<i32, 2>(5i, 6i));
        var clonedComplexStruct = complexStruct;
        s = (s && (complexStruct.arr[0i] == clonedComplexStruct.arr[0i]));
        s = (s && (complexStruct.arr[1i] == clonedComplexStruct.arr[1i]));
        complexStruct.arr[1i] += 1i;
        s = (s && !(complexStruct.arr[1i] == clonedComplexStruct.arr[1i]));
        var complexArray = array<SimpleStruct, 3>(SimpleStruct(vec2f(7, 8)), SimpleStruct(vec2f(9, 10)), SimpleStruct(vec2f(11, 12)));
        var clonedComplexArray = complexArray;
        s = (s && all(complexArray[2i].vec == clonedComplexArray[2i].vec));
        complexArray[2i].vec[1i] += 1f;
        s = (s && !all(complexArray[2i].vec == clonedComplexArray[2i].vec));
        var indirectClonedStruct = complexArray[0i];
        s = (s && all(indirectClonedStruct.vec == complexArray[0i].vec));
        var indirectlyClonedArray = complexStruct.arr;
        s = (s && (indirectlyClonedArray[0i] == complexStruct.arr[0i]));
        s = (s && (indirectlyClonedArray[1i] == complexStruct.arr[1i]));
        return s;
      }

      fn modifyNumFn(ptr: ptr<function, u32>) {
        (*ptr) += 1u;
      }

      fn modifyVecFn(ptr: ptr<function, vec2f>) {
        (*ptr).x += 1f;
      }

      struct SimpleStruct_1 {
        vec: vec2f,
      }

      fn modifyStructFn(ptr: ptr<function, SimpleStruct_1>) {
        (*ptr).vec.x += 1f;
      }

      fn modifyVecPrivate(ptr: ptr<private, vec2f>) {
        (*ptr).x += 1f;
      }

      var<private> privateVec: vec2f;

      fn modifyStructPrivate(ptr: ptr<private, SimpleStruct_1>) {
        (*ptr).vec.x += 1f;
      }

      var<private> privateStruct: SimpleStruct_1;

      fn pointersTest() -> bool {
        var s = true;
        var num = 0u;
        modifyNumFn((&num));
        s = (s && (num == 1u));
        var vec = vec2f();
        modifyVecFn((&vec));
        s = (s && all(vec == vec2f(1, 0)));
        var myStruct = SimpleStruct_1();
        modifyStructFn((&myStruct));
        s = (s && all(myStruct.vec == vec2f(1, 0)));
        modifyVecPrivate((&privateVec));
        s = (s && all(privateVec == vec2f(1, 0)));
        modifyStructPrivate((&privateStruct));
        s = (s && all(privateStruct.vec == vec2f(1, 0)));
        return s;
      }

      @group(0) @binding(0) var<storage, read_write> result: i32;

      @compute @workgroup_size(1) fn computeRunTests() {
        var s = true;
        s = (s && logicalExpressionTests());
        s = (s && matrixOpsTests());
        s = (s && infixOperatorsTests());
        s = (s && arrayAndStructConstructorsTest());
        s = (s && pointersTest());
        if (s) {
          result = 1i;
        }
        else {
          result = 0i;
        }
      }"
    `);
  });
});
