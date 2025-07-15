import { describe, expect } from 'vitest';
import * as d from '../../src/data/index.ts';
import tgpu from '../../src/index.ts';
import { it } from '../utils/extendedIt.ts';
import { parse, parseResolved } from '../utils/parseResolved.ts';

describe('wgslGenerator', () => {
  it('resolves add dot operator', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f().add(1);
      const v2 = d.vec3f().add(d.vec3f());
      const v3 = d.vec2f().add(d.vec2f()).add(1);
      const m1 = d.mat2x2f().add(d.mat2x2f());
      const m2 = d.mat3x3f().add(d.mat3x3f()).add(d.mat3x3f());
    });

    console.log(parseResolved({ testFn }));
    expect(parseResolved({ testFn })).toEqual(
      parse(`
      fn testFn() {
        var v1 = (vec4f() + 1);
        var v2 = (vec3f() + vec3f());
        var v3 = ((vec2f() + vec2f()) + 1);
        var m1 = (mat2x2f() + mat2x2f());
        var m2 = ((mat3x3f() + mat3x3f()) + mat3x3f());
      }`),
    );
  });

  it('resolves sub dot operator', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f().sub(1);
      const v2 = d.vec3f().sub(d.vec3f());
      const v3 = d.vec2f().sub(d.vec2f()).sub(1);
      const m1 = d.mat2x2f().sub(d.mat2x2f());
      const m2 = d.mat3x3f().sub(d.mat3x3f()).sub(d.mat3x3f());
    });

    console.log(parseResolved({ testFn }));
    expect(parseResolved({ testFn })).toEqual(
      parse(`
      fn testFn() {
        var v1 = (vec4f() - 1);
        var v2 = (vec3f() - vec3f());
        var v3 = ((vec2f() - vec2f()) - 1);
        var m1 = (mat2x2f() - mat2x2f());
        var m2 = ((mat3x3f() - mat3x3f()) - mat3x3f());
      }`),
    );
  });

  it('resolves mul dot operator', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec2f().mul(1);
      const v2 = d.vec3f().mul(d.vec3f());
      const v3 = d.vec4f().mul(d.mat4x4f());
      const v4 = d.vec3f().mul(d.mat3x3f()).mul(1);

      const m1 = d.mat2x2f().mul(1);
      const m2 = d.mat3x3f().mul(d.vec3f());
      const m3 = d.mat4x4f().mul(d.mat4x4f());
      const m4 = d.mat2x2f().mul(d.mat2x2f()).mul(1);
    });

    expect(parseResolved({ testFn })).toEqual(
      parse(`
      fn testFn() {
        var v1 = (vec2f() * 1);
        var v2 = (vec3f() * vec3f());
        var v3 = (vec4f() * mat4x4f());
        var v4 = ((vec3f() * mat3x3f()) * 1);

        var m1 = (mat2x2f() * 1);
        var m2 = (mat3x3f() * vec3f());
        var m3 = (mat4x4f() * mat4x4f());
        var m4 = ((mat2x2f() * mat2x2f()) * 1);
      }`),
    );
  });

  it('resolves div dot operator', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f().div(1);
      const v2 = d.vec3f().div(d.vec3f());
      const v3 = d.vec2f().div(d.vec2f()).div(1);
    });

    console.log(parseResolved({ testFn }));
    expect(parseResolved({ testFn })).toEqual(
      parse(`
      fn testFn() {
        var v1 = (vec4f() / 1);
        var v2 = (vec3f() / vec3f());
        var v3 = ((vec2f() / vec2f()) / 1);
      }`),
    );
  });
});
