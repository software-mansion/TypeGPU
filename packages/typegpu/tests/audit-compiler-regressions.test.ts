import { expect, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';
import { it as gpuIt } from 'typegpu-testing-utility';

// Shader assertions inspect generated WGSL; the GPU fixture uses the project mocks.
it('B24: compound assignment evaluates its index once on the CPU', () => {
  let calls = 0;
  const next = tgpu.comptime(() => calls++);
  const values = [1, 2, 3];
  const run = () => {
    'use gpu';
    values[next()]! += 10;
  };

  run();

  expect(calls).toBe(1);
  expect(values).toEqual([11, 2, 3]);
});

it('B25: for-of selects its iterable once before entering the loop', () => {
  const cursor = tgpu.privateVar(d.u32, 0);
  const next = tgpu
    .fn(
      [],
      d.u32,
    )(() => {
      'use gpu';
      const old = cursor.$;
      cursor.$ += 1;
      return old;
    })
    .$name('next');
  const main = tgpu
    .fn(
      [],
      d.f32,
    )(() => {
      'use gpu';
      const arrays = d.arrayOf(
        d.arrayOf(d.f32, 2),
        2,
      )([
        [1, 2],
        [10, 20],
      ]);
      let total = d.f32(0);
      for (const value of arrays[next()]!) {
        total += value;
      }
      return total;
    })
    .$name('main');

  const code = tgpu.resolve([main]);
  const body = code.slice(code.indexOf('fn main('));
  const loopStart = body.indexOf('for (');
  expect(loopStart).toBeGreaterThan(0);
  expect(body.slice(0, loopStart)).toMatch(/next\(\)/);
  expect(body.match(/next\(\)/g)).toHaveLength(1);
});

it('B26: shellless texture overloads distinguish float and integer samples', () => {
  const layout = tgpu.bindGroupLayout({
    floats: { texture: d.texture2d(d.f32) },
    ints: { texture: d.texture2d(d.i32) },
  });
  const load = (texture: d.texture2d<d.F32> | d.texture2d<d.I32>) => {
    'use gpu';
    return std.textureLoad(texture, d.vec2i(0), 0);
  };
  const main = () => {
    'use gpu';
    const a = load(layout.$.floats);
    const b = load(layout.$.ints);
    return d.vec4f(a) + d.vec4f(b);
  };

  const code = tgpu.resolve([main]);
  expect(code).toMatch(/fn load\w*\(texture: texture_2d<f32>\) -> vec4f/);
  expect(code).toMatch(/fn load\w*\(texture: texture_2d<i32>\) -> vec4i/);
});

it('B27: struct construction evaluates properties in source order', () => {
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
  const Pair = d.struct({ first: d.u32, second: d.u32 });
  const main = () => {
    'use gpu';
    return Pair({ second: take(1), first: take(10) });
  };

  const code = tgpu.resolve([main]);
  const argumentsInEvaluationOrder = [...code.matchAll(/take\((\d+)u?\)/g)].map((match) =>
    Number(match[1]),
  );
  expect(argumentsInEvaluationOrder).toEqual([1, 10]);
});

it('B27: structural return preserves effects of an extra property', () => {
  const cursor = tgpu.privateVar(d.u32, 0);
  const increment = tgpu
    .fn(
      [],
      d.u32,
    )(() => {
      'use gpu';
      cursor.$ += 1;
      return cursor.$;
    })
    .$name('increment');
  const Struct = d.struct({ a: d.u32 });
  const create = tgpu.fn(
    [],
    Struct,
  )(() => {
    'use gpu';
    return { a: 1, ignored: increment() };
  });
  const main = () => {
    'use gpu';
    create();
    return cursor.$;
  };

  // One declaration and one invocation: dropping the field must not drop its effect.
  expect(tgpu.resolve([main]).match(/increment\(\)/g)).toHaveLength(2);
});

it('B28: accessor validates the GPU callback schema before emitting shader code', () => {
  const mismatch = tgpu.accessor(d.f32, () => {
    'use gpu';
    return 1;
  });
  const readMismatch = tgpu.fn(
    [],
    d.f32,
  )(() => {
    'use gpu';
    return mismatch.$;
  });
  // A shellless GPU callback infers i32 here. Current accessors require exact
  // concrete schema agreement, and must reject this before producing invalid WGSL.
  expect(() => tgpu.resolve([readMismatch])).toThrow(/Value of type 'i32'.*schema.*'f32'/);

  const value = tgpu.accessor(d.f32, () => {
    'use gpu';
    return d.f32(1);
  });
  const main = tgpu.fn(
    [],
    d.f32,
  )(() => {
    'use gpu';
    return value.$;
  });

  const code = tgpu.resolve([main]);
  expect(code).toMatch(/fn value\w*\(\) -> f32\s*\{/);
});

it('B64: indexing an array literal retains effects of every element', () => {
  const state = tgpu.privateVar(d.i32, 0);
  const take = tgpu
    .fn(
      [d.i32],
      d.i32,
    )((n) => {
      'use gpu';
      state.$ += n;
      return state.$;
    })
    .$name('take');
  const main = tgpu.fn(
    [],
    d.i32,
  )(() => {
    'use gpu';
    const chosen = [take(1), take(10)][0]!;
    return chosen + state.$;
  });

  const code = tgpu.resolve([main]);
  expect([...code.matchAll(/take\((\d+)i?\)/g)].map((match) => Number(match[1]))).toEqual([1, 10]);
});

it('B64: reading array length retains effects of the array producer', () => {
  const state = tgpu.privateVar(d.i32, 0);
  const make = tgpu
    .fn(
      [],
      d.arrayOf(d.i32, 2),
    )(() => {
      'use gpu';
      state.$ += 1;
      return [1, 2];
    })
    .$name('make');
  const main = tgpu.fn(
    [],
    d.i32,
  )(() => {
    'use gpu';
    return make().length + state.$;
  });

  expect(tgpu.resolve([main]).match(/make\(\)/g)).toHaveLength(2);
});

it('B65: copying an array to an integer schema converts each element', () => {
  const Floats = d.arrayOf(d.f32, 2);
  const Ints = d.arrayOf(d.i32, 2);
  expect(Ints(Floats([1.5, 2.5]))).toEqual([1, 2]);
  const main = tgpu.fn(
    [],
    d.i32,
  )(() => {
    'use gpu';
    const values = Floats([1.5, 2.5]);
    const converted = Ints(values);
    return converted[0]!;
  });

  const code = tgpu.resolve([main]);
  expect(code).toMatch(/array<i32, 2>\(i32\(values\[0i?\]\), i32\(values\[1i?\]\)\)/);
});

gpuIt('B66: inferred vertex output uses the explicit fragment input location', ({ root }) => {
  const fragment = tgpu.fragmentFn({
    in: { color: d.location(5, d.vec4f) },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    return input.color;
  });
  const pipeline = root.createRenderPipeline({
    vertex: () => {
      'use gpu';
      return { $position: d.vec4f(0, 0, 0, 1), color: d.vec4f(1) };
    },
    fragment,
    targets: { format: 'rgba8unorm' },
  });

  expect(tgpu.resolve([pipeline]).match(/@location\(5\) color/g)).toHaveLength(2);
});

it('B68: negative integer return wraps to a representable unsigned literal', () => {
  const main = tgpu.fn(
    [],
    d.u32,
  )(() => {
    'use gpu';
    return -1;
  });

  expect(main()).toBe(4294967295);
  expect(tgpu.resolve([main])).toMatch(/return (?:4294967295u|u32\(-1i?\));/);
});
