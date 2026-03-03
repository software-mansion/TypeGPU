import { describe, expect, it } from 'vitest';
import {
  vec2b,
  vec2f,
  vec2i,
  vec3b,
  vec3f,
  vec3i,
  vec4b,
  vec4f,
  vec4i,
} from '../../../src/data/index.ts';
import { lt } from '../../../src/std/index.ts';

describe('lt', () => {
  it('compares integer vectors', () => {
    expect(lt(vec2i(1, -1), vec2i(0, 0))).toStrictEqual(vec2b(false, true));
    expect(lt(vec3i(10, 20, 20), vec3i(10, 20, 30))).toStrictEqual(vec3b(false, false, true));
    expect(lt(vec4i(1, 2, 3, 4), vec4i(4, 2, 3, 1))).toStrictEqual(
      vec4b(true, false, false, false),
    );
  });

  it('compares float vectors', () => {
    expect(lt(vec2f(0.1, 1.1), vec2f(0.1, 2))).toStrictEqual(vec2b(false, true));
    expect(lt(vec3f(1.2, 2.3, 3.4), vec3f(2.3, 3.2, 3.4))).toStrictEqual(vec3b(true, true, false));
    expect(lt(vec4f(0.1, -0.2, -0.3, 0.4), vec4f(0.1, 0.2, 0.3, 0.4))).toStrictEqual(
      vec4b(false, true, true, false),
    );
  });
});
