import { describe, expect } from 'vitest';
import tgpu, {
  d,
  std,
  type TgpuAccessor,
  type TgpuFixedSampler,
  type TgpuSlot,
  type TgpuTextureView,
  type TgpuUniform,
} from '../../src/index.js';
import { it } from '../utils/extendedIt.ts';

describe('shellless', () => {
  it('is callable from shelled function', () => {
    const dot2 = (a: d.v2f) => {
      'use gpu';
      return std.dot(a, a);
    };

    const foo = () => {
      'use gpu';
      return dot2(d.vec2f(1, 2)) + dot2(d.vec2f(3, 4));
    };

    const main = tgpu.fn([], d.f32)(() => {
      return foo();
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn dot2(a: vec2f) -> f32 {
        return dot(a, a);
      }

      fn foo() -> f32 {
        return (dot2(vec2f(1, 2)) + dot2(vec2f(3, 4)));
      }

      fn main() -> f32 {
        return foo();
      }"
    `);
  });

  it('is generic based on arguments', () => {
    const dot2 = (a: d.v2f | d.v3f) => {
      'use gpu';
      return std.dot(a, a);
    };

    const foo = () => {
      'use gpu';
      return dot2(d.vec2f(1, 2)) + dot2(d.vec3f(3, 4, 5));
    };

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn dot2(a: vec2f) -> f32 {
        return dot(a, a);
      }

      fn dot2_1(a: vec3f) -> f32 {
        return dot(a, a);
      }

      fn foo() -> f32 {
        return (dot2(vec2f(1, 2)) + dot2_1(vec3f(3, 4, 5)));
      }"
    `);
  });

  it('handles fully abstract cases', () => {
    const someFn = (a: number, b: number) => {
      'use gpu';
      if (a > b) {
        return 12.2;
      }
      if (b > a) {
        return 2.2;
      }
      return 1;
    };

    const main = tgpu.fn(
      [],
      d.f32,
    )(() => {
      const x = someFn(1, 2);
      return x;
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn someFn(a: i32, b: i32) -> f32 {
        if ((a > b)) {
          return 12.2;
        }
        if ((b > a)) {
          return 2.2;
        }
        return 1;
      }

      fn main() -> f32 {
        let x = someFn(1i, 2i);
        return x;
      }"
    `);
  });

  it('throws when no single return type can be achieved', () => {
    const someFn = (a: number, b: number) => {
      'use gpu';
      if (a > b) {
        return d.u32(12);
      }
      if (b > a) {
        return d.i32(2);
      }
      return a + b;
    };

    const main = tgpu.fn(
      [],
      d.f32,
    )(() => {
      const x = someFn(1.1, 2);
      return x;
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main
      - fn*:someFn(f32, i32): Expected function to have a single return type, got [u32, i32, f32]. Cast explicitly to the desired type.]
    `);
  });

  it('handles nested shellless', () => {
    const fn1 = () => {
      'use gpu';
      return 4.1;
    };

    const fn2 = () => {
      'use gpu';
      return fn1();
    };

    const main = tgpu.fn([], d.f32)(() => {
      return fn2();
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn fn1() -> f32 {
        return 4.1;
      }

      fn fn2() -> f32 {
        return fn1();
      }

      fn main() -> f32 {
        return fn2();
      }"
    `);
  });

  it('handles refs and generates pointer arguments for them', () => {
    const advance = (pos: d.ref<d.v3f>, vel: d.v3f) => {
      'use gpu';
      pos.$.x += vel.x;
      pos.$.y += vel.y;
      pos.$.z += vel.z;
    };

    const main = () => {
      'use gpu';
      const pos = d.ref(d.vec3f(0, 0, 0));
      advance(pos, d.vec3f(1, 2, 3));
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn advance(pos: ptr<function, vec3f>, vel: vec3f) {
        (*pos).x += vel.x;
        (*pos).y += vel.y;
        (*pos).z += vel.z;
      }

      fn main() {
        var pos = vec3f();
        advance((&pos), vec3f(1, 2, 3));
      }"
    `);
  });

  it('generates private pointer params when passing a private variable ref to a function', ({ root }) => {
    const foo = tgpu.privateVar(d.vec3f);

    const sumComponents = (vec: d.ref<d.v3f>) => {
      'use gpu';
      return vec.$.x + vec.$.y + vec.$.z;
    };

    const main = () => {
      'use gpu';
      sumComponents(d.ref(foo.$));
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn sumComponents(vec: ptr<private, vec3f>) -> f32 {
        return (((*vec).x + (*vec).y) + (*vec).z);
      }

      var<private> foo: vec3f;

      fn main() {
        sumComponents((&foo));
      }"
    `);
  });

  it('generates uniform pointer params when passing a fixed uniform ref to a function', ({ root }) => {
    const posUniform = root.createUniform(d.vec3f);

    const sumComponents = (vec: d.ref<d.v3f>) => {
      'use gpu';
      return vec.$.x + vec.$.y + vec.$.z;
    };

    const main = () => {
      'use gpu';
      sumComponents(d.ref(posUniform.$));
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn sumComponents(vec: ptr<uniform, vec3f>) -> f32 {
        return (((*vec).x + (*vec).y) + (*vec).z);
      }

      @group(0) @binding(0) var<uniform> posUniform: vec3f;

      fn main() {
        sumComponents((&posUniform));
      }"
    `);
  });

  it('resolves when accepting no arguments', () => {
    const main = () => {
      'use gpu';
      return 4.1;
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> f32 {
        return 4.1;
      }"
    `);
  });

  it('throws error when resolving function that expects arguments', () => {
    const main = (a: number) => {
      'use gpu';
      return a + 1;
    };

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:main: Cannot resolve 'main' directly, because it expects arguments. Either call it from another function, or wrap it in a shell]
    `);
  });

  it('should cache shellless implementations in namespace', () => {
    const foo = () => {
      'use gpu';
      return 4.1;
    };

    const bar = () => {
      'use gpu';
      return 4.2 * foo();
    };

    const names = tgpu['~unstable'].namespace({ names: 'strict' });

    expect(tgpu.resolve([foo], { names })).toMatchInlineSnapshot(`
      "fn foo() -> f32 {
        return 4.1;
      }"
    `);

    expect(tgpu.resolve([bar], { names })).toMatchInlineSnapshot(`
      "fn bar() -> f32 {
        return (4.2f * foo());
      }"
    `);
  });

  it('allows passing samplers in arguments', ({ root }) => {
    const mySampler = root.createSampler({});
    const fn = (sampler: d.sampler) => {
      'use gpu';
      return 0;
    };

    const main = tgpu.fn([])(() => {
      fn(mySampler.$);
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn fn_1(sampler_1: sampler) -> i32 {
        return 0;
      }

      @group(0) @binding(0) var mySampler: sampler;

      fn main() {
        fn_1(mySampler);
      }"
    `);
  });

  it('allows passing texture views in arguments', ({ root }) => {
    const myTexture = root.createTexture({
      format: 'rgba8unorm',
      size: [16, 16],
    }).$usage('sampled');
    const myView = myTexture.createView();
    const fn = (view: d.texture2d<d.F32>) => {
      'use gpu';
      return 0;
    };

    const main = tgpu.fn([])(() => {
      fn(myView.$);
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn fn_1(view: texture_2d<f32>) -> i32 {
        return 0;
      }

      @group(0) @binding(0) var myView: texture_2d<f32>;

      fn main() {
        fn_1(myView);
      }"
    `);
  });

  it('throws a descriptive error when an invalid argument is used', ({ root }) => {
    const myUniform = root.createUniform(d.u32);
    const fn = (uniform: TgpuUniform<d.U32>) => {
      'use gpu';
      return 0;
    };

    const main = tgpu.fn([])(() => {
      fn(myUniform);
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: Passed illegal value uniformBufferShorthand:myUniform as the #0 argument to fn(...)
      Shellless functions can only accept arguments representing WGSL resources: constructible WGSL types, d.refs, samplers or texture views.
      Remember, that arguments such as samplers, texture views, accessors, slots etc. should be dereferenced via '.$' first.]
    `);
  });

  it('throws a descriptive error when a texture argument is used', ({ root }) => {
    const myTexture = root.createTexture({
      format: 'rgba8unorm',
      size: [16, 16],
    }).$usage('sampled');
    const fn = (texture: typeof myTexture) => {
      'use gpu';
      return 0;
    };

    const main = tgpu.fn([])(() => {
      fn(myTexture);
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: Passed illegal value texture:myTexture as the #0 argument to fn(...)
      Shellless functions can only accept arguments representing WGSL resources: constructible WGSL types, d.refs, samplers or texture views.
      Remember, that arguments such as samplers, texture views, accessors, slots etc. should be dereferenced via '.$' first.]
    `);
  });

  it('throws a descriptive error when a slot argument is not dereferenced', () => {
    const mySlot = tgpu.slot<number>();
    const fn = (slot: TgpuSlot<number>) => {
      'use gpu';
      return 0;
    };

    const main = tgpu.fn([])(() => {
      fn(mySlot);
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: Passed illegal value slot:mySlot as the #0 argument to fn(...)
      Shellless functions can only accept arguments representing WGSL resources: constructible WGSL types, d.refs, samplers or texture views.
      Remember, that arguments such as samplers, texture views, accessors, slots etc. should be dereferenced via '.$' first.]
    `);
  });

  it('throws a descriptive error when a sampler argument is not dereferenced', ({ root }) => {
    const mySampler = root.createSampler({});
    const fn = (sampler: TgpuFixedSampler) => {
      'use gpu';
      return 0;
    };

    const main = tgpu.fn([])(() => {
      fn(mySampler);
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: Passed illegal value sampler:mySampler as the #0 argument to fn(...)
      Shellless functions can only accept arguments representing WGSL resources: constructible WGSL types, d.refs, samplers or texture views.
      Remember, that arguments such as samplers, texture views, accessors, slots etc. should be dereferenced via '.$' first.]
    `);
  });

  it('throws a descriptive error when a texture view argument is not dereferenced', ({ root }) => {
    const myTexture = root.createTexture({
      format: 'rgba8unorm',
      size: [16, 16],
    }).$usage('sampled');
    const myView = myTexture.createView();
    const fn = (view: TgpuTextureView<d.WgslTexture2d<d.F32>>) => {
      'use gpu';
      return 0;
    };

    const main = tgpu.fn([])(() => {
      fn(myView);
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: Passed illegal value textureView:myView as the #0 argument to fn(...)
      Shellless functions can only accept arguments representing WGSL resources: constructible WGSL types, d.refs, samplers or texture views.
      Remember, that arguments such as samplers, texture views, accessors, slots etc. should be dereferenced via '.$' first.]
    `);
  });

  it('throws a descriptive error when an accessor argument is not dereferenced', () => {
    const myAccess = tgpu.accessor(d.f32);
    const fn = (access: TgpuAccessor<d.F32>) => {
      'use gpu';
      return 0;
    };

    const main = tgpu.fn([])(() => {
      fn(myAccess);
    });

    expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:main: Passed illegal value accessor:myAccess as the #0 argument to fn(...)
      Shellless functions can only accept arguments representing WGSL resources: constructible WGSL types, d.refs, samplers or texture views.
      Remember, that arguments such as samplers, texture views, accessors, slots etc. should be dereferenced via '.$' first.]
    `);
  });
});
