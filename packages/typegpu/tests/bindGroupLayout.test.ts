import { beforeEach, describe, expect, expectTypeOf } from 'vitest';
import {
  type F32,
  type TgpuArray,
  type U32,
  type Vec3f,
  type WgslArray,
  arrayOf,
  f32,
  u32,
  vec3f,
} from '../src/data';
import tgpu, {
  type TgpuBindGroupLayout,
  type TgpuBufferUniform,
  type TgpuBufferReadonly,
  type TgpuBufferMutable,
} from '../src/experimental';
import './utils/webgpuGlobals';
import {
  MissingBindingError,
  type TgpuBindGroup,
  type TgpuBindGroupLayoutExperimental,
  type UnwrapRuntimeConstructor,
  bindGroupLayoutExperimental,
} from '../src/tgpuBindGroupLayout';
import { it } from './utils/extendedIt';
import { parseWGSL } from './utils/parseWGSL';

const DEFAULT_READONLY_VISIBILITY_FLAGS =
  GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;

describe('TgpuBindGroupLayout', () => {
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

  it('works for entries passed as functions returning TgpuData', ({ root }) => {
    const layout = bindGroupLayoutExperimental({
      a: {
        storage: (arrayLength: number) => arrayOf(u32, arrayLength),
        access: 'mutable',
      },
      b: { storage: (arrayLength: number) => arrayOf(vec3f, arrayLength) },
    });

    bindGroupLayoutExperimental({
      // @ts-expect-error
      c: { uniform: (arrayLength: number) => arrayOf(vec3f, arrayLength) },
    });

    expectTypeOf(layout).toEqualTypeOf<
      TgpuBindGroupLayoutExperimental<{
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
    let layout: TgpuBindGroupLayout<{ foo: { sampler: 'filtering' } }>;

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

    it('populates a simple layout with a raw texture view', ({ root }) => {
      const view = root.device
        .createTexture({
          format: 'rgba8unorm',
          size: [32, 32],
          usage: GPUTextureUsage.TEXTURE_BINDING,
        })
        .createView();

      const bindGroup = root.createBindGroup(layout, {
        foo: view,
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

    it('populates a simple layout with a raw texture view', ({ root }) => {
      const view = root.device
        .createTexture({
          format: 'rgba8unorm',
          size: [32, 32],
          usage: GPUTextureUsage.TEXTURE_BINDING,
        })
        .createView();

      const bindGroup = root.createBindGroup(layout, {
        foo: view,
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
