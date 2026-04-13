import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.js';

const fnShell = tgpu.fn([d.vec4u], d.u32);

describe('mutability tracking', () => {
  describe('resolves modified to var', () => {
    it('resolves modified primitive let arg to var', () => {
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

    it('resolves modified reference const arg to var', () => {
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

    it('resolves modified reference let arg to var', () => {
      const fn = fnShell((arg) => {
        'use gpu';
        let a = d.vec4u(arg);
        a += 1;
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

    it('resolves reassigned reference let arg to var', () => {
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
});
