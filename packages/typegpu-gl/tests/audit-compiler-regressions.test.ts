import { expect, it, vi } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { dualGlOptions, glOptions, initWithGL } from '../src/index.ts';
import { it as glIt } from './utils/extendedTest.ts';

// These tests inspect generated GLSL, without invoking a real WebGL shader compiler.
it('B29: for-of range emits a GLSL integer loop declaration', () => {
  const main = () => {
    'use gpu';
    let total = 0;
    for (const value of std.range(3)) {
      total += value;
    }
    return total;
  };

  expect(tgpu.resolve([main], glOptions())).toMatch(/for\s*\(\s*u?int\s+\w+\s*=/);
});

it('B29: scalar ternary emits a GLSL conditional expression', () => {
  const main = tgpu.fn(
    [d.bool],
    d.f32,
  )((flag) => {
    'use gpu';
    return flag ? 1 : 0;
  });

  expect(tgpu.resolve([main], glOptions())).toMatch(/flag\s*\?\s*1(?:\.0)?\s*:\s*0(?:\.0)?/);
});

it('B30: resolving a GLSL alias evaluates a comptime selector once', () => {
  let calls = 0;
  const next = tgpu.comptime(() => calls++);
  const main = () => {
    'use gpu';
    const values = d.arrayOf(d.vec2f, 3)([d.vec2f(10), d.vec2f(20), d.vec2f(30)]);
    // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- Required by tsconfig.test.json's noUncheckedIndexedAccess; the selector stays in bounds.
    const value = values[next()]!;
    return value.x;
  };

  tgpu.resolve([main], glOptions());
  expect(calls).toBe(1);
});

it('B31: a vertex output constructor assigns the position builtin', () => {
  const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })((_, Out) => {
    'use gpu';
    return Out({ pos: d.vec4f(1) });
  });

  expect(tgpu.resolve([vertex], dualGlOptions().vertex)).toMatch(/gl_Position\s*=/);
});

it('B31: a scalar vertex output literal receives its declared float type', () => {
  const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position, alpha: d.f32 } })(() => {
    'use gpu';
    return { pos: d.vec4f(1), alpha: 0.5 };
  });

  const code = tgpu.resolve([vertex], dualGlOptions().vertex);
  expect(code).toMatch(/out float \w*alpha\w*;/);
  expect(code).toMatch(/\w*alpha\w*\s*=\s*0\.5;/);
});

it('B32: fragment outputs use separate locations and the depth builtin', () => {
  const fragment = tgpu.fragmentFn({
    out: { color: d.vec4f, normal: d.vec4f, depth: d.builtin.fragDepth },
  })(() => {
    'use gpu';
    return { color: d.vec4f(1), normal: d.vec4f(2), depth: d.f32(0.5) };
  });

  const code = tgpu.resolve([fragment], dualGlOptions().fragment);
  expect(code).toMatch(/layout\(location\s*=\s*0\) out vec4 \w*color\w*;/);
  expect(code).toMatch(/layout\(location\s*=\s*1\) out vec4 \w*normal\w*;/);
  expect(code).toMatch(/gl_FragDepth\s*=\s*0\.5;/);
});

it('B32: integer stage varyings use flat interpolation on both stages', () => {
  const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position, number: d.u32 } })(() => {
    'use gpu';
    return { pos: d.vec4f(1), number: d.u32(2) };
  });
  const fragment = tgpu.fragmentFn({ in: { number: d.u32 }, out: d.vec4f })((input) => {
    'use gpu';
    return d.vec4f(input.number);
  });
  const options = dualGlOptions();

  expect(tgpu.resolve([vertex, fragment], options.vertex)).toMatch(/flat out uint \w*number\w*;/);
  expect(tgpu.resolve([vertex, fragment], options.fragment)).toMatch(/flat in uint \w*number\w*;/);
});

it('B33: an array function parameter retains its extent', () => {
  const Values = d.arrayOf(d.f32, 3);
  const first = tgpu
    .fn(
      [Values],
      d.f32,
    )((values) => {
      'use gpu';
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- Required by tsconfig.test.json's noUncheckedIndexedAccess for this known in-bounds index.
      return values[0]!;
    })
    .$name('first');

  expect(tgpu.resolve([first], glOptions())).toMatch(/float first\(float values\[3\]\)/);
});

it('B33: an array function return type retains its extent', () => {
  const Values = d.arrayOf(d.f32, 3);
  const make = tgpu
    .fn(
      [],
      Values,
    )(() => {
      'use gpu';
      return Values([1, 2, 3]);
    })
    .$name('make');

  expect(tgpu.resolve([make], glOptions())).toMatch(/float\[3\] make\(\)/);
});

it('B34: scalar select evaluates both effectful values before selecting', () => {
  const cursor = tgpu.privateVar(d.u32, 0);
  const take = tgpu
    .fn(
      [d.u32],
      d.u32,
    )((n) => {
      'use gpu';
      cursor.$ += n;
      return cursor.$;
    })
    .$name('take');
  const main = tgpu.fn(
    [d.bool],
    d.u32,
  )((flag) => {
    'use gpu';
    const value = std.select(take(1), take(10), flag);
    return value + cursor.$;
  });

  const code = tgpu.resolve([main], glOptions());
  // GLSL ?: is lazy. Materialize both effectful arguments before using it.
  expect(code).toMatch(/uint \w+\s*=\s*take\(1u\);/);
  expect(code).toMatch(/uint \w+\s*=\s*take\(10u\);/);
});

it('B35: an empty GLSL function still has a complete body', () => {
  const empty = () => {
    'use gpu';
  };

  expect(tgpu.resolve([empty], glOptions())).toMatch(/void empty\(\)\s*\{\s*\}/);
});

glIt('B69: textureLoad evaluates its coordinate producer once', ({ gl }) => {
  const root = initWithGL({ gl });
  const view = root
    .createTexture({ size: [4, 4], format: 'rgba8unorm' })
    .$usage('sampled')
    .createView()
    .$name('source');
  const count = tgpu.privateVar(d.i32, 0);
  const nextCoords = tgpu
    .fn(
      [],
      d.vec2i,
    )(() => {
      'use gpu';
      count.$ += 1;
      return d.vec2i(count.$);
    })
    .$name('nextCoords');
  const pipeline = root.createRenderPipeline({
    vertex: () => {
      'use gpu';
      return { $position: d.vec4f(0, 0, 0, 1) };
    },
    fragment: () => {
      'use gpu';
      return std.textureLoad(view.$, nextCoords(), 0);
    },
  });

  pipeline.draw(3);

  const fragmentCode = vi.mocked(gl.shaderSource).mock.calls.at(-1)?.[1] ?? '';
  // One declaration plus one invocation, regardless of orientation handling.
  expect(fragmentCode.match(/nextCoords\(\)/g)).toHaveLength(2);
});
