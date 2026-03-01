import { describe, expect } from 'vitest';
import { struct } from '../../src/data/index.ts';
import tgpu, { d, type TgpuBindGroupLayout } from '../../src/index.js';
import { getName } from '../../src/shared/meta.ts';
import { it } from '../utils/extendedIt.ts';

describe('autonaming', () => {
  it('autonames resources created using tgpu', () => {
    const mySlot = tgpu.slot<number>();
    const myLayout = tgpu.bindGroupLayout({ foo: { uniform: d.vec3f } });
    const myVertexLayout = tgpu.vertexLayout((n: number) => d.arrayOf(d.i32, n));
    const myAccessor = tgpu.accessor(d.f32);
    const myPrivateVar = tgpu.privateVar(d.vec2f);
    const myWorkgroupVar = tgpu.workgroupVar(d.f32);
    const myConst = tgpu.const(d.f32, 1);

    expect(getName(mySlot)).toBe('mySlot');
    expect(getName(myLayout)).toBe('myLayout');
    expect(getName(myVertexLayout)).toBe('myVertexLayout');
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
    const myPipeline = root.createComputePipeline({
      compute: tgpu.computeFn({ workgroupSize: [1] })(() => {}),
    });
    const myGuardedPipeline = root.createGuardedComputePipeline(() => {
      'use gpu';
    });
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

    expect(getName(myBuffer)).toBe('myBuffer');
    expect(getName(myMutable)).toBe('myMutable');
    expect(getName(myReadonly)).toBe('myReadonly');
    expect(getName(myUniform)).toBe('myUniform');
    expect(getName(myQuerySet)).toBe('myQuerySet');
    expect(getName(myPipeline)).toBe('myPipeline');
    expect(getName(myGuardedPipeline)).toBe('myGuardedPipeline');
    expect(getName(myTexture)).toBe('myTexture');
    expect(getName(mySampler)).toBe('mySampler');
    expect(getName(myComparisonSampler)).toBe('myComparisonSampler');
  });

  it('autonames when the constructor is hidden behind other methods', ({ root }) => {
    const myBuffer = root.createBuffer(d.u32).$usage('storage').$addFlags(GPUBufferUsage.STORAGE);
    const Item = d.struct({ a: d.u32 });
    const myFn = tgpu.fn([Item], Item) /* wgsl */ `(item) { return item; }`.$uses({ Item });
    const myLayout = tgpu.bindGroupLayout({ foo: { uniform: d.vec3f } }).$idx(0);

    expect(getName(myBuffer)).toBe('myBuffer');
    expect(getName(myFn)).toBe('myFn');
    expect(getName(myLayout)).toBe('myLayout');
  });

  it('names views', ({ root }) => {
    const texture = root['~unstable']
      .createTexture({
        size: [256, 256],
        format: 'rgba8unorm',
      })
      .$usage('sampled', 'storage');

    const sampledView = texture.createView(d.texture2d(d.f32));
    const storageView = texture.createView(d.textureStorage2d('rgba8unorm', 'read-only'));

    expect(getName(sampledView)).toBe('sampledView');
    expect(getName(storageView)).toBe('storageView');
  });

  it('does not rename already named resources', () => {
    const myStruct = d.struct({ a: d.u32 }).$name('IntStruct');
    const myFunction = tgpu
      .fn([])(() => 0)
      .$name('ConstFunction');

    expect(getName(myStruct)).toBe('IntStruct');
    expect(getName(myFunction)).toBe('ConstFunction');
  });

  it('names TGPU functions', () => {
    const myFunction = tgpu.fn([])(() => 0);
    const myComputeFn = tgpu.computeFn({ workgroupSize: [1] })(() => {});
    const myVertexFn = tgpu.vertexFn({ out: { ret: d.i32 } })(() => ({ ret: 0 }));
    const myFragmentFn = tgpu.fragmentFn({
      in: { position: d.builtin.position },
      out: d.vec4f,
    })(() => d.vec4f());

    expect(getName(myFunction)).toBe('myFunction');
    expect(getName(myComputeFn)).toBe('myComputeFn');
    expect(getName(myVertexFn)).toBe('myVertexFn');
    expect(getName(myFragmentFn)).toBe('myFragmentFn');
  });

  it('autonames assignment expressions', () => {
    let layout: TgpuBindGroupLayout;
    layout = tgpu.bindGroupLayout({
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

  it('autonames class properties', ({ root }) => {
    class MyController {
      myBuffer = root.createUniform(d.u32);
    }

    const myController = new MyController();

    expect(getName(myController.myBuffer)).toBe('myBuffer');
  });

  it('autonames object member assignment', ({ root }) => {
    const items: { myBuffer: unknown } = { myBuffer: undefined };

    items.myBuffer = root.createUniform(d.u32);

    expect(getName(items.myBuffer)).toBe('myBuffer');
  });

  it('autonames this prop assignment', ({ root }) => {
    class MyController {
      myBuffer;

      constructor() {
        this.myBuffer = root.createUniform(d.u32);
      }
    }

    const myController = new MyController();

    expect(getName(myController.myBuffer)).toBe('myBuffer');
  });

  it('autonames private prop assignment', ({ root }) => {
    class MyController {
      #myBuffer;

      constructor() {
        this.#myBuffer = root.createUniform(d.u32);
      }

      get myBuffer() {
        return this.#myBuffer;
      }
    }

    const myController = new MyController();

    expect(getName(myController.myBuffer)).toBe('myBuffer');
  });
});
