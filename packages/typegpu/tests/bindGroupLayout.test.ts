import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest';
import {
  type F32,
  type TgpuArray,
  type U32,
  type Vec3f,
  arrayOf,
  f32,
  u32,
  vec3f,
} from '../src/data';
import tgpu, {
  type TgpuBindGroupLayout,
  type TgpuBuffer,
  type TgpuBufferUniform,
  type TgpuBufferReadonly,
  type TgpuBufferMutable,
} from '../src/experimental';
import './utils/webgpuGlobals';
import type { Uniform } from '../src/core/buffer/buffer';
import type { Storage } from '../src/extension';
import {
  MissingBindingError,
  type TgpuBindGroup,
  type TgpuBindGroupLayoutExperimental,
  type UnwrapRuntimeConstructor,
  bindGroupLayoutExperimental,
} from '../src/tgpuBindGroupLayout';
import { mockDevice, mockRoot } from './utils/mockRoot';
import { parseWGSL } from './utils/parseWGSL';

const DEFAULT_READONLY_VISIBILITY_FLAGS =
  GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;

describe('TgpuBindGroupLayout', () => {
  const { getRoot } = mockRoot();

  it('infers the bound type of a uniform entry', () => {
    const layout = bindGroupLayoutExperimental({
      position: { uniform: vec3f },
    });

    const { position } = layout.bound;

    expectTypeOf(position).toEqualTypeOf<TgpuBufferUniform<Vec3f>>();
  });

  it('infers the bound type of a readonly storage entry', () => {
    const layout = bindGroupLayoutExperimental({
      a: { storage: vec3f },
      b: { storage: vec3f, access: 'readonly' },
    });

    const { a, b } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferReadonly<Vec3f>>();
    expectTypeOf(b).toEqualTypeOf<TgpuBufferReadonly<Vec3f>>();
  });

  it('infers the bound type of a mutable storage entry', () => {
    const layout = bindGroupLayoutExperimental({
      a: { storage: vec3f, access: 'mutable' },
    });

    const { a } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferMutable<Vec3f>>();
  });

  it('works for entries passed as functions returning TgpuData', () => {
    const layout = bindGroupLayoutExperimental({
      a: { uniform: (arrayLength: number) => arrayOf(u32, arrayLength) },
      b: { storage: (arrayLength: number) => arrayOf(vec3f, arrayLength) },
    });

    expectTypeOf(layout).toEqualTypeOf<
      TgpuBindGroupLayoutExperimental<{
        a: {
          uniform: (_: number) => TgpuArray<U32>;
        };
        b: {
          storage: (_: number) => TgpuArray<Vec3f>;
        };
      }>
    >();

    const { a, b } = layout.bound;

    expectTypeOf(a).toEqualTypeOf<TgpuBufferUniform<TgpuArray<U32>>>();
    expectTypeOf(b).toEqualTypeOf<TgpuBufferReadonly<TgpuArray<Vec3f>>>();

    const aBuffer = getRoot().createBuffer(arrayOf(u32, 4)).$usage('uniform');
    const bBuffer = getRoot().createBuffer(arrayOf(vec3f, 4)).$usage('storage');

    const bindGroup = layout.populate({
      a: aBuffer,
      b: bBuffer,
    });

    expectTypeOf(bindGroup).toEqualTypeOf<
      TgpuBindGroup<{
        a: {
          uniform: (_: number) => TgpuArray<U32>;
        };
        b: {
          storage: (_: number) => TgpuArray<Vec3f>;
        };
      }>
    >();

    getRoot().unwrap(bindGroup);

    expect(mockDevice.createBindGroup).toBeCalledWith({
      label: '',
      layout: getRoot().unwrap(layout),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: getRoot().unwrap(aBuffer),
          },
        },
        {
          binding: 1,
          resource: {
            buffer: getRoot().unwrap(bBuffer),
          },
        },
      ],
    });

    expect(mockDevice.createBindGroupLayout).toBeCalledWith({
      label: '',
      entries: [
        {
          binding: 0,
          visibility: DEFAULT_READONLY_VISIBILITY_FLAGS,
          buffer: {
            type: 'uniform',
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

  it('omits null properties', () => {
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

    getRoot().unwrap(layout); // Creating the WebGPU resource

    expect(mockDevice.createBindGroupLayout).toBeCalledWith({
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
      input: 'fn main () { textureLoad(fooTexture); }',
      extraDependencies: { fooTexture },
      names: 'strict',
    });

    expect(parseWGSL(resolved)).toEqual(
      parseWGSL(`
      @group(0) @binding(0) var fooTexture: texture_1d<f32>;

      fn main() { textureLoad(fooTexture); }
    `),
    );
  });
});

describe('TgpuBindGroup', () => {
  const { getRoot } = mockRoot();

  describe('buffer layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: { uniform: Vec3f } }>;
    let buffer: TgpuBuffer<Vec3f> & Uniform;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { uniform: vec3f },
        })
        .$name('example');

      buffer = getRoot().createBuffer(vec3f).$usage('uniform');
    });

    it('populates a simple layout with a raw buffer', () => {
      const bindGroup = layout.populate({ foo: getRoot().unwrap(buffer) });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      getRoot().unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: getRoot().unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: getRoot().unwrap(buffer),
            },
          },
        ],
      });
    });

    it('populates a simple layout with a typed buffer', () => {
      const bindGroup = layout.populate({ foo: buffer });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      getRoot().unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: getRoot().unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: getRoot().unwrap(buffer),
            },
          },
        ],
      });
    });
  });

  describe('filtering sampler layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: { sampler: 'filtering' } }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { sampler: 'filtering' },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw sampler', () => {
      const sampler = getRoot().device.createSampler();

      const bindGroup = layout.populate({
        foo: sampler,
      });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      getRoot().unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: getRoot().unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: sampler,
          },
        ],
      });
    });
  });

  describe('texture layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: { texture: 'float' } }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { texture: 'float' },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw texture view', () => {
      const view = getRoot()
        .device.createTexture({
          format: 'rgba8unorm',
          size: [32, 32],
          usage: GPUTextureUsage.TEXTURE_BINDING,
        })
        .createView();

      const bindGroup = layout.populate({
        foo: view,
      });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      getRoot().unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: getRoot().unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: view,
          },
        ],
      });
    });
  });

  describe('storage texture layout', () => {
    let layout: TgpuBindGroupLayout<{ foo: { storageTexture: 'rgba8unorm' } }>;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          foo: { storageTexture: 'rgba8unorm' },
        })
        .$name('example');
    });

    it('populates a simple layout with a raw texture view', () => {
      const view = getRoot()
        .device.createTexture({
          format: 'rgba8unorm',
          size: [32, 32],
          usage: GPUTextureUsage.TEXTURE_BINDING,
        })
        .createView();

      const bindGroup = layout.populate({
        foo: view,
      });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      getRoot().unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: getRoot().unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: view,
          },
        ],
      });
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

    it('populates a simple layout with a raw texture view', () => {
      const externalTexture = getRoot().device.importExternalTexture({
        source: undefined as unknown as HTMLVideoElement,
      });

      const bindGroup = layout.populate({
        foo: externalTexture,
      });

      expect(mockDevice.createBindGroupLayout).not.toBeCalled();
      getRoot().unwrap(bindGroup);
      expect(mockDevice.createBindGroupLayout).toBeCalled();

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: getRoot().unwrap(layout),
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
    let aBuffer: TgpuBuffer<Vec3f> & Uniform;
    let bBuffer: TgpuBuffer<U32> & Storage;
    let dBuffer: TgpuBuffer<F32> & Storage;

    beforeEach(() => {
      layout = tgpu
        .bindGroupLayout({
          a: { uniform: vec3f },
          b: { storage: u32, access: 'mutable' },
          _: null,
          d: { storage: f32, access: 'readonly' },
        })
        .$name('example');

      aBuffer = getRoot().createBuffer(vec3f).$usage('uniform');
      bBuffer = getRoot().createBuffer(u32).$usage('storage');
      dBuffer = getRoot().createBuffer(f32).$usage('storage');
    });

    it('requires all non-null entries to be populated', () => {
      expect(() => {
        // @ts-expect-error
        const bindGroup = layout.populate({
          a: aBuffer,
          b: bBuffer,
        });
      }).toThrow(new MissingBindingError('example', 'd'));
    });

    it('creates bind group in layout-defined order, not the insertion order of the populate parameter', () => {
      const bindGroup = layout.populate({
        // purposefully out of order
        d: dBuffer,
        b: bBuffer,
        a: aBuffer,
      });

      getRoot().unwrap(bindGroup);

      expect(mockDevice.createBindGroup).toBeCalledWith({
        label: 'example',
        layout: getRoot().unwrap(layout),
        entries: [
          {
            binding: 0,
            resource: {
              buffer: getRoot().unwrap(aBuffer),
            },
          },
          {
            binding: 1,
            resource: {
              buffer: getRoot().unwrap(bBuffer),
            },
          },
          // note that binding 2 is missing, as it gets skipped on purpose by using the null prop.
          {
            binding: 3,
            resource: {
              buffer: getRoot().unwrap(dBuffer),
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
    expectTypeOf<UnwrapRuntimeConstructor<TgpuArray<Vec3f>>>().toEqualTypeOf<
      TgpuArray<Vec3f>
    >();

    expectTypeOf<
      UnwrapRuntimeConstructor<(_: number) => U32>
    >().toEqualTypeOf<U32>();
    expectTypeOf<
      UnwrapRuntimeConstructor<(_: number) => TgpuArray<Vec3f>>
    >().toEqualTypeOf<TgpuArray<Vec3f>>();

    expectTypeOf<
      UnwrapRuntimeConstructor<F32 | ((_: number) => U32)>
    >().toEqualTypeOf<F32 | U32>();
  });
});
