import { describe, expect } from 'vitest';
import * as d from '../../src/data/index.ts';
import { struct } from '../../src/data/index.ts';
import tgpu from '../../src/index.ts';
import { getName } from '../../src/shared/meta.ts';
import { it } from '../utils/extendedIt.ts';

describe('autonaming', () => {
  it('autonames created resources', ({ root }) => {
    const myLayout = tgpu.bindGroupLayout({ foo: { uniform: d.vec3f } });
    const myVertexLayout = tgpu.vertexLayout((n: number) =>
      d.arrayOf(d.i32, n)
    );
    const mySlot = tgpu['~unstable'].slot<number>();
    const myAccessor = tgpu['~unstable'].accessor(d.f32);
    const myPrivateVar = tgpu['~unstable'].privateVar(d.vec2f);
    const myWorkgroupVar = tgpu['~unstable'].workgroupVar(d.f32);
    const myConst = tgpu['~unstable'].const(d.f32, 1);
    const myStruct1 = d.struct({ a: d.u32 });
    const myStruct2 = struct({ a: d.i32 });
    const myBuffer = root.createBuffer(d.u32, 2);

    expect(getName(myLayout)).toBe('myLayout');
    expect(getName(myVertexLayout)).toBe('myVertexLayout');
    expect(getName(mySlot)).toBe('mySlot');
    expect(getName(myAccessor)).toBe('myAccessor');
    expect(getName(myPrivateVar)).toBe('myPrivateVar');
    expect(getName(myWorkgroupVar)).toBe('myWorkgroupVar');
    expect(getName(myConst)).toBe('myConst');
    expect(getName(myStruct1)).toBe('myStruct1');
    expect(getName(myStruct2)).toBe('myStruct2');
    expect(getName(myBuffer)).toBe('myBuffer');
  });

  it('does not rename already named resources', () => {
    const myStruct = d.struct({ a: d.u32 }).$name('IntStruct');
    const myFunction = tgpu['~unstable'].fn([])(() => 0).$name('ConstFunction');

    expect(getName(myStruct)).toBe('IntStruct');
    expect(getName(myFunction)).toBe('ConstFunction');
  });

  it('names TGPU functions', () => {
    const myFunction = tgpu['~unstable'].fn([])(() => 0);

    expect(getName(myFunction)).toBe('myFunction');
  });

  // TODO: make it work
  // it('names arrow functions', () => {
  //   const myFun = () => {
  //     'kernel & js';
  //     return 0;
  //   };

  //   const myGpuFun = tgpu['~unstable'].fn([], d.u32)(myFun);

  //   expect(getName(myFun)).toBe('myFun');
  //   expect(getName(myGpuFun)).toBe('myGpuFun');
  // });

  // TODO: make it work
  // it('names function expression', () => {
  //   const myFun = function () {
  //     'kernel & js';
  //     return 0;
  //   };

  //   const myGpuFun = tgpu['~unstable'].fn([], d.u32)(myFun);

  //   expect(getName(myFun)).toBe('myFun');
  //   expect(getName(myGpuFun)).toBe('myGpuFun');
  // });

  // TODO: make it work
  // it('names function definition', () => {
  //   function myFun() {
  //     'kernel & js';
  //     return 0;
  //   }

  //   const myGpuFun = tgpu['~unstable'].fn([], d.u32)(myFun);

  //   expect(getName(myFun)).toBe('myFun');
  //   expect(getName(myGpuFun)).toBe('myGpuFun');
  // });
});
