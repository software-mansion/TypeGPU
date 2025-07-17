import { beforeEach, describe, expect, expectTypeOf } from 'vitest';
import { comparisonSampler, sampler } from '../src/core/sampler/sampler.ts';
import * as d from '../src/data/index.ts';
import tgpu, {
  type TgpuBindGroupLayout,
  type TgpuBuffer,
  type TgpuBufferMutable,
  type TgpuBufferReadonly,
  type TgpuBufferUniform,
  type TgpuMutableTexture,
  type TgpuSampledTexture,
  type TgpuWriteonlyTexture,
  type UniformFlag,
} from '../src/index.ts';
import { getName } from '../src/shared/meta.ts';
import {
  type ExtractBindGroupInputFromLayout,
  MissingBindingError,
  type TgpuBindGroup,
  type TgpuLayoutComparisonSampler,
  type TgpuLayoutSampler,
  type UnwrapRuntimeConstructor,
} from '../src/tgpuBindGroupLayout.ts';
import { it } from './utils/extendedIt.ts';
import { parse } from './utils/parseResolved.ts';
import './utils/webgpuGlobals.ts';

const DEFAULT_READONLY_VISIBILITY_FLAGS = GPUShaderStage.COMPUTE |
  GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;

describe('TgpuBindGroupLayout', () => {
  it('names bound elements', () => {
    const layout = tgpu.bindGroupLayout({
      uniBuffer: { uniform: d.vec3f },
      stoBuffer: { storage: d.vec3f },
      defTexture: { texture: 'depth' },
      stoTexture: { storageTexture: 'bgra8unorm' },
      extTexture: { externalTexture: {} },
      compSampler: { sampler: 'comparison' },
      filtSampler: { sampler: 'filtering' },
    });

    expect(getName(layout.bound.uniBuffer)).toBe('uniBuffer');
    expect(getName(layout.bound.stoBuffer)).toBe('stoBuffer');
    expect(getName(layout.bound.defTexture)).toBe('defTexture');
    expect(getName(layout.bound.stoTexture)).toBe('stoTexture');
    expect(getName(layout.bound.extTexture)).toBe('extTexture');
    expect(getName(layout.bound.compSampler)).toBe('compSampler');
    expect(getName(layout.bound.filtSampler)).toBe('filtSampler');
  });

  it('infers the bound type of a uniform entry', () => {
    const layout = tgpu.bindGroupLayout({
      position: { uniform: d.vec3f },
    });

    const { position } = layout.bound;

    expectTypeOf(position).toEqualTypeOf<TgpuBufferUniform<d.Vec3f>>();
  });

  it('infers the bound type of a readonly storage entry', () => {
    const layout = tgpu.bindGroupLayout({
      a: { storage: d.vec3f },
      b: { storage: d.vec3f, access: 'readonly' },
    });

    const { a, b } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferReadonly<d.Vec3f>>();
    expectTypeOf(b).toEqualTypeOf<TgpuBufferReadonly<d.Vec3f>>();
  });

  it('infers the bound type of a mutable storage entry', () => {
    const layout = tgpu.bindGroupLayout({
      a: { storage: d.vec3f, access: 'mutable' },
    });

    const { a } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferMutable<d.Vec3f>>();
  });

  it('works for entries passed as functions returning TgpuData', ({ root }) => {
    const layout = tgpu.bindGroupLayout({
      a: {
        storage: (arrayLength: number) => d.arrayOf(d.u32, arrayLength),
        access: 'mutable',
      },
      b: { storage: (arrayLength: number) => d.arrayOf(d.vec3f, arrayLength) },
    });

    tgpu.bindGroupLayout({
      // @ts-expect-error
      c: { uniform: (arrayLength: number) => d.arrayOf(d.vec3f, arrayLength) },
    });

    expectTypeOf(layout).toEqualTypeOf<
      TgpuBindGroupLayout<{
        a: {
          storage: (_: number) => d.WgslArray<d.U32>;
          access: 'mutable';
        };
        b: {
          storage: (_: number) => d.WgslArray<d.Vec3f>;
        };
      }>
    >();

    const { a, b } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferMutable<d.WgslArray<d.U32>>>();
    expectTypeOf(b).toEqualTypeOf<TgpuBufferReadonly<d.WgslArray<d.Vec3f>>>();

    const aBuffer = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('storage');
    const bBuffer = root.createBuffer(d.arrayOf(d.vec3f, 4)).$usage('storage');

    const bindGroup = root.createBindGroup(layout, {
      a: aBuffer,
      b: bBuffer,
    });

    expectTypeOf(bindGroup).toEqualTypeOf<
      TgpuBindGroup<{
        a: {
          storage: (_: number) => d.WgslArray<d.U32>;
          access: 'mutable';
        };
        b: {
          storage: (_: number) => d.WgslArray<d.Vec3f>;
        };
      }>
    >();

    root.unwrap(bindGroup);

    expect(root.device.createBindGroup).toBeCalledWith({
      label: 'layout',
      layout: root.unwrap(layout),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: root.unwrap(aBuffer),
          },
        },
        {
          binding: 1,
          resource: {
            buffer: root.unwrap(bBuffer),
          },
        },
      ],
    });

    expect(root.device.createBindGroupLayout).toBeCalledWith({
      label: 'layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: {
            type: 'storage',
          },
        },
        {
          binding: 1,
          visibility: DEFAULT_READONLY_VISIBILITY_FLAGS,
          buffer: {
            type: 'read-only-storage',
          },
        },
      ],
    });
  });

  it('omits null properties', ({ root }) => {
    const layout = tgpu
      .bindGroupLayout({
        a: { uniform: d.vec3f }, // binding 0
        _0: null, // binding 1
        c: { storage: d.vec3f }, // binding 2
      });

    expectTypeOf(layout).toEqualTypeOf<
      TgpuBindGroupLayout<{
        a: { uniform: d.Vec3f };
        _0: null;
        c: { storage: d.Vec3f };
      }>
    >();

    root.unwrap(layout); // Creating the WebGPU resource

    expect(root.device.createBindGroupLayout).toBeCalledWith({
      label: 'layout',
      entries: [
        {
          binding: 0,
          visibility: DEFAULT_READONLY_VISIBILITY_FLAGS,
          buffer: {
            type: 'uniform',
          },
        },
        {
          binding: 2,
          visibility: DEFAULT_READONLY_VISIBILITY_FLAGS,
          buffer: {
            type: 'read-only-storage',
          },
        },
      ],
    });
  });

  it('resolves textures to valid WGSL code', () => {
    const layout = tgpu.bindGroupLayout({
      fooTexture: { texture: 'float', viewDimension: '1d' },
    });

    const fooTexture = layout.bound.fooTexture;

    const resolved = tgpu.resolve({
      template: 'fn main () { textureLoad(fooTexture); }',
      externals: { fooTexture },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
      @group(0) @binding(0) var fooTexture: texture_1d<f32>;

      fn main() { textureLoad(fooTexture); }
    `),
    );
  });
});

describe('TgpuBindGroup', () => {
  describe('buffer layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: { uniform: d.Vec3f } }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { uniform: d.vec3f },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw buffer', ({ root }) => {
      const buffer = root.createBuffer(d.vec3f).$usage('uniform');
      const bindGroup = root.createBindGroup(layout, {
        foo: root.unwrap(buffer),
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: root.unwrap(buffer),
            },
          },
        ],
      });
    });

    it('populates a simple layout with a typed buffer', ({ root }) => {
      const buffer = root.createBuffer(d.vec3f).$usage('uniform');
      const bindGroup = root.createBindGroup(layout, { foo: buffer });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: root.unwrap(buffer),
            },
          },
        ],
      });
    });
  });

  describe('simple layout with atomics', () => {
    let layout: TgpuBindGroupLayout<{
      foo: { uniform: d.U32 };
      bar: { uniform: d.WgslArray<d.I32> };
      baz: { storage: d.WgslStruct<{ a: d.U32; b: d.I32 }> };
      qux: { storage: (n: number) => d.WgslArray<d.I32> };
    }>;
    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { uniform: d.u32 },
          bar: { uniform: d.arrayOf(d.i32, 4) },
          baz: { storage: d.struct({ a: d.u32, b: d.i32 }) },
          qux: { storage: (n: number) => d.arrayOf(d.i32, n) },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw buffer', ({ root }) => {
      const scalarBuffer = root.createBuffer(d.u32).$usage('uniform');
      const arrayBuffer = root.createBuffer(d.arrayOf(d.i32, 4)).$usage(
        'storage',
      );
      const structBuffer = root
        .createBuffer(d.struct({ a: d.u32, b: d.i32 }))
        .$usage('uniform');
      const runtimeArrayBuffer = root
        .createBuffer(d.arrayOf(d.i32, 4))
        .$usage('storage');
      const bindGroup = root.createBindGroup(layout, {
        foo: root.unwrap(scalarBuffer),
        bar: root.unwrap(arrayBuffer),
        baz: root.unwrap(structBuffer),
        qux: root.unwrap(runtimeArrayBuffer),
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: root.unwrap(scalarBuffer),
            },
          },
          {
            binding: 1,
            resource: {
              buffer: root.unwrap(arrayBuffer),
            },
          },
          {
            binding: 2,
            resource: {
              buffer: root.unwrap(structBuffer),
            },
          },
          {
            binding: 3,
            resource: {
              buffer: root.unwrap(runtimeArrayBuffer),
            },
          },
        ],
      });
    });

    it('populates a simple layout with an atomic version of a primitive buffer', ({ root }) => {
      const atomicScalarBuffer = root.createBuffer(d.atomic(d.u32)).$usage(
        'uniform',
      );
      const atomicArrayBuffer = root
        .createBuffer(d.arrayOf(d.atomic(d.i32), 4))
        .$usage('uniform');
      const atomicStructBuffer = root
        .createBuffer(d.struct({ a: d.atomic(d.u32), b: d.atomic(d.i32) }))
        .$usage('storage');
      const atomicRuntimeArrayBuffer = root
        .createBuffer(d.arrayOf(d.atomic(d.i32), 4))
        .$usage('storage');
      const bindGroup = root.createBindGroup(layout, {
        foo: atomicScalarBuffer,
        bar: atomicArrayBuffer,
        baz: atomicStructBuffer,
        qux: atomicRuntimeArrayBuffer,
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: root.unwrap(atomicScalarBuffer),
            },
          },
          {
            binding: 1,
            resource: {
              buffer: root.unwrap(atomicArrayBuffer),
            },
          },
          {
            binding: 2,
            resource: {
              buffer: root.unwrap(atomicStructBuffer),
            },
          },
          {
            binding: 3,
            resource: {
              buffer: root.unwrap(atomicRuntimeArrayBuffer),
            },
          },
        ],
      });
    });
  });

  describe('filtering sampler layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: TgpuLayoutSampler }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { sampler: 'filtering' },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw sampler', ({ root }) => {
      const sampler = root.device.createSampler();

      const bindGroup = root.createBindGroup(layout, {
        foo: sampler,
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: sampler,
          },
        ],
      });
    });

    it('populates a simple layout with a typed sampler', ({ root }) => {
      const sampler = tgpu['~unstable'].sampler({
        magFilter: 'linear',
        minFilter: 'linear',
      });

      const bindGroup = root.createBindGroup(layout, {
        foo: sampler,
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: root.unwrap(sampler),
          },
        ],
      });
    });

    it('accepts filtering/non-filtering sampler when creating bind group, but not comparison', ({ root }) => {
      root.createBindGroup(layout, {
        foo: sampler({ minFilter: 'linear' }),
      });

      root.createBindGroup(layout, {
        foo: sampler({ minFilter: 'nearest' }),
      });

      root.createBindGroup(layout, {
        foo: root.device.createSampler(),
      });

      root.createBindGroup(layout, {
        // @ts-expect-error
        foo: comparisonSampler({ compare: 'less' }),
      });
    });
  });

  describe('comparison sampler layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: TgpuLayoutComparisonSampler }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { sampler: 'comparison' },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw sampler', ({ root }) => {
      const sampler = root.device.createSampler();

      const bindGroup = root.createBindGroup(layout, {
        foo: sampler,
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: sampler,
          },
        ],
      });
    });

    it('populates a simple layout with a typed sampler', ({ root }) => {
      const sampler = tgpu['~unstable'].comparisonSampler({
        compare: 'equal',
      });

      const bindGroup = root.createBindGroup(layout, {
        foo: sampler,
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: root.unwrap(sampler),
          },
        ],
      });
    });

    it('accepts comparison sampler when creating bind group, but not filtering/non-filtering', ({ root }) => {
      root.createBindGroup(layout, {
        foo: comparisonSampler({ compare: 'equal' }),
      });

      root.createBindGroup(layout, {
        foo: root.device.createSampler(),
      });

      root.createBindGroup(layout, {
        // @ts-expect-error
        foo: sampler({ minFilter: 'linear' }),
      });

      root.createBindGroup(layout, {
        // @ts-expect-error
        foo: sampler({ minFilter: 'nearest' }),
      });
    });
  });

  describe('texture layout', () => {
    let layout2d: TgpuBindGroupLayout<{ foo: { texture: 'float' } }>;
    let layout3d: TgpuBindGroupLayout<{
      foo: { texture: 'float'; viewDimension: '3d' };
    }>;
    let layoutCube: TgpuBindGroupLayout<{
      foo: { texture: 'float'; viewDimension: 'cube' };
    }>;

    beforeEach(() => {
      layout2d = tgpu
        .bindGroupLayout({
          foo: { texture: 'float' },
        })
        .$name('example');
      layout3d = tgpu
        .bindGroupLayout({
          foo: { texture: 'float', viewDimension: '3d' },
        })
        .$name('example');
      layoutCube = tgpu
        .bindGroupLayout({
          foo: { texture: 'float', viewDimension: 'cube' },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw texture view', ({ root }) => {
      const view = root.device
        .createTexture({
          format: 'rgba8unorm',
          size: [32, 32],
          usage: GPUTextureUsage.TEXTURE_BINDING,
        })
        .createView();

      const bindGroup = root.createBindGroup(layout2d, {
        foo: view,
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout2d),
        entries: [
          {
            binding: 0,
            resource: view,
          },
        ],
      });
    });

    it('populates a simple layout with a typed texture', ({ root }) => {
      const texture = root
        .createTexture({
          size: [32, 128],
          format: 'rgba8unorm',
        })
        .$usage('sampled');

      const bindGroup = root.createBindGroup(layout2d, {
        foo: texture,
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout2d),
        entries: [
          {
            binding: 0,
            resource: 'view',
          },
        ],
      });
    });

    it('populates a simple layout with a typed texture view', ({ root }) => {
      const texture = root
        .createTexture({
          dimension: '2d',
          size: [1024, 1024, 6],
          format: 'rgba8unorm',
        })
        .$usage('sampled');

      const bindGroup = root.createBindGroup(layoutCube, {
        foo: texture.createView('sampled', {
          dimension: 'cube',
        }),
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layoutCube),
        entries: [
          {
            binding: 0,
            resource: 'view',
          },
        ],
      });
    });

    it('rejects typed textures of incorrect type', ({ root }) => {
      const texture = root
        .createTexture({
          size: [64, 64],
          format: 'r16uint',
        })
        .$usage('sampled');

      const texture3d = root
        .createTexture({
          size: [64, 64, 64],
          format: 'rgba8unorm',
          dimension: '3d',
        })
        .$usage('sampled');

      const textureControl = root
        .createTexture({
          size: [64, 64],
          format: 'rgba8unorm',
        })
        .$usage('sampled');

      root.createBindGroup(layout2d, {
        // @ts-expect-error - incompatible format
        foo: texture,
      });

      root.createBindGroup(layout2d, {
        // @ts-expect-error - incompatible dimension
        foo: texture3d,
      });

      root.createBindGroup(layout2d, {
        foo: textureControl,
      });

      root.createBindGroup(layout3d, {
        // @ts-expect-error - incompatible dimension
        foo: texture,
      });

      root.createBindGroup(layout3d, {
        foo: texture3d,
      });
    });

    it('properly fill the bound property', () => {
      const layout = tgpu.bindGroupLayout({
        foo: { texture: 'float', viewDimension: '2d', mipLevelCount: 1 },
        bar: { texture: 'unfilterable-float', viewDimension: 'cube-array' },
      });

      const { foo, bar } = layout.bound;

      expectTypeOf(foo).toEqualTypeOf<TgpuSampledTexture<'2d', d.F32>>();
      expectTypeOf(bar).toEqualTypeOf<
        TgpuSampledTexture<'cube-array', d.F32>
      >();
    });
  });

  describe('storage texture layout', () => {
    let layout3d: TgpuBindGroupLayout<{
      foo: {
        storageTexture: 'rgba8unorm';
        viewDimension: '3d';
        access: 'readonly' | 'writeonly';
      };
    }>;

    let layout2d: TgpuBindGroupLayout<{
      foo: {
        storageTexture: 'rgba8unorm';
        viewDimension: '2d-array';
      };
    }>;

    beforeEach(() => {
      layout3d = tgpu
        .bindGroupLayout({
          foo: {
            storageTexture: 'rgba8unorm',
            viewDimension: '3d',
            access: 'readonly',
          },
        })
        .$name('example');
      layout2d = tgpu
        .bindGroupLayout({
          foo: {
            storageTexture: 'rgba8unorm',
            viewDimension: '2d-array',
          },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw texture view', ({ root }) => {
      const view = root.device
        .createTexture({
          format: 'rgba8unorm',
          size: [32, 32],
          usage: GPUTextureUsage.TEXTURE_BINDING,
        })
        .createView();

      const bindGroup = root.createBindGroup(layout3d, {
        foo: view,
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout3d),
        entries: [
          {
            binding: 0,
            resource: view,
          },
        ],
      });
    });

    it('populates a simple layout with a typed storage texture', ({ root }) => {
      const texture = root
        .createTexture({
          size: [32, 32],
          format: 'rgba8unorm',
          dimension: '3d',
        })
        .$usage('storage');

      const bindGroup = root.createBindGroup(layout3d, {
        foo: texture,
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout3d),
        entries: [
          {
            binding: 0,
            resource: 'view',
          },
        ],
      });
    });

    it('populates a simple layout with a typed storage texture view', ({ root }) => {
      const texture = root
        .createTexture({
          size: [32, 32, 32],
          format: 'rgba8unorm',
          dimension: '3d',
        })
        .$usage('storage');

      const bindGroup = root.createBindGroup(layout3d, {
        foo: texture.createView('writeonly', {
          dimension: '3d',
          mipLevelCount: 1,
        }),
      });

      root.createBindGroup(layout3d, {
        // @ts-expect-error - invalid access
        foo: texture.createView('mutable', {
          dimension: '3d',
        }),
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout3d),
        entries: [
          {
            binding: 0,
            resource: 'view',
          },
        ],
      });
    });

    it('rejects typed storage textures of incorrect type', ({ root }) => {
      const texture2d = root
        .createTexture({
          size: [64, 64],
          format: 'rgba8unorm',
          dimension: '2d',
        })
        .$usage('storage');

      const texture3d = root
        .createTexture({
          size: [64, 64, 64],
          format: 'rgba8unorm',
          dimension: '3d',
        })
        .$usage('storage');

      const texture1d = root
        .createTexture({
          size: [64],
          format: 'rgba8snorm',
          dimension: '1d',
        })
        .$usage('storage');

      root.createBindGroup(layout3d, {
        // @ts-expect-error - incompatible dimension
        foo: texture2d,
      });

      root.createBindGroup(layout3d, {
        // @ts-expect-error - incompatible dimension and format
        foo: texture1d,
      });

      root.createBindGroup(layout3d, {
        foo: texture3d,
      });

      root.createBindGroup(layout2d, {
        // @ts-expect-error - incompatible dimension
        foo: texture3d,
      });

      root.createBindGroup(layout2d, {
        // @ts-expect-error - incompatible dimension and format
        foo: texture1d,
      });

      root.createBindGroup(layout2d, {
        foo: texture2d,
      });
    });

    it('properly fill the bound property', () => {
      const layout = tgpu.bindGroupLayout({
        foo: {
          storageTexture: 'rgba8unorm',
          viewDimension: '3d',
          access: 'mutable',
        },
        bar: {
          storageTexture: 'rg32sint',
          viewDimension: '2d-array',
        },
      });

      const { foo, bar } = layout.bound;

      expectTypeOf(foo).toEqualTypeOf<TgpuMutableTexture<'3d', d.Vec4f>>();
      expectTypeOf(bar).toEqualTypeOf<TgpuWriteonlyTexture<'2d', d.Vec4i>>();
    });
  });

  describe('external texture layout', () => {
    let layout: TgpuBindGroupLayout<{
      foo: { externalTexture: Record<string, never> };
    }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { externalTexture: {} },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw texture view', ({ root }) => {
      const externalTexture = root.device.importExternalTexture({
        source: undefined as unknown as HTMLVideoElement,
      });

      const bindGroup = root.createBindGroup(layout, {
        foo: externalTexture,
      });

      expect(root.device.createBindGroupLayout).not.toBeCalled();
      root.unwrap(bindGroup);
      expect(root.device.createBindGroupLayout).toBeCalled();

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: externalTexture,
          },
        ],
      });
    });
  });

  describe('multiple-entry layout', () => {
    let layout: TgpuBindGroupLayout<{
      a: { uniform: d.Vec3f };
      b: { storage: d.U32; access: 'mutable' };
      _: null;
      d: { storage: d.F32; access: 'readonly' };
    }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          a: { uniform: d.vec3f },
          b: { storage: d.u32, access: 'mutable' },
          _: null,
          d: { storage: d.f32, access: 'readonly' },
        })
        .$name('example');
    });

    it('requires all non-null entries to be populated', ({ root }) => {
      const aBuffer = root.createBuffer(d.vec3f).$usage('uniform');
      const bBuffer = root.createBuffer(d.u32).$usage('storage');

      expect(() => {
        // @ts-expect-error
        const bindGroup = root.createBindGroup(layout, {
          a: aBuffer,
          b: bBuffer,
        });
      }).toThrow(new MissingBindingError('example', 'd'));
    });

    it('creates bind group in layout-defined order, not the insertion order of the populate parameter', ({ root }) => {
      const aBuffer = root.createBuffer(d.vec3f).$usage('uniform');
      const bBuffer = root.createBuffer(d.u32).$usage('storage');
      const dBuffer = root.createBuffer(d.f32).$usage('storage');

      const bindGroup = root.createBindGroup(layout, {
        // purposefully out of order
        d: dBuffer,
        b: bBuffer,
        a: aBuffer,
      });

      root.unwrap(bindGroup);

      expect(root.device.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: root.unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: root.unwrap(aBuffer),
            },
          },
          {
            binding: 1,
            resource: {
              buffer: root.unwrap(bBuffer),
            },
          },
          // note that binding 2 is missing, as it gets skipped on purpose by using the null prop.
          {
            binding: 3,
            resource: {
              buffer: root.unwrap(dBuffer),
            },
          },
        ],
      });
    });
  });

  describe('wide type', () => {
    it('accepts wide buffer', ({ root }) => {
      const layout = tgpu.bindGroupLayout({}) as TgpuBindGroupLayout;
      const buffer = root.createBuffer(d.f32) as TgpuBuffer<d.AnyWgslData>;

      root.createBindGroup(layout, {
        foo: buffer,
      });
    });

    it('accepts wide uniform buffer', ({ root }) => {
      const layout = tgpu.bindGroupLayout({}) as TgpuBindGroupLayout;

      const buffer = root.createBuffer(d.f32).$usage('uniform') as
        & TgpuBuffer<d.AnyWgslData>
        & UniformFlag;

      root.createBindGroup(layout, {
        foo: buffer,
      });
    });

    it('allows to write generic function implementations', ({ root }) => {
      function fooLib() {
        const fooBuffer = root.createBuffer(d.f32).$usage('uniform');

        function createGroupWithFoo<T extends { foo: { uniform: d.F32 } }>(
          layout: TgpuBindGroupLayout<T>,
          rest: Omit<ExtractBindGroupInputFromLayout<T>, 'foo'>,
        ) {
          return root.createBindGroup(
            layout,
            { ...rest, foo: fooBuffer } as ExtractBindGroupInputFromLayout<T>,
          );
        }

        return {
          createGroupWithFoo,
        };
      }

      const { createGroupWithFoo } = fooLib();

      const layout = tgpu.bindGroupLayout({
        custom: { storage: d.u32, access: 'readonly' },
        foo: { uniform: d.f32 }, // required by the library
      });

      const customBuffer = root.createBuffer(d.u32).$usage('storage');

      // the library fulfills the `foo` resource
      const group = createGroupWithFoo(layout, { custom: customBuffer });
    });
  });
});

describe('UnwrapRuntimeConstructor', () => {
  it('unwraps return types of functions returning TgpuData', () => {
    expectTypeOf<UnwrapRuntimeConstructor<d.U32>>().toEqualTypeOf<d.U32>();
    expectTypeOf<UnwrapRuntimeConstructor<d.WgslArray<d.Vec3f>>>()
      .toEqualTypeOf<d.WgslArray<d.Vec3f>>();
    expectTypeOf<
      UnwrapRuntimeConstructor<(_: number) => d.WgslArray<d.Vec3f>>
    >().toEqualTypeOf<d.WgslArray<d.Vec3f>>();

    expectTypeOf<
      UnwrapRuntimeConstructor<d.F32 | ((_: number) => d.U32)>
    >().toEqualTypeOf<d.F32 | d.U32>();
  });
});
