import { beforeEach, describe, expect, expectTypeOf } from 'vitest';
import {
  type F32,
  type U32,
  type Vec3f,
  type Vec4f,
  type Vec4i,
  type WgslArray,
  arrayOf,
  f32,
  u32,
  vec3f,
} from '../src/data/index.ts';
import tgpu, {
  type TgpuBindGroupLayout,
  type TgpuBufferUniform,
  type TgpuBufferReadonly,
  type TgpuBufferMutable,
  type TgpuWriteonlyTexture,
  type TgpuSampledTexture,
  type TgpuMutableTexture,
} from '../src/index.ts';
import './utils/webgpuGlobals.ts';
import { comparisonSampler, sampler } from '../src/core/sampler/sampler.ts';
import {
  MissingBindingError,
  type TgpuBindGroup,
  type TgpuLayoutComparisonSampler,
  type TgpuLayoutSampler,
  type UnwrapRuntimeConstructor,
} from '../src/tgpuBindGroupLayout.ts';
import { it } from './utils/extendedIt.ts';
import { parse } from './utils/parseResolved.ts';

const DEFAULT_READONLY_VISIBILITY_FLAGS =
  GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;

describe('TgpuBindGroupLayout', () => {
  it('infers the bound type of a uniform entry', () => {
    const layout = tgpu.bindGroupLayout({
      position: { uniform: vec3f },
    });

    const { position } = layout.bound;

    expectTypeOf(position).toEqualTypeOf<TgpuBufferUniform<Vec3f>>();
  });

  it('infers the bound type of a readonly storage entry', () => {
    const layout = tgpu.bindGroupLayout({
      a: { storage: vec3f },
      b: { storage: vec3f, access: 'readonly' },
    });

    const { a, b } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferReadonly<Vec3f>>();
    expectTypeOf(b).toEqualTypeOf<TgpuBufferReadonly<Vec3f>>();
  });

  it('infers the bound type of a mutable storage entry', () => {
    const layout = tgpu.bindGroupLayout({
      a: { storage: vec3f, access: 'mutable' },
    });

    const { a } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferMutable<Vec3f>>();
  });

  it('works for entries passed as functions returning TgpuData', ({ root }) => {
    const layout = tgpu.bindGroupLayout({
      a: {
        storage: (arrayLength: number) => arrayOf(u32, arrayLength),
        access: 'mutable',
      },
      b: { storage: (arrayLength: number) => arrayOf(vec3f, arrayLength) },
    });

    tgpu.bindGroupLayout({
      // @ts-expect-error
      c: { uniform: (arrayLength: number) => arrayOf(vec3f, arrayLength) },
    });

    expectTypeOf(layout).toEqualTypeOf<
      TgpuBindGroupLayout<{
        a: {
          storage: (_: number) => WgslArray<U32>;
          access: 'mutable';
        };
        b: {
          storage: (_: number) => WgslArray<Vec3f>;
        };
      }>
    >();

    const { a, b } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferMutable<WgslArray<U32>>>();
    expectTypeOf(b).toEqualTypeOf<TgpuBufferReadonly<WgslArray<Vec3f>>>();

    const aBuffer = root.createBuffer(arrayOf(u32, 4)).$usage('storage');
    const bBuffer = root.createBuffer(arrayOf(vec3f, 4)).$usage('storage');

    const bindGroup = root.createBindGroup(layout, {
      a: aBuffer,
      b: bBuffer,
    });

    expectTypeOf(bindGroup).toEqualTypeOf<
      TgpuBindGroup<{
        a: {
          storage: (_: number) => WgslArray<U32>;
          access: 'mutable';
        };
        b: {
          storage: (_: number) => WgslArray<Vec3f>;
        };
      }>
    >();

    root.unwrap(bindGroup);

    expect(root.device.createBindGroup).toBeCalledWith({
      label: '<unnamed>',
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
      label: '<unnamed>',
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
        a: { uniform: vec3f }, // binding 0
        _0: null, // binding 1
        c: { storage: vec3f }, // binding 2
      })
      .$name('example_layout');

    expectTypeOf(layout).toEqualTypeOf<
      TgpuBindGroupLayout<{
        a: { uniform: Vec3f };
        _0: null;
        c: { storage: Vec3f };
      }>
    >();

    root.unwrap(layout); // Creating the WebGPU resource

    expect(root.device.createBindGroupLayout).toBeCalledWith({
      label: 'example_layout',
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

    expect(parse(resolved)).toEqual(
      parse(`
      @group(0) @binding(0) var fooTexture: texture_1d<f32>;

      fn main() { textureLoad(fooTexture); }
    `),
    );
  });
});

describe('TgpuBindGroup', () => {
  describe('buffer layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: { uniform: Vec3f } }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { uniform: vec3f },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw buffer', ({ root }) => {
      const buffer = root.createBuffer(vec3f).$usage('uniform');
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
      const buffer = root.createBuffer(vec3f).$usage('uniform');
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

    it('accepts filtering/non-filtering sampler when creating bind group, but not comparison', ({
      root,
    }) => {
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

    it('accepts comparison sampler when creating bind group, but not filtering/non-filtering', ({
      root,
    }) => {
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
        .$usage('sampled')
        .$name('example_texture');

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

      expectTypeOf(foo).toEqualTypeOf<TgpuSampledTexture<'2d', F32>>();
      expectTypeOf(bar).toEqualTypeOf<TgpuSampledTexture<'cube-array', F32>>();
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

    it('populates a simple layout with a typed storage texture view', ({
      root,
    }) => {
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

      expectTypeOf(foo).toEqualTypeOf<TgpuMutableTexture<'3d', Vec4f>>();
      expectTypeOf(bar).toEqualTypeOf<TgpuWriteonlyTexture<'2d', Vec4i>>();
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
      a: { uniform: Vec3f };
      b: { storage: U32; access: 'mutable' };
      _: null;
      d: { storage: F32; access: 'readonly' };
    }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          a: { uniform: vec3f },
          b: { storage: u32, access: 'mutable' },
          _: null,
          d: { storage: f32, access: 'readonly' },
        })
        .$name('example');
    });

    it('requires all non-null entries to be populated', ({ root }) => {
      const aBuffer = root.createBuffer(vec3f).$usage('uniform');
      const bBuffer = root.createBuffer(u32).$usage('storage');

      expect(() => {
        // @ts-expect-error
        const bindGroup = root.createBindGroup(layout, {
          a: aBuffer,
          b: bBuffer,
        });
      }).toThrow(new MissingBindingError('example', 'd'));
    });

    it('creates bind group in layout-defined order, not the insertion order of the populate parameter', ({
      root,
    }) => {
      const aBuffer = root.createBuffer(vec3f).$usage('uniform');
      const bBuffer = root.createBuffer(u32).$usage('storage');
      const dBuffer = root.createBuffer(f32).$usage('storage');

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
});

describe('UnwrapRuntimeConstructor', () => {
  it('unwraps return types of functions returning TgpuData', () => {
    expectTypeOf<UnwrapRuntimeConstructor<U32>>().toEqualTypeOf<U32>();
    expectTypeOf<UnwrapRuntimeConstructor<WgslArray<Vec3f>>>().toEqualTypeOf<
      WgslArray<Vec3f>
    >();

    expectTypeOf<
      UnwrapRuntimeConstructor<(_: number) => U32>
    >().toEqualTypeOf<U32>();
    expectTypeOf<
      UnwrapRuntimeConstructor<(_: number) => WgslArray<Vec3f>>
    >().toEqualTypeOf<WgslArray<Vec3f>>();

    expectTypeOf<
      UnwrapRuntimeConstructor<F32 | ((_: number) => U32)>
    >().toEqualTypeOf<F32 | U32>();
  });
});
