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
          a += 1u;
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
          a += 1u;
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
          a += 1u;
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
          a += 1;
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
});
