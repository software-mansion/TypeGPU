import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.js';

const fnShell = tgpu.fn([d.vec4u], d.u32);

describe('mutability tracking', () => {
  describe('different nodes', () => {
    it('leaves unmodified variables as let', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = arg.x;
        const b = d.vec4u(arg);
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          let a = arg.x;
          let b = arg;
          return a;
        }"
      `);
      expect(resolved).toContain('let a = arg.x');
      expect(resolved).toContain('let b = arg');
    });

    it('resolves reassigned variable to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        const b = d.vec4u(arg);

        a = 1;
        b.x = 1;

        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          var b = arg;
          a = 1u;
          b.x = 1u;
          return a;
        }"
      `);
      expect(resolved).toContain('var a = arg.x');
      expect(resolved).toContain('var b = arg');
    });

    it('resolves incremented variable to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        const b = d.vec4u(arg);

        a++;
        b.x++;

        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          var b = arg;
          a++;
          b.x++;
          return a;
        }"
      `);
      expect(resolved).toContain('var a = arg.x');
      expect(resolved).toContain('var b = arg');
    });

    it('resolves pointed variable to var', () => {
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
          let b = arg;
          modify((&a), (&b));
          return a;
        }"
      `);
      expect(resolved).toContain('var a = arg.x');
      expect(resolved).toContain('var b = arg');
    });
  });

  describe('resolves modified to var', () => {
    it('resolves reassigned primitive let to var', () => {
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

    it('resolves conditionally reassigned primitive let to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        if (a < 1) {
          a = 1;
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
          return a;
        }"
      `);
      expect(resolved).toContain('var a = arg.x');
    });

    it('resolves mutated primitive let to var', () => {
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

    it('resolves incremented primitive let to var', () => {
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

    it('resolves modified reference const to var', () => {
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

    it('resolves modified reference let to var', () => {
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

    it('resolves reassigned reference let to var', () => {
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
  });

  describe('resolves unmodified to let', () => {
    it('resolves unmodified primitive const arg', () => {
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

    it('resolves unmodified primitive let arg', () => {
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

    it('resolves unmodified reference const arg', () => {
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

    it('resolves unmodified reference let arg', () => {
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
  });

  it('resolves shadowed variables correctly', () => {
    const fn = fnShell((arg) => {
      'use gpu';
      const a = d.vec4u(arg);
      {
        const a = d.vec4u(arg);
        a.x = 2;
        const b = a;
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
          let b = (&a_1);
        }
        return a.x;
      }"
    `);
    expect(resolved).toContain('let a = arg');
    expect(resolved).toContain('var a_1 = arg');
  });

  describe('references', () => {
    it('resolves a primitive variable used with d.ref to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = d.ref(0);
        return a.$;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = 0;
          return u32(a);
        }"
      `);
      expect(resolved).toContain('var a = 0');
    });

    it('resolves a complex variable used with d.ref to var', () => {
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

    it('resolves a struct to var when its prop is referenced', () => {
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
          let struct_1 = Struct();
          let prop = (&struct_1.prop);
        }"
      `);
      expect(resolved).toContain('var struct_1 = Struct()');
    });

    it('resolves a struct to let when its prop is only read', () => {
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
  });
});
