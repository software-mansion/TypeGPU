import { describe, expect, expectTypeOf, vi } from 'vitest';
import { matchUpVaryingLocations } from '../src/core/pipeline/renderPipeline.ts';
import type { TgpuQuerySet } from '../src/core/querySet/querySet.ts';
import tgpu, {
  common,
  d,
  MissingBindGroupsError,
  type TgpuFragmentFnShell,
  type TgpuRenderPipeline,
  type TgpuVertexFnShell,
} from '../src/index.js';
import { $internal } from '../src/shared/symbols.ts';
import { it } from './utils/extendedIt.ts';

describe('root.withVertex(...).withFragment(...)', () => {
  const vert = tgpu.vertexFn({
    out: { a: d.vec3f, b: d.vec2f },
  })`{ return Out(); }`;
  const vertWithBuiltin = tgpu.vertexFn({
    out: { a: d.vec3f, b: d.vec2f, pos: d.builtin.position },
  })`{ return Out(); }`;

  it('allows fragment functions to use a subset of the vertex output', ({ root }) => {
    const emptyFragment = tgpu.fragmentFn({ in: {}, out: {} })`{}`;
    const emptyFragmentWithBuiltin = tgpu.fragmentFn({
      in: { pos: d.builtin.frontFacing },
      out: {},
    })`{}`;
    const fullFragment = tgpu.fragmentFn({
      in: { a: d.vec3f, b: d.vec2f },
      out: d.vec4f,
    })`{ return vec4f(); }`;

    // Using none
    const pipeline = root
      .withVertex(vert)
      .withFragment(emptyFragment)
      .createPipeline();

    // Using none (builtins are erased from the vertex output)
    const pipeline2 = root
      .withVertex(vertWithBuiltin)
      .withFragment(emptyFragment)
      .createPipeline();

    // Using none (builtins are ignored in the fragment input)
    const pipeline3 = root
      .withVertex(vert)
      .withFragment(emptyFragmentWithBuiltin)
      .createPipeline();

    // Using none (builtins are ignored in both input and output,
    // so their conflict of the `pos` key is fine)
    const pipeline4 = root
      .withVertex(vertWithBuiltin)
      .withFragment(emptyFragmentWithBuiltin)
      .createPipeline();

    // Using all
    const pipeline5 = root
      .withVertex(vert)
      .withFragment(fullFragment, { format: 'rgba8unorm' })
      .createPipeline();

    expect(pipeline).toBeDefined();
    expect(pipeline2).toBeDefined();
    expect(pipeline3).toBeDefined();
    expect(pipeline4).toBeDefined();
    expect(pipeline5).toBeDefined();
  });

  it('rejects fragment functions that use non-existent vertex output', ({ root }) => {
    const fragment = tgpu.fragmentFn({
      in: { a: d.vec3f, c: d.f32 },
      out: {},
    })('');

    // @ts-expect-error: Missing from vertex output
    root.withVertex(vert, {}).withFragment(fragment, {}).createPipeline();
  });

  it('rejects fragment functions that use mismatched vertex output data types', ({ root }) => {
    const fragment = tgpu.fragmentFn({
      in: { a: d.vec3f, b: d.f32 },
      out: {},
    })('');

    // @ts-expect-error: Mismatched vertex output
    root.withVertex(vert, {}).withFragment(fragment, {}).createPipeline();
  });

  it('throws an error if bind groups are missing', ({ root }) => {
    const layout = tgpu.bindGroupLayout({ alpha: { uniform: d.f32 } });

    const vertexFn = tgpu
      .vertexFn({ out: { pos: d.builtin.position } })`{ layout.$.alpha; }`
      .$uses({ layout });

    const fragmentFn = tgpu.fragmentFn({
      out: { out: d.vec4f },
    })`{}`;

    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { out: { format: 'rgba8unorm' } })
      .createPipeline()
      // oxlint-disable-next-line typescript/no-explicit-any <not testing color attachment at this time>
      .withColorAttachment({ out: {} } as any);

    expect(() => pipeline.draw(6)).toThrowError(
      new MissingBindGroupsError([layout]),
    );

    expect(() => pipeline.draw(6)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Missing bind groups for layouts: 'layout'. Please provide it using pipeline.with(bindGroup).(...)]`,
    );
  });

  it('allows to omit input in entry function shell', () => {
    expectTypeOf(
      tgpu.vertexFn({ in: {}, out: { pos: d.builtin.position } }),
    ).toEqualTypeOf<TgpuVertexFnShell<{}, { pos: d.BuiltinPosition }>>();

    expectTypeOf(
      tgpu.vertexFn({ out: { pos: d.builtin.position } }),
    ).toEqualTypeOf<TgpuVertexFnShell<{}, { pos: d.BuiltinPosition }>>();

    expectTypeOf(
      tgpu.fragmentFn({ in: {}, out: {} }),
    ).toEqualTypeOf<TgpuFragmentFnShell<{}, {}>>();

    expectTypeOf(
      tgpu.fragmentFn({ out: {} }),
    ).toEqualTypeOf<TgpuFragmentFnShell<{}, {}>>();
  });

  it('properly handles custom depth output in fragment functions', ({ root }) => {
    const vertices = tgpu.const(d.arrayOf(d.vec2f, 3), [
      d.vec2f(-1, -1),
      d.vec2f(3, -1),
      d.vec2f(-1, 3),
    ]);
    const vertexMain = tgpu.vertexFn({
      in: { vid: d.builtin.vertexIndex },
      out: { pos: d.builtin.position },
    })(({ vid }) => ({ pos: d.vec4f(vertices.$[vid]!, 0, 1) }));

    const fragmentMain = tgpu.fragmentFn({
      out: { color: d.vec4f, depth: d.builtin.fragDepth },
    })(() => ({ color: d.vec4f(1, 0, 0, 1), depth: 0.5 }));

    const pipeline = root
      .withVertex(vertexMain, {})
      .withFragment(fragmentMain, { color: { format: 'rgba8unorm' } })
      .createPipeline();

    pipeline.withColorAttachment({
      color: {
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      },
    });

    expect(() => {
      pipeline.withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
        // @ts-expect-error
        depth: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      });
    });
  });

  it('type checks passed bind groups', ({ root }) => {
    const vertexMain = tgpu.vertexFn({
      out: { bar: d.location(0, d.vec3f) },
    })(() => ({
      bar: d.vec3f(),
    }));
    const fragmentMain = tgpu.fragmentFn({
      in: { bar: d.vec3f },
      out: d.vec4f,
    })(() => d.vec4f());
    const renderPipeline = root
      .withVertex(vertexMain, {})
      .withFragment(fragmentMain, { format: 'r8unorm' })
      .createPipeline();

    const layout1 = tgpu.bindGroupLayout({ buf: { uniform: d.u32 } });
    const bindGroup1 = root.createBindGroup(layout1, {
      buf: root.createBuffer(d.u32).$usage('uniform'),
    });
    const layout2 = tgpu.bindGroupLayout({ buf: { uniform: d.f32 } });
    const bindGroup2 = root.createBindGroup(layout2, {
      buf: root.createBuffer(d.f32).$usage('uniform'),
    });

    renderPipeline.with(layout1, bindGroup1);
    renderPipeline.with(layout2, bindGroup2);
    //@ts-expect-error
    (() => renderPipeline.with(layout1, bindGroup2));
  });

  describe('resolve', () => {
    it('allows resolving the entire shader code', ({ root }) => {
      const pipeline = root
        .withVertex(vertWithBuiltin.$name('vertex'), {})
        .withFragment(
          tgpu.fragmentFn({
            in: { a: d.builtin.position },
            out: d.vec4f,
          })(() => d.vec4f(1, 2, 3, 4)).$name('fragment'),
          { format: 'r8unorm' },
        )
        .createPipeline();

      expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
        "struct vertex_Output {
          @location(0) a: vec3f,
          @location(1) b: vec2f,
          @builtin(position) pos: vec4f,
        }

        @vertex fn vertex() -> vertex_Output { return vertex_Output(); }

        struct fragment_Input {
          @builtin(position) a: vec4f,
        }

        @fragment fn fragment(_arg_0: fragment_Input) -> @location(0) vec4f {
          return vec4f(1, 2, 3, 4);
        }"
      `);
    });

    it('resolves with correct locations when pairing up a vertex and a fragment function', ({ root }) => {
      const vertexMain = tgpu.vertexFn({
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
      }));

      const fragmentMain = tgpu.fragmentFn({
        in: {
          baz3: d.u32,
          bar: d.vec3f,
          foo: d.location(2, d.vec3f),
          baz2: d.f32,
        },
        out: d.vec4f,
      })(() => d.vec4f());

      const pipeline = root
        .withVertex(vertexMain, {})
        .withFragment(fragmentMain, { format: 'r8unorm' })
        .createPipeline();

      expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
        "struct vertexMain_Output {
          @location(2) foo: vec3f,
          @location(1) bar: vec3f,
          @location(0) baz: vec3f,
          @location(5) baz2: f32,
          @location(3) baz3: u32,
          @builtin(position) pos: vec4f,
        }

        @vertex fn vertexMain() -> vertexMain_Output {
          return vertexMain_Output(vec3f(), vec3f(), vec3f(), 0f, 0u, vec4f());
        }

        struct fragmentMain_Input {
          @location(3) baz3: u32,
          @location(1) bar: vec3f,
          @location(2) foo: vec3f,
          @location(5) baz2: f32,
        }

        @fragment fn fragmentMain(_arg_0: fragmentMain_Input) -> @location(0) vec4f {
          return vec4f();
        }"
      `);
    });

    it('resolves with correct locations when pairing up a vertex and a fragment function with rawFn implementation', ({ root }) => {
      const vertexMain = tgpu.vertexFn({
        out: {
          foo: d.vec3f,
          bar: d.vec3f,
          position: d.builtin.position,
          baz: d.location(0, d.vec3f),
          baz2: d.location(5, d.f32),
          baz3: d.u32,
        },
      })`{ return Out(); }`;

      const fragmentMain = tgpu.fragmentFn({
        in: {
          position: d.builtin.position,
          baz3: d.u32,
          bar: d.vec3f,
          foo: d.location(2, d.vec3f),
          baz2: d.f32,
        },
        out: d.vec4f,
      })`{ return vec4f(); }`;

      const pipeline = root
        .withVertex(vertexMain, {})
        .withFragment(fragmentMain, { format: 'r8unorm' })
        .createPipeline();

      expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
        "struct vertexMain_Output {
          @location(2) foo: vec3f,
          @location(1) bar: vec3f,
          @builtin(position) position: vec4f,
          @location(0) baz: vec3f,
          @location(5) baz2: f32,
          @location(3) baz3: u32,
        }

        @vertex fn vertexMain() -> vertexMain_Output { return vertexMain_Output(); }

        struct fragmentMain_Input {
          @builtin(position) position: vec4f,
          @location(3) baz3: u32,
          @location(1) bar: vec3f,
          @location(2) foo: vec3f,
          @location(5) baz2: f32,
        }

        @fragment fn fragmentMain(in: fragmentMain_Input) -> @location(0)  vec4f { return vec4f(); }"
      `);
    });

    it('logs warning when resolving pipeline having vertex and fragment functions with conflicting user-defined locations', ({ root }) => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(
        () => {},
      );

      const vertexMain = tgpu.vertexFn({
        out: {
          foo: d.vec3f,
          bar: d.location(0, d.vec3f),
        },
      })(() => ({
        foo: d.vec3f(),
        bar: d.vec3f(),
      }));

      const fragmentMain = tgpu.fragmentFn({
        in: {
          bar: d.location(1, d.vec3f),
        },
        out: d.vec4f,
      })(() => d.vec4f());

      const pipeline = root
        .withVertex(vertexMain, {})
        .withFragment(fragmentMain, { format: 'r8unorm' })
        .createPipeline();

      tgpu.resolve([pipeline]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Mismatched location between vertexFn (vertexMain) output (0) and fragmentFn (fragmentMain) input (1) for the key "bar", using the location set on vertex output.',
      );
    });

    it('does not log warning when resolving pipeline having vertex and fragment functions with non-conflicting user-defined locations', ({ root }) => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(
        () => {},
      );

      const vertexMain = tgpu.vertexFn({
        out: {
          foo: d.vec3f,
          bar: d.location(0, d.vec3f),
        },
      })(() => ({
        foo: d.vec3f(),
        bar: d.vec3f(),
      }));

      const fragmentMain = tgpu.fragmentFn({
        in: {
          bar: d.location(0, d.vec3f),
        },
        out: d.vec4f,
      })(() => d.vec4f());

      const pipeline = root
        .withVertex(vertexMain, {})
        .withFragment(fragmentMain, { format: 'r8unorm' })
        .createPipeline();

      tgpu.resolve([pipeline]);
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        'Mismatched location between vertexFn (vertexMain) output (0) and fragmentFn (fragmentMain) input (1) for the key "bar", using the location set on vertex output.',
      );
    });
  });

  describe('Performance Callbacks', () => {
    it('should add performance callback with automatic query set', ({ root }) => {
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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
      //@ts-expect-error
      device.features = new Set();

      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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

      //@ts-expect-error
      device.features = originalFeatures;
    });

    it("should not throw 'A color target was not provided to the shader'", ({ root, device }) => {
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
        in: {},
        out: {
          fragColor: d.vec4f,
          fragDepth: d.builtin.fragDepth,
        },
      })(() => {
        return {
          fragColor: d.vec4f(),
          fragDepth: 0.0,
        };
      });

      expect(() => {
        root
          .withVertex(vertexFn, {})
          .withFragment(fragmentFn, { fragColor: { format: 'rgba8unorm' } })
          .createPipeline();
      }).not.toThrow(
        "A color target by the name of 'fragDepth' was not provided to the shader.",
      );
    });
  });

  describe('Timestamp Writes', () => {
    it('should add timestamp writes with custom query set', ({ root }) => {
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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
      const vertexFn = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })('');

      const fragmentFn = tgpu.fragmentFn({
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
    const vertexFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    })('');

    const fragmentFn = tgpu.fragmentFn({
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

  it('should handle stencil reference value correctly', ({ root, commandEncoder }) => {
    const vertexFn = tgpu
      .vertexFn({
        out: { pos: d.builtin.position },
      })('')
      .$name('vertex');

    const fragmentFn = tgpu
      .fragmentFn({
        out: { color: d.vec4f },
      })('')
      .$name('fragment');

    const pipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { color: { format: 'rgba8unorm' } })
      .withDepthStencil({
        format: 'stencil8',
        stencilFront: { passOp: 'replace' },
      })
      .createPipeline()
      .withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      })
      .withDepthStencilAttachment({
        view: {} as unknown as GPUTextureView,
        stencilLoadOp: 'clear',
        stencilStoreOp: 'store',
        stencilClearValue: 5,
      })
      .withStencilReference(3);

    pipeline.draw(3);

    const renderPassEncoder = commandEncoder.mock.beginRenderPass();
    expect(renderPassEncoder.setStencilReference)
      .toHaveBeenCalledExactlyOnceWith(3);

    pipeline.withStencilReference(7).draw(3);

    expect(renderPassEncoder.setStencilReference).toHaveBeenNthCalledWith(2, 7);
  });

  it('should onlly allow for drawIndexed with assigned index buffer', ({ root }) => {
    const vertexFn = tgpu
      .vertexFn({
        out: { pos: d.builtin.position },
      })('')
      .$name('vertex');

    const fragmentFn = tgpu
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

  it('works when combining timestamp writes and index buffer', ({ root, device, commandEncoder }) => {
    const vertexFn = tgpu
      .vertexFn({
        out: { pos: d.builtin.position },
      })('')
      .$name('vertex');

    const fragmentFn = tgpu
      .fragmentFn({
        out: { color: d.vec4f },
      })('')
      .$name('fragment');

    const querySet = root.createQuerySet('timestamp', 2);
    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 2)).$usage('index');

    const beginRenderPassSpy = vi.spyOn(commandEncoder, 'beginRenderPass');

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

  it('should handle a combination of timestamp writes, index buffer, and performance callback', ({ root, device, commandEncoder }) => {
    const vertexFn = tgpu
      .vertexFn({
        out: { pos: d.builtin.position },
      })('')
      .$name('vertex');

    const fragmentFn = tgpu
      .fragmentFn({
        out: { color: d.vec4f },
      })('')
      .$name('fragment');

    const querySet = root.createQuerySet('timestamp', 2);
    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 2)).$usage('index');
    const beginRenderPassSpy = vi.spyOn(commandEncoder, 'beginRenderPass');
    const resolveQuerySetSpy = vi.spyOn(commandEncoder, 'resolveQuerySet');

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

    expect(commandEncoder.beginRenderPass).toHaveBeenCalledWith({
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

  it('warns when buffer limits are exceeded', ({ root }) => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(
      () => {},
    );

    const uniform1 = root.createUniform(d.u32);
    const uniform2 = root.createUniform(d.u32);
    const uniform3 = root.createUniform(d.u32);
    const uniform4 = root.createUniform(d.u32);
    const uniform5 = root.createUniform(d.u32);
    const uniform6 = root.createUniform(d.u32);
    const uniform7 = root.createUniform(d.u32);
    const uniform8 = root.createUniform(d.u32);
    const uniform9 = root.createUniform(d.u32);
    const uniform10 = root.createUniform(d.u32);
    const uniform11 = root.createUniform(d.u32);
    const uniform12 = root.createUniform(d.u32);
    const uniform13 = root.createUniform(d.u32);

    const readonly1 = root.createReadonly(d.u32);
    const readonly2 = root.createReadonly(d.u32);
    const readonly3 = root.createReadonly(d.u32);
    const readonly4 = root.createReadonly(d.u32);
    const readonly5 = root.createReadonly(d.u32);
    const readonly6 = root.createReadonly(d.u32);
    const readonly7 = root.createReadonly(d.u32);
    const readonly8 = root.createReadonly(d.u32);
    const readonly9 = root.createReadonly(d.u32);

    const vertexFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    })('');

    const fragmentFn = tgpu.fragmentFn({ out: d.vec4f })(() => {
      let a = d.u32();
      a = uniform1.$;
      a = uniform2.$;
      a = uniform3.$;
      a = uniform4.$;
      a = uniform5.$;
      a = uniform6.$;
      a = uniform7.$;
      a = uniform8.$;
      a = uniform9.$;
      a = uniform10.$;
      a = uniform11.$;
      a = uniform12.$;
      a = uniform13.$;
      a = readonly1.$;
      a = readonly2.$;
      a = readonly3.$;
      a = readonly4.$;
      a = readonly5.$;
      a = readonly6.$;
      a = readonly7.$;
      a = readonly8.$;
      a = readonly9.$;

      return d.vec4f();
    });

    const pipeline = root
      .withVertex(vertexFn)
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline();

    pipeline.withColorAttachment({
      loadOp: 'load',
      storeOp: 'store',
      view: {} as unknown as GPUTextureView,
    }).draw(3);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `Total number of uniform buffers (13) exceeds maxUniformBuffersPerShaderStage (12). Consider:
1. Grouping some of the uniforms into one using 'd.struct',
2. Increasing the limit when requesting a device or creating a root.`,
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `Total number of storage buffers (9) exceeds maxStorageBuffersPerShaderStage (8).`,
    );
  });
});

describe('root.createRenderPipeline', () => {
  const vertex = tgpu.vertexFn({
    out: { a: d.vec3f, b: d.vec2f },
  })`{ return Out(); }`;
  const vertexWithBuiltin = tgpu.vertexFn({
    out: { a: d.vec3f, b: d.vec2f, pos: d.builtin.position },
  })`{ return Out(); }`;

  it('allows fragment functions to use a subset of the vertex output', ({ root }) => {
    const emptyFragment = tgpu.fragmentFn({ in: {}, out: {} })`{}`;
    const emptyFragmentWithBuiltin = tgpu.fragmentFn({
      in: { pos: d.builtin.frontFacing },
      out: {},
    })`{}`;
    const fullFragment = tgpu.fragmentFn({
      in: { a: d.vec3f, b: d.vec2f },
      out: d.vec4f,
    })`{ return vec4f(); }`;

    const pipelines = [
      // Using none
      root.createRenderPipeline({
        vertex,
        fragment: emptyFragment,
      }),
      // (shell-less)
      root.createRenderPipeline({
        vertex,
        fragment: () => {
          'use gpu';
          return undefined;
        },
      }),

      // Using none (builtins are erased from the vertex output)
      root.createRenderPipeline({
        vertex: vertexWithBuiltin,
        fragment: emptyFragment,
      }),
      // (shell-less)
      root.createRenderPipeline({
        vertex: vertexWithBuiltin,
        fragment: () => {
          'use gpu';
          return undefined;
        },
      }),

      // Using none (builtins are ignored in the fragment input)
      root.createRenderPipeline({
        vertex,
        fragment: emptyFragmentWithBuiltin,
      }),
      // (shell-less)
      root.createRenderPipeline({
        vertex,
        fragment: ({ $frontFacing }) => {
          'use gpu';
          return undefined;
        },
      }),

      // Using none (builtins are ignored in both input and output,
      // so their conflict of the `pos` key is fine)
      root.createRenderPipeline({
        vertex: vertexWithBuiltin,
        fragment: emptyFragmentWithBuiltin,
      }),
      // (shell-less)
      root.createRenderPipeline({
        vertex: vertexWithBuiltin,
        fragment: ({ $frontFacing }) => {
          'use gpu';
          return undefined;
        },
      }),

      // Using all
      root.createRenderPipeline({
        vertex,
        fragment: fullFragment,
        targets: { format: 'rgba8unorm' },
      }),
      // (shell-less)
      root.createRenderPipeline({
        vertex,
        fragment: ({ $frontFacing, a }) => {
          'use gpu';
          if ($frontFacing) {
            return d.vec4f(a, 1);
          }
          return d.vec4f(a.zyx, 1);
        },
        targets: { format: 'rgba8unorm' },
      }),
    ];

    for (const pipeline of pipelines) {
      expect(pipeline).toBeDefined();
    }
  });

  it('generates a struct that matches the access pattern for shell-less fragments (only builtins)', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      vertex: vertex,
      fragment: ({ $frontFacing }) => {
        'use gpu';
        if ($frontFacing) {
          return d.vec4f(1, 0, 0, 1);
        }
        return d.vec4f(0, 1, 0, 1);
      },
      targets: { format: 'rgba8unorm' },
    });

    expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline<d.Vec4f>>();

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct vertex_Output {
        @location(0) a: vec3f,
        @location(1) b: vec2f,
      }

      @vertex fn vertex() -> vertex_Output { return vertex_Output(); }

      struct FragmentIn {
        @builtin(front_facing) frontFacing: bool,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        if (_arg_0.frontFacing) {
          return vec4f(1, 0, 0, 1);
        }
        return vec4f(0, 1, 0, 1);
      }"
    `);
  });

  it('concretizes data types', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      targets: { format: 'rgba8unorm' },
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(), prop: 0 };
      },
      fragment: ({ prop }) => {
        'use gpu';
        return d.vec4f(prop, 1, 2, 3);
      },
    });

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) prop: i32,
      }

      @vertex fn vertex() -> VertexOut {
        return VertexOut(vec4f(), 0i);
      }

      struct FragmentIn {
        @location(0) prop: i32,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        return vec4f(f32(_arg_0.prop), 1f, 2f, 3f);
      }"
    `);
  });

  it('throws when using a prop that was not provided', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      targets: { format: 'rgba8unorm' },
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f() };
      },
      // @ts-expect-error: The prop is not in the object
      fragment: ({ prop }) => {
        'use gpu';
        const a = prop;
        return d.vec4f(0);
      },
    });

    expect(() => tgpu.resolve([pipeline])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - renderPipeline:pipeline
      - renderPipelineCore
      - autoFragmentFn: Identifier prop not found]
    `);
  });

  it('disallows illegal names', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      targets: { format: 'rgba8unorm' },
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(), __myProp: 0 };
      },
      fragment: ({ __myProp }) => {
        'use gpu';
        return d.vec4f(__myProp, 1, 2, 3);
      },
    });

    expect(() => tgpu.resolve([pipeline])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - renderPipeline:pipeline
      - renderPipelineCore
      - autoVertexFn: Invalid identifier '__myProp'. Choose an identifier without whitespaces or leading underscores.]
    `);
  });

  it('disallows reserved names', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      targets: { format: 'rgba8unorm' },
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(), loop: 0 };
      },
      fragment: ({ loop }) => {
        'use gpu';
        return d.vec4f(loop, 1, 2, 3);
      },
    });

    expect(() => tgpu.resolve([pipeline])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - renderPipeline:pipeline
      - renderPipelineCore
      - autoVertexFn: Property key 'loop' is a reserved WGSL word. Choose a different name.]
    `);
  });

  it('generates a struct that matches the access pattern for shell-less fragments', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      vertex: vertex,
      fragment: ({ $frontFacing, b }) => {
        'use gpu';
        if ($frontFacing) {
          return d.vec4f(b, 0, 1);
        }
        return d.vec4f(0, 1, 0, 1);
      },
      targets: { format: 'rgba8unorm' },
    });

    expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline<d.Vec4f>>();

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct vertex_Output {
        @location(0) a: vec3f,
        @location(1) b: vec2f,
      }

      @vertex fn vertex() -> vertex_Output { return vertex_Output(); }

      struct FragmentIn {
        @builtin(front_facing) frontFacing: bool,
        @location(1) b: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        if (_arg_0.frontFacing) {
          return vec4f(_arg_0.b, 0f, 1f);
        }
        return vec4f(0, 1, 0, 1);
      }"
    `);
  });

  it('generates a struct that matches a shell-less fragment return value', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      vertex: vertex,
      fragment: () => {
        'use gpu';
        return {
          color: d.vec4f(0, 1, 0, 1),
          $fragDepth: 0,
        };
      },
      targets: { color: { format: 'rgba8unorm' } },
    });

    expectTypeOf(pipeline).toEqualTypeOf<
      TgpuRenderPipeline<{ color: d.Vec4f }>
    >();

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct vertex_Output {
        @location(0) a: vec3f,
        @location(1) b: vec2f,
      }

      @vertex fn vertex() -> vertex_Output { return vertex_Output(); }

      struct FragmentOut {
        @location(0) color: vec4f,
        @builtin(frag_depth) fragDepth: f32,
      }

      @fragment fn fragment() -> FragmentOut {
        return FragmentOut(vec4f(0, 1, 0, 1), 0f);
      }"
    `);
  });

  it('generates a struct that matches a shell-less vertex return value', ({ root }) => {
    const layout = tgpu.vertexLayout((count) => d.arrayOf(d.vec3f, count));
    const pipeline = root.createRenderPipeline({
      attribs: { a: layout.attrib },
      vertex: ({ $vertexIndex }) => {
        'use gpu';
        const pos = [
          d.vec2f(0.0, 0.5),
          d.vec2f(-0.5, -0.5),
          d.vec2f(0.5, -0.5),
        ];
        return {
          $position: d.vec4f(pos[$vertexIndex]!, 0, 1),
          uv: pos[$vertexIndex]!.add(d.vec2f(0.5)),
        };
      },
      fragment: ({ uv }) => {
        'use gpu';
        return { color: d.vec4f(uv, 0, 1), $fragDepth: 0 };
      },
      targets: { color: { format: 'rgba8unorm' } },
    });

    expectTypeOf(pipeline).toEqualTypeOf<
      TgpuRenderPipeline<{ color: d.Vec4f }>
    >();

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      struct VertexIn {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        var pos = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5), vec2f(0.5, -0.5));
        return VertexOut(vec4f(pos[_arg_0.vertexIndex], 0f, 1f), (pos[_arg_0.vertexIndex] + vec2f(0.5)));
      }

      struct FragmentOut {
        @location(0) color: vec4f,
        @builtin(frag_depth) fragDepth: f32,
      }

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> FragmentOut {
        return FragmentOut(vec4f(_arg_0.uv, 0f, 1f), 0f);
      }"
    `);
  });

  it('generates a struct that matches vertex attributes', ({ root }) => {
    const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec3f));
    const pipeline = root.createRenderPipeline({
      attribs: { localPos: vertexLayout.attrib },
      vertex: ({ $vertexIndex, localPos }) => {
        'use gpu';
        const uv = [
          d.vec2f(0.5, 1),
          d.vec2f(0, 0),
          d.vec2f(1, 0),
        ];

        return { $position: d.vec4f(localPos, 1), uv: uv[$vertexIndex]! };
      },
      fragment: ({ uv }) => {
        'use gpu';
        return d.vec4f(uv, 0, 1);
      },
      targets: { format: 'rgba8unorm' },
    });

    expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline<d.Vec4f>>();

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      struct VertexIn {
        @builtin(vertex_index) vertexIndex: u32,
        @location(0) localPos: vec3f,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        var uv = array<vec2f, 3>(vec2f(0.5, 1), vec2f(), vec2f(1, 0));
        return VertexOut(vec4f(_arg_0.localPos, 1f), uv[_arg_0.vertexIndex]);
      }

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        return vec4f(_arg_0.uv, 0f, 1f);
      }"
    `);
  });

  it('correctly reports name clashes in vertex in', ({ root }) => {
    const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.f32));
    const pipeline = root.createRenderPipeline({
      attribs: { vertexIndex: vertexLayout.attrib },
      vertex: ({ vertexIndex, $vertexIndex }) => {
        'use gpu';
        return { $position: d.vec4f() };
      },
      fragment: () => {
        'use gpu';
        return d.vec4f();
      },
      targets: { format: 'rgba8unorm' },
    });

    expect(() => tgpu.resolve([pipeline])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - renderPipeline:pipeline
      - renderPipelineCore
      - autoVertexFn: Property name 'vertexIndex' causes naming clashes. Choose a different name.]
    `);
  });

  it('correctly reports name clashes in vertex out', ({ root }) => {
    const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.f32));
    const pipeline = root.createRenderPipeline({
      attribs: { vertexIndex: vertexLayout.attrib },
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(), position: d.vec4f() };
      },
      fragment: ({ position }) => {
        'use gpu';
        return d.vec4f();
      },
      targets: { format: 'rgba8unorm' },
    });

    expect(() => tgpu.resolve([pipeline])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - renderPipeline:pipeline
      - renderPipelineCore
      - autoVertexFn: Property name 'position' causes naming clashes. Choose a different name.]
    `);
  });

  it('correctly reports name clashes in fragment in', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(), frontFacing: 0 };
      },
      fragment: ({ $frontFacing, frontFacing }) => {
        'use gpu';
        return d.vec4f();
      },
      targets: { format: 'rgba8unorm' },
    });

    expect(() => tgpu.resolve([pipeline])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - renderPipeline:pipeline
      - renderPipelineCore
      - autoFragmentFn: Property name 'frontFacing' causes naming clashes. Choose a different name.]
    `);
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

describe('TgpuRenderPipeline', () => {
  it('any pipeline is assignable to default type', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: () => {
        return d.vec4f(1);
      },
      targets: { format: 'rgba8unorm' },
    });

    const helper = (_pipe: TgpuRenderPipeline) => {
      // Do something...
    };

    helper(pipeline);
  });

  it('a "wider" pipeline is assignable to a "thinner" pipeline', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: tgpu.fragmentFn({ out: { a: d.vec4f } })(() => {
        return { a: d.vec4f(1) };
      }),
      targets: { a: { format: 'rgba8unorm' } },
    });

    const helper = (_pipe: TgpuRenderPipeline<{ a: d.Vec4f }>) => {
      // Do something...
    };

    helper(pipeline);
  });
});
