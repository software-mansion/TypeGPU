import { it } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import tgpu, { d } from '../src/index.js';

describe('external prop access', () => {
  it('supports matrix.column', () => {
    const matrix = d.mat4x4f.rotationX(45);
    const fn = () => {
      'use gpu';
      const fst = matrix.columns[0]; // externals: { ...: () => matrix.columns }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        let fst = vec4f(1, 0, 0, 0);
      }"
    `);
  });

  it('supports comptime known array.length', () => {
    const layout = tgpu.bindGroupLayout({
      arr: { storage: d.arrayOf(d.u32, 4) },
    });
    const fn = () => {
      'use gpu';
      const len = layout.$.arr.length; // externals: { ...: () => layout.$.arr.length }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        const len = 4;
      }"
    `);
  });

  it('supports runtime sized array.length', () => {
    const layout = tgpu.bindGroupLayout({
      arr: { storage: d.arrayOf(d.u32) },
    });
    const fn = () => {
      'use gpu';
      const len = layout.$.arr.length; // externals: { ...: () => layout.$.arr.length }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> arr: array<u32>;

      fn fn_1() {
        let len = arrayLength(&arr);
      }"
    `);
  });

  it('supports console.log', () => {
    const fn = () => {
      'use gpu';
      console.log(1); // externals: { ...: () => console.log }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        /* console.log() */;
      }"
    `);
  });

  it('supports Math.sin', () => {
    const fn = () => {
      'use gpu';
      // oxlint-disable-next-line typegpu/no-math
      const a = Math.sin(1); // externals: { ...: () => Math.sin }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        const a = 0.8414709848078965;
      }"
    `);
  });

  it('supports infix dispatch', () => {
    const vec = d.vec2i();
    const fn = () => {
      'use gpu';
      const v = vec.mul(2); // externals: { ...: () => vec.mul }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        let v = vec2i();
      }"
    `);
  });

  it('supports TS syntax', () => {
    const vecs = { v: d.vec2i() } as { v: d.v2i } | undefined;
    const fn = () => {
      'use gpu';
      const a = vecs!.v;
      const b = (vecs as { v: d.v2i }).v;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        let a = vec2i();
        let b = vec2i();
      }"
    `);
  });
});
