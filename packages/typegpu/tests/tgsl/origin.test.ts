import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import tgpu, { d } from '../../src/index.js';
import { extractSnippetFromFn } from '../utils/parseResolved.ts';

const implicitFnPtr = (type: d.StorableData) => {
  const ptr = d.ptrFn(type);
  // @ts-expect-error
  ptr.implicit = true;
  return ptr;
};

const implicitUniformPtr = (type: d.StorableData) => {
  const ptr = d.ptrUniform(type);
  // @ts-expect-error
  ptr.implicit = true;
  return ptr;
};

const implicitReadonlyPtr = (type: d.StorableData) => {
  const ptr = d.ptrStorage(type);
  // @ts-expect-error
  ptr.implicit = true;
  return ptr;
};

const implicitMutablePtr = (type: d.StorableData) => {
  const ptr = d.ptrStorage(type, 'read-write');
  // @ts-expect-error
  ptr.implicit = true;
  return ptr;
};

const implicitPrivatePtr = (type: d.StorableData) => {
  const ptr = d.ptrPrivate(type);
  // @ts-expect-error
  ptr.implicit = true;
  return ptr;
};

const implicitWorkgroupPtr = (type: d.StorableData) => {
  const ptr = d.ptrWorkgroup(type);
  // @ts-expect-error
  ptr.implicit = true;
  return ptr;
};

describe('origin tracking', () => {
  describe('basic', () => {
    it('i32 has constant origin', () => {
      const f = () => {
        'use gpu';
        return d.i32(1);
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.i32);
      expect(snippet.origin).toBe('constant');
    });

    it('i32 assignment has constant origin', () => {
      const f = () => {
        'use gpu';
        const b = 1;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.i32);
      expect(snippet.origin).toBe('constant');
    });

    it('i32 argument has argument origin', () => {
      const f = tgpu.fn([d.i32])((a) => {
        return a;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.i32);
      expect(snippet.origin).toBe('argument');
    });

    it('i32 argument assignment has runtime origin', () => {
      const f = tgpu.fn([d.i32])((a) => {
        const b = a;
        return b;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.i32);
      expect(snippet.origin).toBe('runtime');
    });

    it('i32 return from function has runtime origin', () => {
      const getOne = tgpu.fn(
        [],
        d.i32,
      )(() => {
        'use gpu';
        return 1;
      });

      const f = () => {
        'use gpu';
        return getOne();
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.i32);
      expect(snippet.origin).toBe('runtime');
    });

    it('i32 return from function assignment has runtime origin', () => {
      const getOne = tgpu.fn(
        [],
        d.i32,
      )(() => {
        'use gpu';
        return 1;
      });

      const f = () => {
        'use gpu';
        const b = getOne();
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.i32);
      expect(snippet.origin).toBe('runtime');
    });

    it('vec2i has constant origin', () => {
      const f = () => {
        'use gpu';
        return d.vec2i(7);
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2i);
      expect(snippet.origin).toBe('constant');
    });

    it('vec2i assignment has this-function origin', () => {
      const f = () => {
        'use gpu';
        const a = d.vec2i(7);
        return a;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2i);
      expect(snippet.origin).toBe('this-function');
    });

    it('vec2i double assignment has this-function origin', () => {
      const f = () => {
        'use gpu';
        const a = d.vec2i(7);
        const b = a;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(implicitFnPtr(d.vec2i));
      expect(snippet.origin).toBe('this-function');
    });

    it('vec2i argument has argument origin', () => {
      const f = tgpu.fn([d.vec2i])((a) => {
        return a;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2i);
      expect(snippet.origin).toBe('argument');
    });

    it('vec2i argument assignment has argument origin', () => {
      const f = tgpu.fn([d.vec2i])((a) => {
        const b = a;
        return b;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2i);
      expect(snippet.origin).toBe('argument');
    });

    it('vec2i argument component has argument origin', () => {
      const f = tgpu.fn([d.vec2i])((a) => {
        return a.x;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.i32);
      expect(snippet.origin).toBe('argument'); // whyyy ???
    });

    it('vec2i argument component assignment has runtime origin', () => {
      const f = tgpu.fn([d.vec2i])((a) => {
        const b = a.x;
        return b;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.i32);
      expect(snippet.origin).toBe('runtime');
    });

    it('vec3f return from function has runtime origin', () => {
      const getV = () => {
        'use gpu';
        return d.vec3f(1, 2, 3);
      };

      const f = () => {
        'use gpu';
        return getV();
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('runtime');
    });

    it('vec3f return from function assignment to variable has this-function origin', () => {
      const getV = () => {
        'use gpu';
        return d.vec3f(1, 2, 3);
      };

      const f = () => {
        'use gpu';
        const b = getV();
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('this-function');
    });
  });

  describe('uniform', () => {
    it('f32 uniform buffer has runtime origin', ({ root }) => {
      const buf = root.createUniform(d.f32);

      const f = () => {
        'use gpu';
        return buf.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('f32 uniform buffer assignment has runtime origin', ({ root }) => {
      const buf = root.createUniform(d.f32);

      const f = () => {
        'use gpu';
        const b = buf.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('vec3f uniform buffer has uniform origin', ({ root }) => {
      const buf = root.createUniform(d.vec3f);

      const f = () => {
        'use gpu';
        return buf.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('uniform');
    });

    it('vec3f uniform buffer assignment has uniform origin', ({ root }) => {
      const buf = root.createUniform(d.vec3f);

      const f = () => {
        'use gpu';
        const b = buf.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(implicitUniformPtr(d.vec3f));
      expect(snippet.origin).toBe('uniform');
    });
  });

  describe('readonly', () => {
    it('f32 readonly buffer has runtime origin', ({ root }) => {
      const buf = root.createReadonly(d.f32);

      const f = () => {
        'use gpu';
        return buf.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('f32 readonly buffer assignment has runtime origin', ({ root }) => {
      const buf = root.createReadonly(d.f32);

      const f = () => {
        'use gpu';
        const b = buf.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('vec3f readonly buffer has readonly origin', ({ root }) => {
      const buf = root.createReadonly(d.vec3f);

      const f = () => {
        'use gpu';
        return buf.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('readonly');
    });

    it('vec3f readonly buffer assignment has readonly origin', ({ root }) => {
      const buf = root.createReadonly(d.vec3f);

      const f = () => {
        'use gpu';
        const b = buf.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(implicitReadonlyPtr(d.vec3f));
      expect(snippet.origin).toBe('readonly');
    });
  });

  describe('mutable', () => {
    it('f32 mutable buffer has runtime origin', ({ root }) => {
      const buf = root.createMutable(d.f32);

      const f = () => {
        'use gpu';
        return buf.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('f32 mutable buffer assignment has runtime origin', ({ root }) => {
      const buf = root.createMutable(d.f32);

      const f = () => {
        'use gpu';
        const b = buf.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('vec3f mutable buffer has mutable origin', ({ root }) => {
      const buf = root.createMutable(d.vec3f);

      const f = () => {
        'use gpu';
        return buf.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('mutable');
    });

    it('vec3f mutable buffer assignment has mutable origin', ({ root }) => {
      const buf = root.createMutable(d.vec3f);

      const f = () => {
        'use gpu';
        const b = buf.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(implicitMutablePtr(d.vec3f));
      expect(snippet.origin).toBe('mutable');
    });
  });

  describe('private', () => {
    it('f32 private var has runtime origin', () => {
      const pv = tgpu.privateVar(d.f32);

      const f = () => {
        'use gpu';
        return pv.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('f32 private var assignment has runtime origin', () => {
      const pv = tgpu.privateVar(d.f32);

      const f = () => {
        'use gpu';
        const b = pv.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('vec3f private var has private origin', () => {
      const pv = tgpu.privateVar(d.vec3f);

      const f = () => {
        'use gpu';
        return pv.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('private');
    });

    it('vec3f private var assignment has private origin', () => {
      const pv = tgpu.privateVar(d.vec3f);

      const f = () => {
        'use gpu';
        const b = pv.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(implicitPrivatePtr(d.vec3f));
      expect(snippet.origin).toBe('private');
    });
  });

  describe('workgroup', () => {
    it('f32 workgroup var has runtime origin', () => {
      const wgv = tgpu.workgroupVar(d.f32);

      const f = () => {
        'use gpu';
        return wgv.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('f32 workgroup var assignment has runtime origin', () => {
      const wgv = tgpu.workgroupVar(d.f32);

      const f = () => {
        'use gpu';
        const b = wgv.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('vec3f workgroup var has workgroup origin', () => {
      const wgv = tgpu.workgroupVar(d.vec3f);

      const f = () => {
        'use gpu';
        return wgv.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('workgroup');
    });

    it('vec3f workgroup var assignment has workgroup origin', () => {
      const wgv = tgpu.workgroupVar(d.vec3f);

      const f = () => {
        'use gpu';
        const b = wgv.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(implicitWorkgroupPtr(d.vec3f));
      expect(snippet.origin).toBe('workgroup');
    });
  });

  describe('handle', () => {
    it('sampler binding has handle origin', () => {
      const layout = tgpu.bindGroupLayout({
        s: { sampler: 'filtering' },
      });

      const f = () => {
        'use gpu';
        return layout.$.s;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.sampler());
      expect(snippet.origin).toBe('handle');
    });
  });

  describe('tgpu.const', () => {
    it('tgpu.const u32 value has constant origin', () => {
      const c = tgpu.const(d.u32, 42);

      const f = () => {
        'use gpu';
        return c.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.u32);
      expect(snippet.origin).toBe('constant');
    });

    it('tgpu.const u32 value assignment to variable has constant origin', () => {
      const c = tgpu.const(d.u32, 42);

      const f = () => {
        'use gpu';
        const b = c.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.u32);
      expect(snippet.origin).toBe('constant');
    });

    it('tgpu.const vec3f value has constant-tgpu-const-ref origin', () => {
      const c = tgpu.const(d.vec3f, d.vec3f(1, 2, 3));

      const f = () => {
        'use gpu';
        return c.$;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('constant-tgpu-const-ref');
    });

    it('tgpu.const vec3f value assignment to variable has constant-tgpu-const-ref origin', () => {
      const c = tgpu.const(d.vec3f, d.vec3f(1, 2, 3));

      const f = () => {
        'use gpu';
        const b = c.$;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('constant-tgpu-const-ref');
    });

    it('tgpu.const array of f32 indexed by runtime value has runtime origin', () => {
      const arr = tgpu.const(d.arrayOf(d.f32, 3), [0, 1, 2]);

      const f = tgpu.fn([d.i32])((i) => {
        return arr.$[i];
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('tgpu.const array of f32 indexed by runtime value assignment has runtime origin', () => {
      const arr = tgpu.const(d.arrayOf(d.f32, 3), [0, 1, 2]);

      const f = tgpu.fn([d.i32])((i) => {
        const b = arr.$[i];
        return b;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('tgpu.const array of vec3f indexed by runtime value has runtime-tgpu-const-ref origin', () => {
      const arr = tgpu.const(d.arrayOf(d.vec3f, 3), [d.vec3f(0), d.vec3f(1), d.vec3f(2)]);

      const f = tgpu.fn([d.i32])((i) => {
        return arr.$[i];
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('runtime-tgpu-const-ref');
    });

    it('tgpu.const array of vec3f indexed by runtime value assignment has runtime-tgpu-const-ref origin', () => {
      const arr = tgpu.const(d.arrayOf(d.vec3f, 3), [d.vec3f(0), d.vec3f(1), d.vec3f(2)]);

      const f = tgpu.fn([d.i32])((i) => {
        const b = arr.$[i];
        return b;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('runtime-tgpu-const-ref');
    });
  });

  describe('struct', () => {
    it('u32 struct field from uniform buffer has runtime origin', ({ root }) => {
      const Particle = d.struct({ pos: d.vec3f, count: d.u32 });
      const buf = root.createUniform(Particle);

      const f = () => {
        'use gpu';
        return buf.$.count;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.u32);
      expect(snippet.origin).toBe('runtime');
    });

    it('u32 struct field from uniform buffer assignment has runtime origin', ({ root }) => {
      const Particle = d.struct({ pos: d.vec3f, count: d.u32 });
      const buf = root.createUniform(Particle);

      const f = () => {
        'use gpu';
        const b = buf.$.count;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.u32);
      expect(snippet.origin).toBe('runtime');
    });

    it('vec3f struct field from uniform buffer preserves uniform origin', ({ root }) => {
      const Particle = d.struct({ pos: d.vec3f, count: d.u32 });
      const buf = root.createUniform(Particle);

      const f = () => {
        'use gpu';
        return buf.$.pos;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec3f);
      expect(snippet.origin).toBe('uniform');
    });

    it('vec3f struct field from uniform buffer assignment preserves uniform origin', ({ root }) => {
      const Particle = d.struct({ pos: d.vec3f, count: d.u32 });
      const buf = root.createUniform(Particle);

      const f = () => {
        'use gpu';
        const b = buf.$.pos;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(implicitUniformPtr(d.vec3f));
      expect(snippet.origin).toBe('uniform');
    });
  });

  describe('swizzle', () => {
    it('single-component swizzle from argument preserves argument origin', () => {
      const f = tgpu.fn([d.vec3f])((v) => {
        return v.x;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('argument');
    });

    it('single-component swizzle from argument assignment has runtime origin', () => {
      const f = tgpu.fn([d.vec3f])((v) => {
        const b = v.x;
        return b;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.f32);
      expect(snippet.origin).toBe('runtime');
    });

    it('multi-component swizzle from argument has runtime origin', () => {
      const f = tgpu.fn([d.vec3f])((v) => {
        return v.xy;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2f);
      expect(snippet.origin).toBe('runtime');
    });

    it('multi-component swizzle from argument assignment has this-function origin', () => {
      const f = tgpu.fn([d.vec3f])((v) => {
        const b = v.xy;
        return b;
      });

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2f);
      expect(snippet.origin).toBe('this-function');
    });
  });

  describe('d.ref', () => {
    it('d.ref of u32 has function origin', () => {
      const f = () => {
        'use gpu';
        const b = d.ref(d.u32(0));
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.ptrFn(d.u32));
      expect(snippet.origin).toBe('function');
    });

    it('d.ref of vec2f has function origin', () => {
      const f = () => {
        'use gpu';
        const b = d.ref(d.vec2f());
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.ptrFn(d.vec2f));
      expect(snippet.origin).toBe('function');
    });
  });

  describe('mixed origins in complex types', () => {
    it('constant swizzle has constant origin', () => {
      const f = () => {
        'use gpu';
        return d.vec4f(7).xz;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2f);
      expect(snippet.origin).toBe('constant');
    });

    it('constant swizzle assignment has this-function origin', () => {
      const f = () => {
        'use gpu';
        const b = d.vec4f(7).xz;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2f);
      expect(snippet.origin).toBe('this-function');
    });

    it('mixed swizzle has runtime origin', ({ root }) => {
      const buf = root.createMutable(d.vec3f);

      const f = () => {
        'use gpu';
        return d.vec4f(buf.$, 1).xw;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2f);
      expect(snippet.origin).toBe('runtime');
    });

    it('mixed swizzle assignment has this-function origin', ({ root }) => {
      const buf = root.createMutable(d.vec3f);

      const f = () => {
        'use gpu';
        const b = d.vec4f(buf.$, 1).xw;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2f);
      expect(snippet.origin).toBe('this-function');
    });

    it('constant struct field access has this-function origin', () => {
      const Boid = d.struct({ pos: d.vec2f });

      const f = () => {
        'use gpu';
        const a = Boid();
        return a.pos;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2f);
      expect(snippet.origin).toBe('this-function');
    });

    it('constant struct field access assignment has this-function origin', () => {
      const Boid = d.struct({ pos: d.vec2f });

      const f = () => {
        'use gpu';
        const a = Boid();
        const b = a.pos;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(implicitFnPtr(d.vec2f));
      expect(snippet.origin).toBe('this-function');
    });

    it('mixed struct field access has this-function origin', ({ root }) => {
      const buf = root.createMutable(d.vec2f);
      const Boid = d.struct({ pos: d.vec2f, health: d.u32 });

      const f = () => {
        'use gpu';
        const a = Boid({ pos: buf.$, health: 7 });
        return a.pos;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(d.vec2f);
      expect(snippet.origin).toBe('this-function');
    });

    it('mixed struct field access assignment has this-function origin', ({ root }) => {
      const buf = root.createMutable(d.vec2f);
      const Boid = d.struct({ pos: d.vec2f, health: d.u32 });

      const f = () => {
        'use gpu';
        const a = Boid({ pos: buf.$, health: 7 });
        const b = a.pos;
        return b;
      };

      const snippet = extractSnippetFromFn(f);
      expect(snippet.dataType).toStrictEqual(implicitFnPtr(d.vec2f));
      expect(snippet.origin).toBe('this-function');
    });
  });
});
