import { describe, expect, expectTypeOf, vi } from 'vitest';
import { matchUpVaryingLocations } from '../src/core/pipeline/renderPipeline.ts';
import type { TgpuQuerySet } from '../src/core/querySet/querySet.ts';
import * as d from '../src/data/index.ts';
import tgpu, {
  MissingBindGroupsError,
  type TgpuFragmentFnShell,
  type TgpuRenderPipeline,
  type TgpuVertexFnShell,
} from '../src/index.ts';
import { $internal } from '../src/shared/symbols.ts';
import { it } from './utils/extendedIt.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('TgpuRenderPipeline', () => {
  const vert = tgpu['~unstable'].vertexFn({
    out: { a: d.vec3f, b: d.vec2f },
  })`{ return Out(); }`;
  const vertWithBuiltin = tgpu['~unstable'].vertexFn({
    out: { a: d.vec3f, b: d.vec2f, pos: d.builtin.position },
  })`{ return Out(); }`;

  it('allows fragment functions to use a subset of the vertex output', ({ root }) => {
    const emptyFragment = tgpu['~unstable'].fragmentFn({ in: {}, out: {} })`{}`;
    const emptyFragmentWithBuiltin = tgpu['~unstable'].fragmentFn({
      in: { pos: d.builtin.frontFacing },
      out: {},
    })`{}`;
    const fullFragment = tgpu['~unstable'].fragmentFn({
      in: { a: d.vec3f, b: d.vec2f },
      out: d.vec4f,
    })`{ return vec4f(); }`;

    // Using none
    const pipeline = root
      .withVertex(vert, {})
      .withFragment(emptyFragment, {})
      .createPipeline();

    // Using none (builtins are erased from the vertex output)
    const pipeline2 = root
      .withVertex(vertWithBuiltin, {})
      .withFragment(emptyFragment, {})
      .createPipeline();

    // Using none (builtins are ignored in the fragment input)
    const pipeline3 = root
      .withVertex(vert, {})
      .withFragment(emptyFragmentWithBuiltin, {})
      .createPipeline();

    // Using none (builtins are ignored in both input and output,
    // so their conflict of the `pos` key is fine)
    const pipeline4 = root
      .withVertex(vertWithBuiltin, {})
      .withFragment(emptyFragmentWithBuiltin, {})
      .createPipeline();

    // Using all
    const pipeline5 = root
      .withVertex(vert, {})
      .withFragment(fullFragment, { format: 'rgba8unorm' })
      .createPipeline();

    expect(pipeline).toBeDefined();
    expect(pipeline2).toBeDefined();
    expect(pipeline3).toBeDefined();
    expect(pipeline4).toBeDefined();
    expect(pipeline5).toBeDefined();
  });

  it('rejects fragment functions that use non-existent vertex output', ({ root }) => {
    const fragment = tgpu['~unstable'].fragmentFn({
      in: { a: d.vec3f, c: d.f32 },
      out: {},
    })('');

    // @ts-expect-error: Missing from vertex output
    root.withVertex(vert, {}).withFragment(fragment, {}).createPipeline();
  });

  it('rejects fragment functions that use mismatched vertex output data types', ({ root }) => {
    const fragment = tgpu['~unstable'].fragmentFn({
      in: { a: d.vec3f, b: d.f32 },
      out: {},
    })('');

    // @ts-expect-error: Mismatched vertex output
    root.withVertex(vert, {}).withFragment(fragment, {}).createPipeline();
  });

  it('throws an error if bind groups are missing', ({ root }) => {
    const utgpu = tgpu['~unstable'];

    const layout = tgpu.bindGroupLayout({ alpha: { uniform: d.f32 } });

    const vertexFn = utgpu
      .vertexFn({ out: { pos: d.builtin.position } })(
        '() { layout.bound.alpha; }',
      )
      .$uses({ layout });

    const fragmentFn = utgpu.fragmentFn({ out: { out: d.vec4f } })('() {}');

    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { out: { format: 'rgba8unorm' } })
      .createPipeline()
      // biome-ignore lint/suspicious/noExplicitAny: <not testing color attachment at this time>
      .withColorAttachment({ out: {} } as any);

    expect(() => pipeline.draw(6)).toThrowError(
      new MissingBindGroupsError([layout]),
    );

    expect(() => pipeline.draw(6)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Missing bind groups for layouts: 'layout'. Please provide it using pipeline.with(layout, bindGroup).(...)]`,
    );
  });

  it('allows to omit input in entry function shell', () => {
    expectTypeOf(
      tgpu['~unstable'].vertexFn({ in: {}, out: { pos: d.builtin.position } }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuVertexFnShell<{}, { pos: d.BuiltinPosition }>>();

    expectTypeOf(
      tgpu['~unstable'].vertexFn({ out: { pos: d.builtin.position } }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuVertexFnShell<{}, { pos: d.BuiltinPosition }>>();

    expectTypeOf(
      tgpu['~unstable'].fragmentFn({ in: {}, out: {} }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuFragmentFnShell<{}, {}>>();

    expectTypeOf(
      tgpu['~unstable'].fragmentFn({ out: {} }),
      // biome-ignore lint/complexity/noBannedTypes: it's fine
    ).toEqualTypeOf<TgpuFragmentFnShell<{}, {}>>();
  });

  describe('resolve', () => {
    it('allows resolving the entire shader code', ({ root }) => {
      const pipeline = root['~unstable'].withVertex(
        vertWithBuiltin.$name('vertex'),
        {},
      )
        .withFragment(
          tgpu['~unstable'].fragmentFn({
            in: { a: d.builtin.position },
            out: d.vec4f,
          })(() => d.vec4f(1, 2, 3, 4)).$name('fragment'),
          { format: 'r8unorm' },
        ).createPipeline();

      expect(parseResolved({ pipeline })).toEqual(parse(`
        struct vertex_Output { 
          @location(0) a: vec3f,
          @location(1) b: vec2f,
          @builtin(position) pos: vec4f,
        } 
          
        @vertex fn vertex() -> vertex_Output {
          return vertex_Output();
        }
        
        struct fragment_Input { 
          @builtin(position) a: vec4f,
        }
        
        @fragment fn fragment(_arg_0: fragment_Input) -> @location(0) vec4f { 
          return vec4f(1, 2, 3, 4); 
        }
      `));
    });

    it('resolves with correct locations when pairing up a vertex and a fragment function', ({ root }) => {
      const vertexMain = tgpu['~unstable']
        .vertexFn({
          out: {
            foo: d.vec3f,
            bar: d.vec3f,
            baz: d.location(0, d.vec3f),
            baz2: d.location(5, d.f32),
            baz3: d.u32,
            pos: d.builtin.position,
          },
        })(() => ({
          foo: d.vec3f(),
          bar: d.vec3f(),
          baz: d.vec3f(),
          baz2: 0,
          baz3: 0,
          pos: d.vec4f(),
        }))
        .$name('vertexMain');

      const fragmentMain = tgpu['~unstable']
        .fragmentFn({
          in: {
            baz3: d.u32,
            bar: d.vec3f,
            foo: d.location(2, d.vec3f),
            baz2: d.f32,
          },
          out: d.vec4f,
        })(() => d.vec4f());

      const pipeline = root['~unstable']
        .withVertex(vertexMain, {})
        .withFragment(fragmentMain, { format: 'r8unorm' })
        .createPipeline();

      expect(parseResolved({ pipeline })).toStrictEqual(parse(`
        struct vertexMain_Output {
          @location(2) foo: vec3f,
          @location(1) bar: vec3f,
          @location(0) baz: vec3f,
          @location(5) baz2: f32,
          @location(3) baz3: u32,
          @builtin(position) pos: vec4f,
        }

        @vertex fn vertexMain() -> vertexMain_Output {
          return vertexMain_Output(vec3f(), vec3f(), vec3f(), 0, 0, vec4f());
        }

        struct fragmentMain_Input {
          @location(3) baz3: u32,
          @location(1) bar: vec3f,
          @location(2) foo: vec3f,
          @location(5) baz2: f32,
        }

        @fragment fn fragmentMain(_arg_0: fragmentMain_Input) -> @location(0) vec4f {
          return vec4f();
        }
      `));
    });

    it('resolves with correct locations when pairing up a vertex and a fragment function with rawFn implementation', ({ root }) => {
      const vertexMain = tgpu['~unstable']
        .vertexFn({
          out: {
            foo: d.vec3f,
            bar: d.vec3f,
            position: d.builtin.position,
            baz: d.location(0, d.vec3f),
            baz2: d.location(5, d.f32),
            baz3: d.u32,
          },
        })`{ return Out(); }`;

      const fragmentMain = tgpu['~unstable']
        .fragmentFn({
          in: {
            position: d.builtin.position,
            baz3: d.u32,
            bar: d.vec3f,
            foo: d.location(2, d.vec3f),
            baz2: d.f32,
          },
          out: d.vec4f,
        })`{ return vec4f(); }`;

      const pipeline = root['~unstable']
        .withVertex(vertexMain, {})
        .withFragment(fragmentMain, { format: 'r8unorm' })
        .createPipeline();

      expect(parseResolved({ pipeline })).toStrictEqual(parse(`
        struct vertexMain_Output {
          @location(2) foo: vec3f,
          @location(1) bar: vec3f,
          @builtin(position) position: vec4f,
          @location(0) baz: vec3f,
          @location(5) baz2: f32,
          @location(3) baz3: u32,
        }

        @vertex fn vertexMain() -> vertexMain_Output {
          return vertexMain_Output();
        }

        struct fragmentMain_Input {
          @builtin(position) position: vec4f,
          @location(3) baz3: u32,
          @location(1) bar: vec3f,
          @location(2) foo: vec3f,
          @location(5) baz2: f32,
        }

        @fragment fn fragmentMain(in: fragmentMain_Input) -> @location(0) vec4f {
          return vec4f();
        }
      `));
    });

    it('logs warning when resolving pipeline having vertex and fragment functions with conflicting user-defined locations', ({ root }) => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(
        () => {},
      );

      const vertexMain = tgpu['~unstable']
        .vertexFn({
          out: {
            foo: d.vec3f,
            bar: d.location(0, d.vec3f),
          },
        })(() => ({
          foo: d.vec3f(),
          bar: d.vec3f(),
        }));

      const fragmentMain = tgpu['~unstable']
        .fragmentFn({
          in: {
            bar: d.location(1, d.vec3f),
          },
          out: d.vec4f,
        })(() => d.vec4f());

      const pipeline = root['~unstable']
        .withVertex(vertexMain, {})
        .withFragment(fragmentMain, { format: 'r8unorm' })
        .createPipeline();

      tgpu.resolve({ externals: { pipeline } });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Mismatched location between vertexFn (vertexMain) output (0) and fragmentFn (fragmentMain) input (1) for the key "bar", using the location set on vertex output.',
      );
    });

    it('does not log warning when resolving pipeline having vertex and fragment functions with non-conflicting user-defined locations', ({ root }) => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(
        () => {},
      );

      const vertexMain = tgpu['~unstable']
        .vertexFn({
          out: {
            foo: d.vec3f,
            bar: d.location(0, d.vec3f),
          },
        })(() => ({
          foo: d.vec3f(),
          bar: d.vec3f(),
        }));

      const fragmentMain = tgpu['~unstable']
        .fragmentFn({
          in: {
            bar: d.location(0, d.vec3f),
          },
          out: d.vec4f,
        })(() => d.vec4f());

      const pipeline = root['~unstable']
        .withVertex(vertexMain, {})
        .withFragment(fragmentMain, { format: 'r8unorm' })
        .createPipeline();

      tgpu.resolve({ externals: { pipeline } });
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        'Mismatched location between vertexFn (vertexMain) output (0) and fragmentFn (fragmentMain) input (1) for the key "bar", using the location set on vertex output.',
      );
    });
  });

  describe('Performance Callbacks', () => {
    it('should add performance callback with automatic query set', ({ root }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const callback = vi.fn();
      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withPerformanceCallback(callback);

      expect(pipeline).toBeDefined();
      expectTypeOf(pipeline).toEqualTypeOf<
        TgpuRenderPipeline<{ color: d.Vec4f }>
      >();

      expect(pipeline[$internal].priors.performanceCallback).toBe(callback);

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites).toBeDefined();
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(1);
    });

    it('should create automatic query set when adding performance callback', ({ root, device }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const callback = vi.fn();
      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withPerformanceCallback(callback)
        .withColorAttachment({
          color: {
            view: {} as unknown as GPUTextureView,
            loadOp: 'clear',
            storeOp: 'store',
          },
        });

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites?.querySet).toBeDefined();

      if (timestampWrites?.querySet && 'count' in timestampWrites.querySet) {
        expect(timestampWrites.querySet.count).toBe(2);
      }

      (timestampWrites?.querySet as TgpuQuerySet<'timestamp'>).querySet;

      expect(device.mock.createQuerySet).toHaveBeenCalledWith({
        type: 'timestamp',
        count: 2,
      });
    });

    it('should replace previous performance callback', ({ root }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withPerformanceCallback(callback1)
        .withPerformanceCallback(callback2);

      expect(pipeline).toBeDefined();

      expect(pipeline[$internal].priors.performanceCallback).toBe(
        callback2,
      );
      expect(pipeline[$internal].priors.performanceCallback).not.toBe(
        callback1,
      );
    });

    it('should throw error if timestamp-query feature is not enabled', ({ root, device }) => {
      const originalFeatures = device.features;
      //@ts-ignore
      device.features = new Set();

      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const callback = vi.fn();

      expect(() => {
        root
          .withVertex(vertexFn, {})
          .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
          .createPipeline()
          .withPerformanceCallback(callback);
      }).toThrow(
        'Performance callback requires the "timestamp-query" feature to be enabled on GPU device.',
      );

      //@ts-ignore
      device.features = originalFeatures;
    });
  });

  describe('Timestamp Writes', () => {
    it('should add timestamp writes with custom query set', ({ root }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        });

      expect(pipeline).toBeDefined();
      expectTypeOf(pipeline).toEqualTypeOf<
        TgpuRenderPipeline<{ color: d.Vec4f }>
      >();

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites?.querySet).toBe(querySet);
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(0);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(1);
    });

    it('should add timestamp writes with raw GPU query set', ({ root, device }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const rawQuerySet = device.createQuerySet({
        type: 'timestamp',
        count: 4,
      });

      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet: rawQuerySet,
          beginningOfPassWriteIndex: 2,
          endOfPassWriteIndex: 3,
        });

      expect(pipeline).toBeDefined();

      const timestampWrites = pipeline[$internal].priors.timestampWrites;
      expect(timestampWrites?.querySet).toBe(rawQuerySet);
      expect(timestampWrites?.beginningOfPassWriteIndex).toBe(2);
      expect(timestampWrites?.endOfPassWriteIndex).toBe(3);
    });

    it('should handle optional timestamp write indices', ({ root }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline1 = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
        });

      const pipeline2 = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet,
          endOfPassWriteIndex: 1,
        });

      const pipeline3 = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet,
        });

      expect(pipeline1).toBeDefined();
      expect(pipeline2).toBeDefined();
      expect(pipeline3).toBeDefined();

      expect(
        pipeline1[$internal].priors.timestampWrites?.beginningOfPassWriteIndex,
      ).toBe(0);
      expect(pipeline1[$internal].priors.timestampWrites?.endOfPassWriteIndex)
        .toBeUndefined();

      expect(
        pipeline2[$internal].priors.timestampWrites?.beginningOfPassWriteIndex,
      ).toBeUndefined();
      expect(pipeline2[$internal].priors.timestampWrites?.endOfPassWriteIndex)
        .toBe(1);

      expect(
        pipeline3[$internal].priors.timestampWrites?.beginningOfPassWriteIndex,
      ).toBeUndefined();
      expect(pipeline3[$internal].priors.timestampWrites?.endOfPassWriteIndex)
        .toBeUndefined();
    });

    it('should setup timestamp writes in render pass descriptor', ({ root, commandEncoder }) => {
      const vertexFn = tgpu['~unstable'].vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu['~unstable'].fragmentFn({
        out: { color: d.vec4f },
      })('');

      const querySet = root.createQuerySet('timestamp', 4);

      const pipeline = root
        .withVertex(vertexFn, {})
        .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
        .createPipeline()
        .withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 1,
          endOfPassWriteIndex: 2,
        })
        .withColorAttachment({
          color: {
            view: {} as unknown as GPUTextureView,
            loadOp: 'clear',
            storeOp: 'store',
          },
        });

      pipeline.draw(3);

      expect(commandEncoder.beginRenderPass).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'pipeline',
          timestampWrites: {
            querySet: querySet.querySet,
            beginningOfPassWriteIndex: 1,
            endOfPassWriteIndex: 2,
          },
        }),
      );
    });
  });

  it('should handle depth stencil attachments with timestamp writes', ({ root, commandEncoder }) => {
    const vertexFn = tgpu['~unstable'].vertexFn({
      out: { pos: d.builtin.position },
    })('');

    const fragmentFn = tgpu['~unstable'].fragmentFn({
      out: { color: d.vec4f },
    })('');

    const querySet = root.createQuerySet('timestamp', 2);

    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
      .createPipeline()
      .withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      })
      .withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      })
      .withDepthStencilAttachment({
        view: {} as unknown as GPUTextureView,
        stencilLoadOp: 'load',
      });

    pipeline.draw(3);

    expect(commandEncoder.beginRenderPass).toHaveBeenCalledWith(
      expect.objectContaining({
        timestampWrites: {
          querySet: querySet.querySet,
          beginningOfPassWriteIndex: 0,
          endOfPassWriteIndex: 1,
        },
      }),
    );
  });

  it('should onlly allow for drawIndexed with assigned index buffer', ({ root }) => {
    const vertexFn = tgpu['~unstable']
      .vertexFn({
        out: { pos: d.builtin.position },
      })('')
      .$name('vertex');

    const fragmentFn = tgpu['~unstable']
      .fragmentFn({
        out: { color: d.vec4f },
      })('')
      .$name('fragment');

    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
      .createPipeline().withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      });

    //@ts-expect-error: No index buffer assigned
    expect(() => pipeline.drawIndexed(3)).toThrowErrorMatchingInlineSnapshot(
      '[Error: No index buffer set for this render pipeline.]',
    );

    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 2)).$usage('index');

    const pipelineWithIndex = pipeline.withIndexBuffer(indexBuffer);

    expect(pipelineWithIndex[$internal].priors.indexBuffer).toEqual(
      {
        buffer: indexBuffer,
        indexFormat: 'uint16',
        offsetBytes: undefined,
        sizeBytes: undefined,
      },
    );

    expect(() => pipelineWithIndex.drawIndexed(3)).not.toThrow();
  });

  it('works when combining timestamp writes and index buffer', ({ root, device }) => {
    const vertexFn = tgpu['~unstable']
      .vertexFn({
        out: { pos: d.builtin.position },
      })('')
      .$name('vertex');

    const fragmentFn = tgpu['~unstable']
      .fragmentFn({
        out: { color: d.vec4f },
      })('')
      .$name('fragment');

    const querySet = root.createQuerySet('timestamp', 2);
    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 2)).$usage('index');

    const beginRenderPassSpy = vi.spyOn(root.commandEncoder, 'beginRenderPass');

    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
      .createPipeline()
      .withIndexBuffer(indexBuffer)
      .withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      })
      .withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      });

    expect(pipeline[$internal].priors.indexBuffer).toEqual({
      buffer: indexBuffer,
      indexFormat: 'uint16',
      offsetBytes: undefined,
      sizeBytes: undefined,
    });
    expect(pipeline[$internal].priors.timestampWrites).toEqual({
      querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    });

    pipeline.drawIndexed(3);

    expect(device.mock.createQuerySet).toHaveBeenCalledWith({
      type: 'timestamp',
      count: 2,
    });

    expect(beginRenderPassSpy).toHaveBeenCalledWith({
      colorAttachments: [
        {
          loadOp: 'clear',
          storeOp: 'store',
          view: expect.any(Object),
        },
      ],
      label: 'pipeline',
      timestampWrites: {
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
        querySet: querySet.querySet,
      },
    });
  });

  it('should handle a combination of timestamp writes, index buffer, and performance callback', ({ root, device }) => {
    const vertexFn = tgpu['~unstable']
      .vertexFn({
        out: { pos: d.builtin.position },
      })('')
      .$name('vertex');

    const fragmentFn = tgpu['~unstable']
      .fragmentFn({
        out: { color: d.vec4f },
      })('')
      .$name('fragment');

    const querySet = root.createQuerySet('timestamp', 2);
    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 2)).$usage('index');
    const beginRenderPassSpy = vi.spyOn(root.commandEncoder, 'beginRenderPass');
    const resolveQuerySetSpy = vi.spyOn(root.commandEncoder, 'resolveQuerySet');

    const callback = vi.fn();

    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
      .createPipeline()
      .withIndexBuffer(indexBuffer)
      .withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      })
      .withPerformanceCallback(callback)
      .withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      });

    expect(pipeline[$internal].priors.indexBuffer).toEqual({
      buffer: indexBuffer,
      indexFormat: 'uint16',
      offsetBytes: undefined,
      sizeBytes: undefined,
    });
    expect(pipeline[$internal].priors.timestampWrites).toEqual({
      querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    });
    expect(pipeline[$internal].priors.performanceCallback).toBe(callback);

    pipeline.drawIndexed(3);

    expect(device.mock.createQuerySet).toHaveBeenCalledWith({
      type: 'timestamp',
      count: 2,
    });

    expect(root.commandEncoder.beginRenderPass).toHaveBeenCalledWith({
      colorAttachments: [
        {
          loadOp: 'clear',
          storeOp: 'store',
          view: expect.any(Object),
        },
      ],
      label: 'pipeline',
      timestampWrites: {
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
        querySet: querySet.querySet,
      },
    });

    expect(resolveQuerySetSpy).toHaveBeenCalledWith(
      querySet.querySet,
      0,
      2,
      querySet[$internal].resolveBuffer,
      0,
    );

    expect(beginRenderPassSpy).toHaveBeenCalledWith({
      colorAttachments: [
        {
          loadOp: 'clear',
          storeOp: 'store',
          view: expect.any(Object),
        },
      ],
      label: 'pipeline',
      timestampWrites: {
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
        querySet: querySet.querySet,
      },
    });
  });
});

describe('matchUpVaryingLocations', () => {
  it('works for empty arguments', () => {
    expect(matchUpVaryingLocations({}, {}, 'v', 'f')).toStrictEqual({});
  });

  it('works for empty fragment', () => {
    expect(matchUpVaryingLocations(
      {
        a: d.u32,
      },
      undefined,
      'v',
      'f',
    )).toStrictEqual({
      a: 0,
    });
  });

  it('works for non-empty', () => {
    expect(matchUpVaryingLocations(
      {
        a: d.u32,
      },
      {
        a: d.u32,
      },
      'v',
      'f',
    )).toStrictEqual({
      a: 0,
    });
  });

  it('works with unsused vertex attributes', () => {
    expect(matchUpVaryingLocations(
      {
        a: d.u32,
        b: d.u32,
        c: d.u32,
      },
      {
        b: d.u32,
      },
      'v',
      'f',
    )).toStrictEqual({
      a: 0,
      b: 1,
      c: 2,
    });
  });

  it('works with custom locations in vertex out', () => {
    expect(matchUpVaryingLocations(
      {
        a: d.u32,
        b: d.location(5, d.u32),
        c: d.u32,
      },
      {
        b: d.u32,
      },
      'v',
      'f',
    )).toStrictEqual({
      a: 0,
      b: 5,
      c: 1,
    });
  });

  it('works with custom locations in fragment in', () => {
    expect(matchUpVaryingLocations(
      {
        a: d.u32,
        b: d.u32,
        c: d.u32,
      },
      {
        b: d.u32,
        c: d.location(0, d.u32),
      },
      'v',
      'f',
    )).toStrictEqual({
      a: 1,
      b: 2,
      c: 0,
    });
  });

  it('works with custom locations in both', () => {
    expect(matchUpVaryingLocations(
      {
        a: d.u32,
        b: d.location(1, d.u32),
        c: d.u32,
      },
      {
        b: d.u32,
        c: d.location(0, d.u32),
      },
      'v',
      'f',
    )).toStrictEqual({
      a: 2,
      b: 1,
      c: 0,
    });
  });

  it('works with builtins in vertex out', () => {
    expect(matchUpVaryingLocations(
      {
        a: d.u32,
        b: d.location(1, d.u32),
        c: d.u32,
        d: d.builtin.position,
      },
      {
        b: d.u32,
        c: d.location(0, d.u32),
      },
      'v',
      'f',
    )).toStrictEqual({
      a: 2,
      b: 1,
      c: 0,
    });
  });

  it('works with builtins in fragment in', () => {
    expect(matchUpVaryingLocations(
      {
        a: d.u32,
        b: d.location(1, d.u32),
        c: d.u32,
      },
      {
        b: d.u32,
        c: d.location(0, d.u32),
        d: d.builtin.position,
      },
      'v',
      'f',
    )).toStrictEqual({
      a: 2,
      b: 1,
      c: 0,
    });
  });

  it('works with builtins in both', () => {
    expect(matchUpVaryingLocations(
      {
        a: d.u32,
        d: d.builtin.position,
        b: d.location(1, d.u32),
        c: d.u32,
      },
      {
        d: d.builtin.position,
        b: d.u32,
        c: d.location(0, d.u32),
      },
      'v',
      'f',
    )).toStrictEqual({
      a: 2,
      b: 1,
      c: 0,
    });
  });
});
