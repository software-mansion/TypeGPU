import { tgpu, d, std } from 'typegpu';
import { test } from 'typegpu-testing-utility';
import { describe } from 'vitest';
import { expectSideEffects } from '../utils/parseResolved.ts';

const Boid = d.struct({ pos: d.vec3f });

// These are pure functions (they return constants), but for now we
// assume any user-defined function may have side-effects, so calling one
// yields a snippet with `possibleSideEffects: true`.
const impureVec = () => {
  'use gpu';
  return d.vec3f(6, 6, 6);
};
const impureInt = () => {
  'use gpu';
  return 666;
};
const impureMat = () => {
  'use gpu';
  return d.mat2x2f(6, 6, 6, 6);
};
const impureStruct = () => {
  'use gpu';
  return Boid();
};
const impureBool = () => {
  'use gpu';
  return true;
};

describe('code without side-effects', () => {
  test('numeric literals', () => {
    expectSideEffects(() => {
      'use gpu';
      return 1.7e308;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return 1;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return 1.5;
    }).toEqual(false);
  });

  test('slot-bound scalar values', () => {
    const returnSlot = tgpu.slot();
    const fn = tgpu.fn(() => {
      'use gpu';
      return returnSlot.$;
    });

    expectSideEffects(fn.with(returnSlot, 0)).toEqual(false);
    expectSideEffects(fn.with(returnSlot, false)).toEqual(false);
    expectSideEffects(fn.with(returnSlot, d.vec3f())).toEqual(false);
    expectSideEffects(fn.with(returnSlot, d.mat2x2f())).toEqual(false);
    expectSideEffects(fn.with(returnSlot, Boid())).toEqual(false);
  });

  test('buffer usage reads', ({ root }) => {
    const uniform = root.createUniform(d.f32);
    const readonly = root.createReadonly(d.f32);
    const mutable = root.createMutable(d.f32);

    const buffer = root.createBuffer(d.f32).$usage('storage').as('mutable');

    tgpu.resolve([buffer]);

    expectSideEffects(() => {
      'use gpu';
      return uniform.$;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return readonly.$;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return mutable.$;
    }).toEqual(false);
  });

  test('bound buffer reads', () => {
    const layout = tgpu.bindGroupLayout({
      uniform: { uniform: d.f32 },
      readonly: { storage: d.f32, access: 'readonly' },
      mutable: { storage: d.f32, access: 'mutable' },
    });

    expectSideEffects(() => {
      'use gpu';
      return layout.$.uniform;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return layout.$.readonly;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return layout.$.mutable;
    }).toEqual(false);
  });

  test('tgpu.const read', () => {
    const c = tgpu.const(d.u32, 42);
    expectSideEffects(() => {
      'use gpu';
      return c.$;
    }).toEqual(false);
  });

  test('vectors created from literals', () => {
    expectSideEffects(() => {
      'use gpu';
      return d.vec3f();
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return d.vec3f(1, 2, 3);
    }).toEqual(false);
  });

  test('sampler access', ({ root }) => {
    const layout = tgpu.bindGroupLayout({
      s: { sampler: 'filtering' },
    });
    const s = root.createSampler({});

    expectSideEffects(() => {
      'use gpu';
      return s.$;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return layout.$.s;
    }).toEqual(false);
  });

  test('buffer read from accessor', ({ root }) => {
    const Boid = d.struct({ pos: d.vec3f });
    const buffer = root.createUniform(Boid);
    const accessor = tgpu.accessor(d.f32, () => buffer.$.pos.y);

    expectSideEffects(() => {
      'use gpu';
      return accessor.$;
    }).toEqual(false);
  });

  test('pure function access from accessor', () => {
    const accessor = tgpu.accessor(d.bool, std.subgroupElect);

    expectSideEffects(() => {
      'use gpu';
      return accessor.$;
    }).toEqual(false);
  });

  test('external texture access', () => {
    const layout = tgpu.bindGroupLayout({
      tex: { externalTexture: d.textureExternal() },
    });

    expectSideEffects(() => {
      'use gpu';
      return layout.$.tex;
    }).toEqual(false);
  });

  test('fixed texture access', ({ root }) => {
    const texture = root
      .createTexture({
        size: [256, 256],
        format: 'rgba8unorm',
      })
      .$usage('sampled');

    const sampledView = texture.createView();

    expectSideEffects(() => {
      'use gpu';
      return sampledView.$;
    }).toEqual(false);
  });

  test('bound texture access', () => {
    const layout = tgpu.bindGroupLayout({
      tex: { texture: d.texture2d() },
    });

    expectSideEffects(() => {
      'use gpu';
      return layout.$.tex;
    }).toEqual(false);
  });

  test('unroll over pure array', () => {
    expectSideEffects(() => {
      'use gpu';
      return tgpu.unroll([1, 2, 3]);
    }).toEqual(false);
  });

  test('workgroup and private var reads', () => {
    const w = tgpu.workgroupVar(d.u32);
    const p = tgpu.privateVar(d.u32, 2);

    expectSideEffects(() => {
      'use gpu';
      return [w.$, p.$]; // all of the elements of array need to be pure
    }).toEqual(false);
  });

  test('creating ref of pure value', () => {
    expectSideEffects(() => {
      'use gpu';
      return d.ref(d.vec3f());
    }).toEqual(false);
  });

  test('creating ref from implicit pointer of pure value', () => {
    expectSideEffects(() => {
      'use gpu';
      const v = d.vec3f();
      return d.ref(v);
    }).toEqual(false);
  });

  test('creating ref from implicit pointer of impure value', () => {
    expectSideEffects(() => {
      'use gpu';
      const v = impureVec();
      return d.ref(v);
    }).toEqual(false);
  });

  test('variables', () => {
    expectSideEffects(() => {
      'use gpu';
      const hello = 1;
      return hello;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      const hello = [1, 2, 3];
      return hello;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      const hello = impureInt();
      return hello;
    }).toEqual(false);
  });

  test('indexed array', () => {
    expectSideEffects(() => {
      'use gpu';
      const hello = [1, 2, 3];
      return hello[0];
    }).toEqual(false);
  });

  test('indexed vector', () => {
    expectSideEffects(() => {
      'use gpu';
      const v = d.vec3f();
      return v[0];
    }).toEqual(false);
  });

  test('indexed matrix column', () => {
    expectSideEffects(() => {
      'use gpu';
      const m = d.mat2x2f();
      return m.columns[0];
    }).toEqual(false);
  });

  test('vector created from indexed array', () => {
    expectSideEffects(() => {
      'use gpu';
      const arr = [1, 2, 3];
      return d.vec3f(arr[0]!);
    }).toEqual(false);
  });

  test('vector swizzle of pure value', () => {
    expectSideEffects(() => {
      'use gpu';
      return d.vec3f(1, 2, 3).xy;
    }).toEqual(false);
  });

  test('vector from accessor', () => {
    const v = tgpu.accessor(d.vec3f, d.vec3f());
    expectSideEffects(() => {
      'use gpu';
      return v.$;
    }).toEqual(false);
  });

  test('prop access', () => {
    expectSideEffects(() => {
      'use gpu';
      const foo = Boid();
      return foo.pos;
    }).toEqual(false);
  });

  test('vector kind property', () => {
    expectSideEffects(() => {
      'use gpu';
      return d.vec3f().kind;
    }).toEqual(false);
  });

  test('same-type conversion with pure value', () => {
    expectSideEffects(() => {
      'use gpu';
      const v = d.u32();
      return d.u32(v);
    }).toEqual(false);
  });

  test('snippet with the UnknownData datatype conversion', () => {
    const boidSlot = tgpu.slot(Boid());

    expectSideEffects(
      tgpu.fn(
        [],
        Boid,
      )(() => {
        'use gpu';
        return boidSlot.$;
      }),
    ).toEqual(false);
  });

  test('logical not of pure value', () => {
    const flag = false;
    expectSideEffects(() => {
      'use gpu';
      return !flag;
    }).toEqual(false);
  });

  test('deref of ref wrapping impure value', () => {
    expectSideEffects(() => {
      'use gpu';
      const v = d.ref(impureVec());
      return v.$;
    }).toEqual(false);
  });

  test('boolean literal', () => {
    expectSideEffects(() => {
      'use gpu';
      return false;
    }).toEqual(false);
  });

  test('comptime equality comparison', () => {
    expectSideEffects(() => {
      'use gpu';
      return std.getTargetShaderLanguage() === 'wgsl';
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return std.getTargetShaderLanguage() !== 'wgsl';
    }).toEqual(false);
  });

  test('logical short-circuit with comptime folding', () => {
    const flag = true;
    expectSideEffects(() => {
      'use gpu';
      return !std.isBeingTranspiled() || flag;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return std.isBeingTranspiled() || impureBool();
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return !std.isBeingTranspiled() && impureBool();
    }).toEqual(false);
  });

  test('logical short-circuit with pure rhs', () => {
    expectSideEffects(() => {
      'use gpu';
      const flag = true;
      return !std.isBeingTranspiled() || flag;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      const flag = true;
      return std.isBeingTranspiled() && flag;
    }).toEqual(false);
  });

  test('comptime-folded comparison', () => {
    const x = 1;
    expectSideEffects(() => {
      'use gpu';
      return x > 0;
    }).toEqual(false);
  });

  test('binary comparison of pure values', () => {
    const x = 1;
    expectSideEffects(() => {
      'use gpu';
      const y = impureInt();
      return x > y;
    }).toEqual(false);
  });

  test('comptime-folded dualImpl call', () => {
    expectSideEffects(() => {
      'use gpu';
      return 1 + 1;
    }).toEqual(false);
  });

  test('unary expression with pure value', () => {
    expectSideEffects(() => {
      'use gpu';
      return ~5;
    }).toEqual(false);
  });

  test('struct constructor with no args', () => {
    expectSideEffects(() => {
      'use gpu';
      return Boid();
    }).toEqual(false);
  });

  test('struct copy from pure source', () => {
    expectSideEffects(() => {
      'use gpu';
      const src = Boid();
      return Boid(src);
    }).toEqual(false);
  });

  test('comptime ternary', () => {
    expectSideEffects(() => {
      'use gpu';
      return true ? 1 : 2;
    }).toEqual(false);
  });

  test('runtime ternary with pure condition', () => {
    expectSideEffects(() => {
      'use gpu';
      const flag = false;
      return flag ? 1 : 2;
    }).toEqual(false);
  });

  test('logical not of impure value of complex datatype', () => {
    expectSideEffects(() => {
      'use gpu';
      return !impureStruct();
    }).toEqual(false);
  });
});

describe('code with side-effects', () => {
  test('vector constructor with impure components', () => {
    expectSideEffects(() => {
      'use gpu';
      return d.vec3f(impureInt());
    }).toEqual(true);
  });

  test('impure accessor call', () => {
    const accessor = tgpu.accessor(d.f32, impureInt);
    expectSideEffects(() => {
      'use gpu';
      return accessor.$;
    }).toEqual(true);
  });

  test('unroll over array with impure element', () => {
    expectSideEffects(() => {
      'use gpu';
      return tgpu.unroll([1, impureInt(), 3]);
    }).toEqual(true);
  });

  test('creating ref of impure value', () => {
    expectSideEffects(() => {
      'use gpu';
      return d.ref(impureVec());
    }).toEqual(true);
  });

  test('matrix column access on impure matrix', () => {
    expectSideEffects(() => {
      'use gpu';
      return impureMat().columns[0];
    }).toEqual(true);
  });

  test('matrix column access with impure index', () => {
    expectSideEffects(() => {
      'use gpu';
      const m = d.mat2x2f();
      return m.columns[impureInt()];
    }).toEqual(true);
  });

  test('prop access on impure struct', () => {
    expectSideEffects(() => {
      'use gpu';
      return impureStruct().pos;
    }).toEqual(true);
  });

  test('same-type conversion with impure value', () => {
    expectSideEffects(() => {
      'use gpu';
      return d.u32(impureInt());
    }).toEqual(true);
  });

  test('logical not of impure value', () => {
    expectSideEffects(() => {
      'use gpu';
      return !impureInt();
    }).toEqual(true);
  });

  test('logical short-circuit with impure rhs', () => {
    expectSideEffects(() => {
      'use gpu';
      return !std.isBeingTranspiled() || impureBool();
    }).toEqual(true);

    expectSideEffects(() => {
      'use gpu';
      return std.isBeingTranspiled() && impureBool();
    }).toEqual(true);
  });

  test('binary comparison with impure rhs', () => {
    expectSideEffects(() => {
      'use gpu';
      const y = impureInt();
      return y > impureInt();
    }).toEqual(true);
  });

  test('unary expression of impure value', () => {
    expectSideEffects(() => {
      'use gpu';
      return ~impureInt();
    }).toEqual(true);
  });

  test('struct copy from impure source', () => {
    expectSideEffects(() => {
      'use gpu';
      return Boid(impureStruct());
    }).toEqual(true);
  });

  test('coercion of an object with an impure field to the struct type', () => {
    expectSideEffects(
      tgpu.fn(
        [],
        Boid,
      )(() => {
        return { pos: impureVec() };
      }),
    ).toEqual(true);
  });

  test('vector swizzle of impure value', () => {
    expectSideEffects(() => {
      'use gpu';
      return d.vec3f(impureVec()).xy;
    }).toEqual(true);
  });

  test('runtime ternary with impure condition', () => {
    expectSideEffects(() => {
      'use gpu';
      return impureBool() ? 1 : 2;
    }).toEqual(true);
  });

  test('array index with impure index', () => {
    const Arr = d.arrayOf(d.f32, 3);
    const arr = tgpu.accessor(Arr, Arr([1, 2, 3]));
    expectSideEffects(() => {
      'use gpu';
      return arr.$[impureInt()];
    }).toEqual(true);
  });
});
