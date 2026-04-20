import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu, { std } from '../src/index.js';

const fnShell = tgpu.fn([d.vec4u], d.u32);

describe('mutability tracking', () => {
  describe('resolves unmodified to let', () => {
    it('resolves unmodified primitive const', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = arg.x;
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          let a = arg.x;
          return a;
        }"
      `);
      expect(resolved).toContain('let a = arg.x');
    });

    it('resolves unmodified primitive let', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          let a = arg.x;
          return a;
        }"
      `);
      expect(resolved).toContain('let a = arg.x');
    });

    it('resolves unmodified reference const', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = d.vec4u(arg);
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          let a = arg;
          return a.x;
        }"
      `);
      expect(resolved).toContain('let a = arg');
    });

    it('resolves unmodified reference let', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = d.vec4u(arg);
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          let a = arg;
          return a.x;
        }"
      `);
      expect(resolved).toContain('let a = arg');
    });

    it('resolves reassigned in pruned branch', () => {
      const myAccess = tgpu.accessor(d.bool);
      const fn = () => {
        'use gpu';
        let a = 0;
        if (myAccess.$) {
          a = 1;
        }
        return a;
      };

      const resolved = tgpu.resolve([tgpu.fn(fn).with(myAccess, false)]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn fn_1() -> i32 {
          let a = 0;
          return a;
        }"
      `);
      expect(resolved).toContain('let a = 0');
    });
  });

  describe('resolves modified to var', () => {
    it('resolves reassigned primitive let', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        a = 1;
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          a = 1u;
          return a;
        }"
      `);
      expect(resolved).toContain('var a = arg.x');
    });

    it('resolves conditionally reassigned primitive let', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        if (a < 1) {
          a = 1;
        } else {
        }
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          if ((a < 1u)) {
            a = 1u;
          }
          else {

          }
          return a;
        }"
      `);
      expect(resolved).toContain('var a = arg.x');
    });

    it('resolves mutated primitive let', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        a += 1;
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          a += 1u;
          return a;
        }"
      `);
      expect(resolved).toContain('var a = arg.x');
    });

    it('resolves incremented primitive let', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        a++;
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          a++;
          return a;
        }"
      `);
      expect(resolved).toContain('var a = arg.x');
    });

    it('resolves incremented reference const', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = d.vec4u(arg);
        a.x++;
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg;
          a.x++;
          return a.x;
        }"
      `);
      expect(resolved).toContain('var a = arg');
    });

    it('resolves modified reference const', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = d.vec4u(arg);
        a.x = 1;
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg;
          a.x = 1u;
          return a.x;
        }"
      `);
      expect(resolved).toContain('var a = arg');
    });

    it('resolves modified reference let', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = d.vec4u(arg);
        a.x = 1;
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg;
          a.x = 1u;
          return a.x;
        }"
      `);
      expect(resolved).toContain('var a = arg');
    });

    it('resolves reassigned reference let', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = d.vec4u(arg);
        a = d.vec4u();
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg;
          a = vec4u();
          return a.x;
        }"
      `);
      expect(resolved).toContain('var a = arg');
    });

    it('resolves index-accessed reference const', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = [1, 2, 3];

        a[0] = 1;

        return a[0];
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = array<i32, 3>(1, 2, 3);
          a[0i] = 1i;
          return u32(a[0i]);
        }"
      `);
      expect(resolved).toContain('var a =');
    });

    it('resolves for loops', () => {
      const fn = fnShell((arg) => {
        'use gpu';

        for (const i of std.range(3)) {
        }
        for (let j = 0; j < 3; j++) {}

        return 0;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          for (var i = 0u; i < 3u; i += 1u) {

          }
          for (var j = 0; (j < 3i); j++) {

          }
          return 0u;
        }"
      `);
    });

    it('resolves deeply nested struct modification', () => {
      const Struct = d.struct({
        a: d.arrayOf(d.struct({ b: d.struct({ c: d.vec4f }) }), 4),
      });
      const fn = fnShell((arg) => {
        'use gpu';
        const struct = Struct();
        struct.a[0]!.b.c.x += 1;
        return 0;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "struct b {
          c: vec4f,
        }

        struct item_1 {
          b: b,
        }

        struct Struct {
          a: array<item_1, 4>,
        }

        fn item(arg: vec4u) -> u32 {
          var struct_1 = Struct();
          struct_1.a[0i].b.c.x += 1f;
          return 0u;
        }"
      `);
      expect(resolved).toContain('var struct_1 = Struct()');
    });
  });

  it('resolves shadowed variables correctly', () => {
    const fn = fnShell((arg) => {
      'use gpu';
      const a = d.vec4u(arg);
      {
        const a = d.vec4u(arg);
        a.x = 2;
      }
      return a.x;
    });

    const resolved = tgpu.resolve([fn]);
    expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          let a = arg;
          {
            var a_1 = arg;
            a_1.x = 2u;
          }
          return a.x;
        }"
      `);
    expect(resolved).toContain('let a = arg');
    expect(resolved).toContain('var a_1 = arg');
  });

  describe('d.ref and pointers', () => {
    it('resolves a primitive variable used with d.ref', () => {
      const fn = () => {
        'use gpu';
        const a = d.ref(0);
        return a.$;
      };

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn fn_1() -> i32 {
          var a = 0;
          return a;
        }"
      `);
      expect(resolved).toContain('var a = 0');
    });

    it('resolves a referential variable used with d.ref', () => {
      const fn = () => {
        'use gpu';
        const a = d.ref(d.vec4u());
        return a.$.x;
      };

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn fn_1() -> u32 {
          var a = vec4u();
          return a.x;
        }"
      `);
      expect(resolved).toContain('var a = vec4u()');
    });

    it('resolves pointed variable', () => {
      const modify = tgpu.fn([d.ptrFn(d.u32), d.ptrFn(d.vec4u)])((num, vec) => {
        'use gpu';
        num.$ += 1;
        vec.$ += 1;
      });

      const fn = fnShell((arg) => {
        'use gpu';
        let a = d.ref(d.u32(arg.x));
        const b = d.vec4u(arg);

        modify(a, d.ref(b));

        return a.$;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn modify(num: ptr<function, u32>, vec: ptr<function, vec4u>) {
          (*num) += 1u;
          (*vec) += 1;
        }

        fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          var b = arg;
          modify((&a), (&b));
          return a;
        }"
      `);
      expect(resolved).toContain('var a = arg.x');
      expect(resolved).toContain('var b = arg');
    });

    it('resolves d.ref to a struct prop', () => {
      const Struct = d.struct({ prop: d.vec4u });

      const modify = tgpu.fn([d.ptrFn(d.vec4u)])((vec) => {
        'use gpu';
        vec.$ += 1;
      });

      const fn = fnShell((arg) => {
        'use gpu';
        const struct = Struct();

        modify(d.ref(struct.prop));

        return struct.prop.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "struct Struct {
          prop: vec4u,
        }

        fn modify(vec: ptr<function, vec4u>) {
          (*vec) += 1;
        }

        fn item(arg: vec4u) -> u32 {
          var struct_1 = Struct();
          modify((&struct_1.prop));
          return struct_1.prop.x;
        }"
      `);
      expect(resolved).toContain('var struct_1 = Struct()');
    });

    it('resolves a referenced reference', () => {
      const fn = () => {
        'use gpu';
        const a = d.vec4f();
        const b = a;
      };

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn fn_1() {
          var a = vec4f();
          let b = (&a);
        }"
      `);
      expect(resolved).toContain('var a = vec4f()');
    });

    it('resolves a struct with its prop referenced', () => {
      const Struct = d.struct({ prop: d.vec4f });
      const fn = () => {
        'use gpu';
        const struct = Struct();
        const prop = struct.prop;
      };

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "struct Struct {
          prop: vec4f,
        }

        fn fn_1() {
          var struct_1 = Struct();
          let prop = (&struct_1.prop);
        }"
      `);
      expect(resolved).toContain('var struct_1 = Struct()');
    });

    it('resolves an array with its element referenced', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const t = [d.vec2u()];
        const e = t[0]!;
        return e.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var t = array<vec2u, 1>(vec2u());
          let e = (&t[0i]);
          return (*e).x;
        }"
      `);
      expect(resolved).toContain('var t = ');
    });

    it('resolves the weird unroll case', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = d.vec2u();
        for (const e of tgpu.unroll([a])) {
          a.x += 1;
        }
        return 0;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = vec2u();
          // unrolled iteration #0
          {
            a.x += 1u;
          }
          return 0u;
        }"
      `);
      expect(resolved).toContain('var a = ');
    });

    it('resolves a struct when its prop is only read', () => {
      const Struct = d.struct({ prop: d.vec4f });
      const fn = () => {
        'use gpu';
        const struct = Struct();
        return struct.prop;
      };

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "struct Struct {
          prop: vec4f,
        }

        fn fn_1() -> vec4f {
          let struct_1 = Struct();
          return struct_1.prop;
        }"
      `);
      expect(resolved).toContain('let struct_1 = Struct()');
    });

    it('resolves for..of on a referential array', () => {
      const fn = () => {
        'use gpu';
        const t = [d.vec2f()];
        let result = d.vec2f();
        for (const v of t) {
          result += v;
        }
      };

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn fn_1() {
          var t = array<vec2f, 1>(vec2f());
          var result = vec2f();
          for (var i = 0u; i < 1u; i += 1u) {
            let v = (&t[i]);
            {
              result += (*v);
            }
          }
        }"
      `);
      expect(resolved).toContain('var t = ');
    });

    it('resolves tgpu.unroll() on a referential element', () => {
      const fn = () => {
        'use gpu';
        const v = d.vec2f();
        const u = tgpu.unroll(v);
      };

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn fn_1() {
          var v = vec2f();
          let u = (&v);
        }"
      `);
      expect(resolved).toContain('var v = ');
    });
  });
});
