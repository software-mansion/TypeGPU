import { describe, expect } from 'vitest';
import * as d from '../../src/data/index.ts';
import tgpu from '../../src/index.ts';
import { it } from '../utils/extendedIt.ts';
import { parse, parseResolved } from '../utils/parseResolved.ts';

describe('wgslGenerator', () => {
  it('generates correct resources for mul dot operator', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec2f().mul(1);
    });

    expect(parseResolved({ testFn })).toEqual(
      parse(`
      fn testFn() {
        var v1 = (vec2f() * 1);
      }`),
    );
  });

  it('generates correct resources for mul dot operator', () => {
    const testFn = tgpu.fn([])(() => {
      const m1 = d.mat2x2f().mul(1);
    });

    expect(parseResolved({ testFn })).toEqual(
      parse(`
      fn testFn() {
        var m1 = (mat2x2f() * 1);
      }`),
    );
  });

  // it('generates correct resources for mul dot operator', () => {
  //   const testFn = tgpu.fn([])(() => {
  //     const m1 = d.mat2x2f().mul(1);
  //     const m2 = d.mat3x3f().mul(d.vec3f());
  //     const m3 = d.mat4x4f().mul(d.mat4x4f());
  //     const m4 = d.mat2x2f().mul(d.mat2x2f()).mul(1);
  //     const v1 = d.vec2f().mul(1);
  //     const v2 = d.vec3f().mul(d.vec3f());
  //     const v3 = d.vec4f().mul(d.mat4x4f());
  //     const v4 = d.vec3f().mul(d.mat3x3f()).mul(1);
  //   });

  //   expect(parseResolved({ testFn })).toEqual(
  //     parse(`
  //     fn testFn() {
  //       var m1 = (mat2x2f() * 1);
  //       var m2 = (mat3x3f() * vec3f());
  //       var m3 = (mat4x4f() * mat4x4f());
  //       var m4 = ((mat2x2f() * mat2x2f()) * 1);
  //       var v1 = (vec2f() * 1);
  //       var v2 = (vec3f() * vec3f());
  //       var v3 = (vec4f() * mat4x4f());
  //       var v4 = ((vec3f() * mat3x3f()) * 1);
  //     }`),
  //   );
  // });

  // it('generates correct resource types ', () => {
  //   const testFn = tgpu.fn([])(() => {
  //     const m1 = d.mat2x2f().mul(1);
  //     const m2 = d.mat3x3f().mul(d.vec3f());
  //     const m3 = d.mat4x4f().mul(d.mat4x4f());
  //     const m4 = d.mat2x2f().mul(d.mat2x2f()).mul(1);
  //     const v1 = d.vec2f().mul(1);
  //     const v2 = d.vec3f().mul(d.vec3f());
  //     const v3 = d.vec4f().mul(d.mat4x4f());
  //     const v4 = d.vec3f().mul(d.mat3x3f()).mul(1);
  //   });

  //   const astInfo = generateAst(ctx, testFn);

  //   function genExpression(index: number) {
  //     const assignmentRhs = (
  //       astInfo.ast.body[1][index] as tinyest.Const
  //     )[2] as tinyest.Expression;
  //     return wgslGenerator.generateExpression(ctx, assignmentRhs);
  //   }

  //   expect(genExpression(0).dataType.type).toEqual('mat2x2f');
  //   expect(genExpression(1).dataType.type).toEqual('vec3f');
  //   expect(genExpression(2).dataType.type).toEqual('mat4x4f');
  //   expect(genExpression(3).dataType.type).toEqual('mat2x2f');
  //   expect(genExpression(4).dataType.type).toEqual('vec2f');
  //   expect(genExpression(5).dataType.type).toEqual('vec3f');
  //   expect(genExpression(6).dataType.type).toEqual('vec4f');
  //   expect(genExpression(7).dataType.type).toEqual('vec3f');
  // });
});
