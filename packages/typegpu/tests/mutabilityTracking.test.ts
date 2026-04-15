import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.js';

const fnShell = tgpu.fn([d.vec4u], d.u32);

describe('mutability tracking', () => {
  describe('resolves modified to var', () => {
    it('resolves reassigned primitive let to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        a = 1;
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('var a = arg.x');
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          a = 1u;
          return a;
        }"
      `);
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
      expect(resolved).toContain('var a = arg.x');
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          if ((a < 1u)) {
            a = 1u;
          }
          return a;
        }"
      `);
    });

    it('resolves mutated primitive let to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        a += 1;
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('var a = arg.x');
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          a += 1u;
          return a;
        }"
      `);
    });

    it('resolves incremented primitive let to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        a++;
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('var a = arg.x');
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg.x;
          a++;
          return a;
        }"
      `);
    });

    it('resolves modified reference const to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = d.vec4u(arg);
        a.x = 1;
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('var a = arg');
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg;
          a.x = 1u;
          return a.x;
        }"
      `);
    });

    it('resolves modified reference let to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = d.vec4u(arg);
        a.x = 1;
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('var a = arg');
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg;
          a.x = 1u;
          return a.x;
        }"
      `);
    });

    it('resolves reassigned reference let to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = d.vec4u(arg);
        a = d.vec4u();
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('var a = arg');
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = arg;
          a = vec4u();
          return a.x;
        }"
      `);
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
      expect(resolved).toContain('let a = arg.x');
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          let a = arg.x;
          return a;
        }"
      `);
    });

    it('resolves unmodified primitive let arg', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = arg.x;
        return a;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('let a = arg.x');
      expect(resolved).toMatchInlineSnapshot();
    });

    it('resolves unmodified reference const arg', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = d.vec4u(arg);
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('let a = arg');
      expect(resolved).toMatchInlineSnapshot();
    });

    it('resolves unmodified reference let arg', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = d.vec4u(arg);
        return a.x;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('let a = arg');
      expect(resolved).toMatchInlineSnapshot();
    });
  });

  it('resolves shadowed variables correctly', () => {
    const fn = fnShell((arg) => {
      'use gpu';
      let a = d.vec4u(arg);
      {
        let a = d.vec4u(arg);
        a.x++;
      }
      return a.x;
    });

    const resolved = tgpu.resolve([fn]);
    expect(resolved).toContain('let a = arg');
    expect(resolved).toContain('var a = arg');
    expect(resolved).toMatchInlineSnapshot();
  });

  describe('references', () => {
    it('resolves a primitive variable used with d.ref to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        const a = d.ref(0);
        return a.$;
      });

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('var a = 0');
      expect(resolved).toMatchInlineSnapshot(`
        "fn item(arg: vec4u) -> u32 {
          var a = 0;
          return u32(a);
        }"
      `);
    });

    it('resolves a complex variable used with d.ref to var', () => {
      const fn = () => {
        'use gpu';
        const a = d.ref(d.vec4u());
        return a.$.x;
      };

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('var a = vec4u()');
      expect(resolved).toMatchInlineSnapshot(`
        "fn fn_1() -> u32 {
          var a = vec4u();
          return a.x;
        }"
      `);
    });

    it('resolves a struct to var when its prop is referenced', () => {
      const Struct = d.struct({ prop: d.vec4f });
      const fn = () => {
        'use gpu';
        const struct = Struct();
        const prop = struct.prop;
      };

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('var struct_1 = Struct()');
      expect(resolved).toMatchInlineSnapshot(`
        "struct Struct {
          prop: vec4f,
        }

        fn fn_1() {
          var struct_1 = Struct();
          let prop = (&struct_1.prop);
        }"
      `);
    });

    it('resolves a struct to let when its prop is only read', () => {
      const Struct = d.struct({ prop: d.vec4f });
      const fn = () => {
        'use gpu';
        const struct = Struct();
        return struct.prop;
      };

      const resolved = tgpu.resolve([fn]);
      expect(resolved).toContain('let struct_1 = Struct()');
      expect(resolved).toMatchInlineSnapshot(`
        "struct Struct {
          prop: vec4f,
        }

        fn fn_1() -> vec4f {
          var struct_1 = Struct();
          return struct_1.prop;
        }"
      `);
    });
  });
});
