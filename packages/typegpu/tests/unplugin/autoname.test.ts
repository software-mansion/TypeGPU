import { describe, expect } from 'vitest';
import * as d from '../../src/data/index.ts';
import { struct } from '../../src/data/index.ts';
import tgpu, { type TgpuBindGroupLayout } from '../../src/index.ts';
import { getName } from '../../src/shared/meta.ts';
import { it } from '../utils/extendedIt.ts';

describe('autonaming', () => {
  it('autonames resources created using tgpu', () => {
    const mySlot = tgpu.slot<number>();
    const myLayout = tgpu.bindGroupLayout({ foo: { uniform: d.vec3f } });
    const myVertexLayout = tgpu.vertexLayout((n: number) =>
      d.arrayOf(d.i32, n)
    );

    expect(getName(mySlot)).toBe('mySlot');
    expect(getName(myLayout)).toBe('myLayout');
    expect(getName(myVertexLayout)).toBe('myVertexLayout');
  });

  it("autonames resources created using tgpu['~unstable']", () => {
    const myAccessor = tgpu['~unstable'].accessor(d.f32);
    const myPrivateVar = tgpu.privateVar(d.vec2f);
    const myWorkgroupVar = tgpu.workgroupVar(d.f32);
    const myConst = tgpu.const(d.f32, 1);

    expect(getName(myAccessor)).toBe('myAccessor');
    expect(getName(myPrivateVar)).toBe('myPrivateVar');
    expect(getName(myWorkgroupVar)).toBe('myWorkgroupVar');
    expect(getName(myConst)).toBe('myConst');
  });

  it('autonames structs', () => {
    const myStruct1 = d.struct({ a: d.u32 });
    const myStruct2 = struct({ a: d.i32 });

    expect(getName(myStruct1)).toBe('myStruct1');
    expect(getName(myStruct2)).toBe('myStruct2');
  });

  it('autonames resources created using root', ({ root }) => {
    const myBuffer = root.createBuffer(d.u32, 2);
    const myMutable = root.createMutable(d.u32);
    const myReadonly = root.createReadonly(d.u32);
    const myUniform = root.createUniform(d.u32);
    const myQuerySet = root.createQuerySet('timestamp', 2);

    expect(getName(myBuffer)).toBe('myBuffer');
    expect(getName(myMutable)).toBe('myMutable');
    expect(getName(myReadonly)).toBe('myReadonly');
    expect(getName(myUniform)).toBe('myUniform');
    expect(getName(myQuerySet)).toBe('myQuerySet');
  });

  it("autonames resources created using root['~unstable']", ({ root }) => {
    const myPipeline = root['~unstable']
      .withCompute(
        tgpu['~unstable'].computeFn({ workgroupSize: [1] })(() => {}),
      )
      .createPipeline();
    const myTexture = root['~unstable'].createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
    });
    const mySampler = root['~unstable'].createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });
    const myComparisonSampler = root['~unstable'].createComparisonSampler({
      compare: 'equal',
    });

    expect(getName(myPipeline)).toBe('myPipeline');
    expect(getName(myTexture)).toBe('myTexture');
    expect(getName(mySampler)).toBe('mySampler');
    expect(getName(myComparisonSampler)).toBe('myComparisonSampler');
  });

  it('autonames when the constructor is hidden behind other methods', ({ root }) => {
    const myBuffer = root.createBuffer(d.u32)
      .$usage('storage')
      .$addFlags(GPUBufferUsage.STORAGE);
    const Item = d.struct({ a: d.u32 });
    const myFn = tgpu.fn(
      [Item],
      Item,
    ) /* wgsl */`(item: Item) -> Item { return item; }`
      .$uses({ Item });
    const myLayout = tgpu
      .bindGroupLayout({ foo: { uniform: d.vec3f } })
      .$idx(0);

    expect(getName(myBuffer)).toBe('myBuffer');
    expect(getName(myFn)).toBe('myFn');
    expect(getName(myLayout)).toBe('myLayout');
  });

  it('does not rename already named resources', () => {
    const myStruct = d.struct({ a: d.u32 }).$name('IntStruct');
    const myFunction = tgpu.fn([])(() => 0).$name('ConstFunction');

    expect(getName(myStruct)).toBe('IntStruct');
    expect(getName(myFunction)).toBe('ConstFunction');
  });

  it('names TGPU functions', () => {
    const myFunction = tgpu.fn([])(() => 0);
    const myComputeFn = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(
      () => {},
    );
    const myVertexFn = tgpu['~unstable'].vertexFn({ out: { ret: d.i32 } })(
      () => ({ ret: 0 }),
    );
    const myFragmentFn = tgpu['~unstable'].fragmentFn({
      in: { position: d.builtin.position },
      out: d.vec4f,
    })(
      () => d.vec4f(),
    );

    expect(getName(myFunction)).toBe('myFunction');
    expect(getName(myComputeFn)).toBe('myComputeFn');
    expect(getName(myVertexFn)).toBe('myVertexFn');
    expect(getName(myFragmentFn)).toBe('myFragmentFn');
  });

  it('autonames assignment expressions', () => {
    // biome-ignore lint/style/useConst: it's a test
    let layout: TgpuBindGroupLayout;
    layout = tgpu
      .bindGroupLayout({
        foo: { uniform: d.vec3f },
      });

    expect(getName(layout)).toBe('layout');
  });

  it('autonames properties', () => {
    const mySchemas = {
      myStruct: d.struct({ a: d.vec3f }),
    };

    expect(getName(mySchemas.myStruct)).toBe('myStruct');
  });

  it('names arrow functions', () => {
    const myFun = () => {
      'use gpu';
      return 0;
    };

    const myGpuFun = tgpu.fn([], d.u32)(myFun);

    expect(getName(myFun)).toBe('myFun');
    expect(getName(tgpu.fn([], d.u32)(myFun))).toBe('myFun');
    expect(getName(myGpuFun)).toBe('myFun');
  });

  it('names function expression', () => {
    // biome-ignore lint/complexity/useArrowFunction: shhh it's a test
    const myFun = function () {
      'use gpu';
      return 0;
    };

    const myGpuFun = tgpu.fn([], d.u32)(myFun);

    expect(getName(myFun)).toBe('myFun');
    expect(getName(tgpu.fn([], d.u32)(myFun))).toBe('myFun');
    expect(getName(myGpuFun)).toBe('myFun');
  });

  it('names function definition', () => {
    function myFun() {
      'use gpu';
      return 0;
    }

    const myGpuFun = tgpu.fn([], d.u32)(myFun);

    expect(getName(myFun)).toBe('myFun');
    expect(getName(tgpu.fn([], d.u32)(myFun))).toBe('myFun');
    expect(getName(myGpuFun)).toBe('myFun');
  });

  it('shellless name carries over to WGSL', () => {
    function myFun() {
      'use gpu';
      return 0;
    }

    const main = tgpu.fn([])(() => {
      myFun();
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn myFun() -> i32 {
        return 0;
      }

      fn main() {
        myFun();
      }"
    `);
  });
});
