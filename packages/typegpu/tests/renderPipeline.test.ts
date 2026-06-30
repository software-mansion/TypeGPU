import { describe, expect, expectTypeOf, vi } from 'vitest';
import tgpu, {
  common,
  d,
  MissingBindGroupsError,
  type TgpuFragmentFn,
  type TgpuFragmentFnShell,
  type TgpuRenderPipeline,
  type TgpuRoot,
  type TgpuVertexFn,
  type TgpuVertexFnShell,
} from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('render pipeline behavior', () => {
  const vert = tgpu.vertexFn({
    out: { a: d.vec3f, b: d.vec2f },
  })`{ return Out(); }`;

  it('rejects fragment functions that use non-existent vertex output', ({ root }) => {
    const fragment = tgpu.fragmentFn({
      in: { a: d.vec3f, c: d.f32 },
      out: {},
    })('');

    // @ts-expect-error: Missing from vertex output
    root.createRenderPipeline({ vertex: vert, fragment });
  });

  it('rejects fragment functions that use mismatched vertex output data types', ({ root }) => {
    const fragment = tgpu.fragmentFn({
      in: { a: d.vec3f, b: d.f32 },
      out: {},
    })('');

    // @ts-expect-error: Mismatched vertex output
    root.createRenderPipeline({ vertex: vert, fragment });
  });

  it('throws an error if bind groups are missing', ({ root }) => {
    const layout = tgpu.bindGroupLayout({ alpha: { uniform: d.f32 } });

    const vertexFn = tgpu.vertexFn({ out: { pos: d.builtin.position } })`{ layout.$.alpha; }`.$uses(
      { layout },
    );

    const fragmentFn = tgpu.fragmentFn({
      out: { out: d.vec4f },
    })`{}`;

    const pipeline = root
      .createRenderPipeline({
        vertex: vertexFn,
        fragment: fragmentFn,
        targets: { out: { format: 'rgba8unorm' } },
      })
      // oxlint-disable-next-line typescript/no-explicit-any -- not testing color attachment at this time
      .withColorAttachment({ out: {} } as any);

    expect(() => pipeline.draw(6)).toThrowError(new MissingBindGroupsError([layout]));

    expect(() => pipeline.draw(6)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Missing bind groups for layouts: 'layout'. Please provide it using pipeline.with(bindGroup).(...)]`,
    );
  });

  it('allows to omit input in entry function shell', () => {
    expectTypeOf(tgpu.vertexFn({ in: {}, out: { pos: d.builtin.position } })).toEqualTypeOf<
      TgpuVertexFnShell<{}, { pos: d.BuiltinPosition }>
    >();

    expectTypeOf(tgpu.vertexFn({ out: { pos: d.builtin.position } })).toEqualTypeOf<
      TgpuVertexFnShell<{}, { pos: d.BuiltinPosition }>
    >();

    expectTypeOf(tgpu.fragmentFn({ in: {}, out: {} })).toEqualTypeOf<TgpuFragmentFnShell<{}, {}>>();

    expectTypeOf(tgpu.fragmentFn({ out: {} })).toEqualTypeOf<TgpuFragmentFnShell<{}, {}>>();
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
    const renderPipeline = root.createRenderPipeline({
      vertex: vertexMain,
      fragment: fragmentMain,
      targets: { format: 'r8unorm' },
    });

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
    () => renderPipeline.with(layout1, bindGroup2);
  });

  describe('resolve', () => {
    it('resolves with correct locations when pairing up a vertex and a fragment function', ({
      root,
    }) => {
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

      const pipeline = root.createRenderPipeline({
        vertex: vertexMain,
        fragment: fragmentMain,
        targets: { format: 'r8unorm' },
      });

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

        @fragment fn fragmentMain() -> @location(0) vec4f {
          return vec4f();
        }"
      `);
    });

    it('resolves with correct locations when pairing up a vertex and a fragment function with rawFn implementation', ({
      root,
    }) => {
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
      })`{ return vec4f(in.bar, 1); }`;

      const pipeline = root.createRenderPipeline({
        vertex: vertexMain,
        fragment: fragmentMain,
        targets: { format: 'r8unorm' },
      });

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
          @location(3) baz3: u32,
          @location(1) bar: vec3f,
          @location(2) foo: vec3f,
          @location(5) baz2: f32,
        }

        @fragment fn fragmentMain(in: fragmentMain_Input) -> @location(0)  vec4f { return vec4f(in.bar, 1); }"
      `);
    });

    it('logs warning when resolving pipeline having vertex and fragment functions with conflicting user-defined locations', ({
      root,
    }) => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

      const pipeline = root.createRenderPipeline({
        vertex: vertexMain,
        fragment: fragmentMain,
        targets: { format: 'r8unorm' },
      });

      tgpu.resolve([pipeline]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Mismatched location between vertexFn (vertexMain) output (0) and fragmentFn (fragmentMain) input (1) for the key "bar", using the location set on vertex output.',
      );
    });

    it('does not log warning when resolving pipeline having vertex and fragment functions with non-conflicting user-defined locations', ({
      root,
    }) => {
      using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

      const pipeline = root.createRenderPipeline({
        vertex: vertexMain,
        fragment: fragmentMain,
        targets: { format: 'r8unorm' },
      });

      tgpu.resolve([pipeline]);
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        'Mismatched location between vertexFn (vertexMain) output (0) and fragmentFn (fragmentMain) input (1) for the key "bar", using the location set on vertex output.',
      );
    });
  });

  it('should warn if timestamp-query feature is not enabled', ({ root, device }) => {
    //@ts-expect-error
    device.features = new Set();
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const vertexFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    })('');

    const fragmentFn = tgpu.fragmentFn({
      out: { color: d.vec4f },
    })('');

    const callback = vi.fn();

    expect(() => {
      const before = root.createRenderPipeline({
        vertex: vertexFn,
        fragment: fragmentFn,
      });
      const after = before.withPerformanceCallback(callback);
      // no-op
      expect(after).toBe(before);
    }).not.toThrow();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Performance callback cannot be used because the timestamp-query feature is not enabled on the root.',
    );
  });

  it("should not throw 'A color target was not provided to the shader'", ({ root }) => {
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
      root.createRenderPipeline({
        vertex: vertexFn,
        fragment: fragmentFn,
        targets: { fragColor: { format: 'rgba8unorm' } },
      });
    }).not.toThrow("A color target by the name of 'fragDepth' was not provided to the shader.");
  });

  it('should handle depth stencil attachments with timestamp writes', ({
    root,
    commandEncoder,
  }) => {
    const vertexFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    })('');

    const fragmentFn = tgpu.fragmentFn({
      out: { color: d.vec4f },
    })('');

    const querySet = root.createQuerySet('timestamp', 2);

    const pipeline = root
      .createRenderPipeline({
        vertex: vertexFn,
        fragment: fragmentFn,
        targets: { color: { format: 'rgba8unorm' } },
      })
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
      .createRenderPipeline({
        vertex: vertexFn,
        fragment: fragmentFn,
        targets: { color: { format: 'rgba8unorm' } },
        depthStencil: {
          format: 'stencil8',
          stencilFront: { passOp: 'replace' },
        },
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
        stencilLoadOp: 'clear',
        stencilStoreOp: 'store',
        stencilClearValue: 5,
      })
      .withStencilReference(3);

    pipeline.draw(3);

    const renderPassEncoder = commandEncoder.mock.beginRenderPass();
    expect(renderPassEncoder.setStencilReference).toHaveBeenCalledExactlyOnceWith(3);

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
      .createRenderPipeline({
        vertex: vertexFn,
        fragment: fragmentFn,
        targets: { color: { format: 'rgba8unorm' } },
      })
      .withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      });

    //@ts-expect-error: No index buffer assigned
    expect(() => pipeline.drawIndexed(3)).toThrowErrorMatchingInlineSnapshot(
      `[Error: No index buffer set for this render pipeline.]`,
    );

    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 2)).$usage('index');

    const pipelineWithIndex = pipeline.withIndexBuffer(indexBuffer);

    expect(() => pipelineWithIndex.drawIndexed(3)).not.toThrow();
  });

  it('warns when buffer limits are exceeded', ({ root }) => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

    const pipeline = root.createRenderPipeline({
      vertex: vertexFn,
      fragment: fragmentFn,
      targets: { format: 'rgba8unorm' },
    });

    pipeline
      .withColorAttachment({
        loadOp: 'load',
        storeOp: 'store',
        view: {} as unknown as GPUTextureView,
      })
      .draw(3);

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

  it('generates a struct that matches the access pattern for shell-less fragments (only builtins)', ({
    root,
  }) => {
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
      - autoVertexFn: Invalid property key '__myProp': Identifiers cannot start with double underscores.]
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
      - autoVertexFn: Invalid property key 'loop': Identifiers cannot start with reserved keywords.]
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

    expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline<{ color: d.Vec4f }>>();

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
        const pos = [d.vec2f(0.0, 0.5), d.vec2f(-0.5, -0.5), d.vec2f(0.5, -0.5)];
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

    expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline<{ color: d.Vec4f }>>();

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      struct VertexIn {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        let pos = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5), vec2f(0.5, -0.5));
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

  it('derefs implicit pointers in the vertex and fragment outputs', ({ root }) => {
    const pipeline = root.createRenderPipeline({
      vertex: ({ $vertexIndex }) => {
        'use gpu';
        const pos = [d.vec2f(0.0, 0.5), d.vec2f(-0.5, -0.5), d.vec2f(0.5, -0.5)];
        const local = pos[$vertexIndex]!;
        return {
          $position: d.vec4f(local, 0, 1),
          local,
        };
      },
      fragment: () => {
        'use gpu';
        const color = d.vec4f(1, 0, 0, 1);
        const alias = color;
        return {
          color: alias,
        };
      },
      targets: { color: { format: 'rgba8unorm' } },
    });

    expectTypeOf(pipeline).toEqualTypeOf<TgpuRenderPipeline<{ color: d.Vec4f }>>();

    const wgsl = tgpu.resolve([pipeline]);
    // vertex
    expect(wgsl).toContain('local: vec2f');
    expect(wgsl).not.toContain('local: ptr<function, vec2f>');
    // fragment
    expect(wgsl).toContain('color: vec4f');
    expect(wgsl).not.toContain('ptr<function, vec4f>');

    expect(wgsl).toMatchInlineSnapshot(`
      "struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) local: vec2f,
      }

      struct VertexIn {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        var pos = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5), vec2f(0.5, -0.5));
        let local = (&pos[_arg_0.vertexIndex]);
        return VertexOut(vec4f((*local), 0f, 1f), (*local));
      }

      struct FragmentOut {
        @location(0) color: vec4f,
      }

      @fragment fn fragment() -> FragmentOut {
        var color = vec4f(1, 0, 0, 1);
        let alias_1 = (&color);
        return FragmentOut((*alias_1));
      }"
    `);
  });

  it('generates a struct that matches vertex attributes', ({ root }) => {
    const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec3f));
    const pipeline = root.createRenderPipeline({
      attribs: { localPos: vertexLayout.attrib },
      vertex: ({ $vertexIndex, localPos }) => {
        'use gpu';
        const uv = [d.vec2f(0.5, 1), d.vec2f(0, 0), d.vec2f(1, 0)];

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
        @location(0) localPos: vec3f,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        let uv = array<vec2f, 3>(vec2f(0.5, 1), vec2f(), vec2f(1, 0));
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
        return { $position: d.vec4f(vertexIndex, $vertexIndex, 0, 1) };
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
        return position;
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
        if ($frontFacing && frontFacing === 1) {
          return d.vec4f(0, 1, 0, 1);
        }
        return d.vec4f(1, 0, 0, 1);
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

  it('generates proper vertex layout for shell-less attributes', ({
    root,
    device,
    renderPassEncoder,
  }) => {
    const Boid = d.struct({
      velocity: d.vec3f,
      life: d.f32,
    });
    const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec3f));
    const instanceLayout = tgpu.vertexLayout(d.arrayOf(Boid), 'instance');
    const pipeline = root.createRenderPipeline({
      attribs: { vertexPos: vertexLayout.attrib, ...instanceLayout.attrib },
      vertex: ({ life, velocity, vertexPos }) => {
        'use gpu';
        return { $position: d.vec4f(vertexPos + velocity, 1), life };
      },
      fragment: ({ life }) => {
        'use gpu';
        return d.vec4f(1, life, 0, 1);
      },
      targets: { format: 'rgba8unorm' },
    });

    const vertexBuffer = root.createBuffer(vertexLayout.schemaForCount(3)).$usage('vertex');
    const instanceBuffer = root.createBuffer(instanceLayout.schemaForCount(1)).$usage('vertex');

    pipeline
      .with(vertexLayout, vertexBuffer)
      .with(instanceLayout, instanceBuffer)
      .withColorAttachment({ view: {} as unknown as GPUTextureView })
      .draw(3);

    expect(device.mock.createRenderPipeline.mock.calls).toMatchInlineSnapshot(`
      [
        [
          {
            "fragment": {
              "module": "mockShaderModule",
              "targets": [
                {
                  "format": "rgba8unorm",
                },
              ],
            },
            "label": "pipeline",
            "layout": "mockPipelineLayout",
            "vertex": {
              "buffers": [
                {
                  "arrayStride": 16,
                  "attributes": [
                    {
                      "format": "float32x3",
                      "offset": 0,
                      "shaderLocation": 0,
                    },
                  ],
                  "stepMode": "vertex",
                },
                {
                  "arrayStride": 16,
                  "attributes": [
                    {
                      "format": "float32x3",
                      "offset": 0,
                      "shaderLocation": 1,
                    },
                    {
                      "format": "float32",
                      "offset": 12,
                      "shaderLocation": 2,
                    },
                  ],
                  "stepMode": "instance",
                },
              ],
              "module": "mockShaderModule",
            },
          },
        ],
      ]
    `);

    expect(renderPassEncoder.mock.setVertexBuffer.mock.calls).toMatchInlineSnapshot(`
      [
        [
          0,
          {
            "destroy": [MockFunction],
            "getMappedRange": [MockFunction],
            "label": "vertexBuffer",
            "mapAsync": [MockFunction],
            "mapState": "unmapped",
            "size": 48,
            "unmap": [MockFunction],
            "usage": 44,
          },
          undefined,
          undefined,
        ],
        [
          1,
          {
            "destroy": [MockFunction],
            "getMappedRange": [MockFunction],
            "label": "instanceBuffer",
            "mapAsync": [MockFunction],
            "mapState": "unmapped",
            "size": 16,
            "unmap": [MockFunction],
            "usage": 44,
          },
          undefined,
          undefined,
        ],
      ]
    `);
  });

  it('accepts entry functions with no attributes or varyings', ({ root }) => {
    const positions = tgpu.const(d.arrayOf(d.vec2f, 3), [
      d.vec2f(0, 0),
      d.vec2f(1, 0),
      d.vec2f(0, 1),
    ]);
    const vertex = ({ $vertexIndex }: TgpuVertexFn.AutoInEmpty) => {
      'use gpu';
      return {
        $position: d.vec4f(positions.$[$vertexIndex]!, 0, 1),
      } satisfies TgpuVertexFn.AutoOut;
    };

    const fragment = ({ $position }: TgpuFragmentFn.AutoInEmpty) => {
      'use gpu';
      return $position;
    };

    const pipeline = root.createRenderPipeline({
      vertex,
      fragment,
    });

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "const positions: array<vec2f, 3> = array<vec2f, 3>(vec2f(), vec2f(1, 0), vec2f(0, 1));

      struct VertexOut {
        @builtin(position) position: vec4f,
      }

      struct VertexIn {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        return VertexOut(vec4f(positions[_arg_0.vertexIndex], 0f, 1f));
      }

      struct FragmentIn {
        @builtin(position) position: vec4f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        return _arg_0.position;
      }"
    `);
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

describe('Render Bundles', () => {
  const vertexFn = tgpu.vertexFn({
    out: { pos: d.builtin.position },
  })('');

  const fragmentFn = tgpu.fragmentFn({
    out: { color: d.vec4f },
  })('');

  function createPipeline(root: TgpuRoot) {
    return root
      .createRenderPipeline({
        vertex: vertexFn,
        fragment: fragmentFn,
        targets: { color: { format: 'rgba8unorm' } },
      })
      .withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      });
  }

  it('routes draw calls through the bundle encoder', ({ root, renderBundleEncoder }) => {
    const pipeline = createPipeline(root);
    pipeline.with(renderBundleEncoder).draw(6);

    const encoder = renderBundleEncoder as unknown as {
      setPipeline: ReturnType<typeof vi.fn>;
      draw: ReturnType<typeof vi.fn>;
    };

    expect(encoder.setPipeline).toHaveBeenCalledTimes(1);
    expect(encoder.draw).toHaveBeenCalledWith(6, undefined, undefined, undefined);
  });

  it('skips redundant state application when same pipeline draws twice (dirty flag)', ({
    root,
    renderBundleEncoder,
  }) => {
    const pipeline = createPipeline(root).with(renderBundleEncoder);

    pipeline.draw(3);
    pipeline.draw(6);

    const encoder = renderBundleEncoder as unknown as {
      setPipeline: ReturnType<typeof vi.fn>;
      draw: ReturnType<typeof vi.fn>;
    };

    expect(encoder.setPipeline).toHaveBeenCalledTimes(1);
    expect(encoder.draw).toHaveBeenCalledTimes(2);
  });

  it('re-applies state when a different pipeline draws on the same encoder', ({
    root,
    renderBundleEncoder,
  }) => {
    const pipeline1 = createPipeline(root).with(renderBundleEncoder);
    const pipeline2 = createPipeline(root).with(renderBundleEncoder);

    pipeline1.draw(3);
    pipeline2.draw(6);

    const encoder = renderBundleEncoder as unknown as {
      setPipeline: ReturnType<typeof vi.fn>;
    };

    expect(encoder.setPipeline).toHaveBeenCalledTimes(2);
  });

  it('throws on missing bind groups when using bundle encoder', ({ root, renderBundleEncoder }) => {
    const layout = tgpu.bindGroupLayout({ alpha: { uniform: d.f32 } });

    const vertexWithLayout = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    })`{ layout.$.alpha; }`.$uses({ layout });

    const pipeline = root
      .createRenderPipeline({
        vertex: vertexWithLayout,
        fragment: fragmentFn,
        targets: { color: { format: 'rgba8unorm' } },
      })
      .withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      });

    expect(() => pipeline.with(renderBundleEncoder).draw(6)).toThrowError(
      new MissingBindGroupsError([layout]),
    );
  });

  it('sets index buffer when drawIndexed is called on bundle encoder', ({
    root,
    renderBundleEncoder,
  }) => {
    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 6)).$usage('index');

    const pipeline = createPipeline(root).withIndexBuffer(indexBuffer).with(renderBundleEncoder);

    pipeline.drawIndexed(6);

    const encoder = renderBundleEncoder as unknown as {
      setPipeline: ReturnType<typeof vi.fn>;
      setIndexBuffer: ReturnType<typeof vi.fn>;
      drawIndexed: ReturnType<typeof vi.fn>;
    };

    expect(encoder.setPipeline).toHaveBeenCalled();
    expect(encoder.setIndexBuffer).toHaveBeenCalled();
    expect(encoder.drawIndexed).toHaveBeenCalledWith(6, undefined, undefined, undefined, undefined);
  });

  it('creates its own render pass when using external command encoder', ({
    root,
    commandEncoder,
  }) => {
    const beginRenderPassSpy = vi.spyOn(commandEncoder, 'beginRenderPass');
    const pipeline = createPipeline(root);
    pipeline.with(commandEncoder).draw(3);

    expect(beginRenderPassSpy).toHaveBeenCalled();
    const pass = beginRenderPassSpy.mock.results[0]!.value;
    expect(pass.setPipeline).toHaveBeenCalled();
    expect(pass.draw).toHaveBeenCalledWith(3, undefined, undefined, undefined);
    expect(pass.end).toHaveBeenCalled();
  });
});

describe('drawIndirect / drawIndexedIndirect buffer and offset validation', () => {
  // our favorite struct: https://shorturl.at/NQggS
  const DeepStruct = d.struct({
    someData: d.arrayOf(d.f32, 13),
    nested: d.struct({
      randomData: d.f32,
      x: d.atomic(d.u32),
      y: d.u32,
      innerNested: d.arrayOf(
        d.struct({
          xx: d.atomic(d.u32),
          yy: d.u32,
          zz: d.u32,
          myVec: d.vec4u,
        }),
        3,
      ),
      z: d.u32,
      additionalData: d.arrayOf(d.u32, 32),
    }),
  });

  const vertexFn = tgpu.vertexFn({
    out: { pos: d.builtin.position },
  })('');

  const fragmentFn = tgpu.fragmentFn({
    out: { color: d.vec4f },
  })('');

  function createPipeline(root: TgpuRoot) {
    return root
      .createRenderPipeline({
        vertex: vertexFn,
        fragment: fragmentFn,
        targets: { color: { format: 'rgba8unorm' } },
      })
      .withColorAttachment({
        color: {
          view: {} as unknown as GPUTextureView,
          loadOp: 'clear',
          storeOp: 'store',
        },
      });
  }

  describe('drawIndirect', () => {
    it('accepts raw GPUBuffer with indirect flag', ({ root, device }) => {
      const buffer = device.createBuffer({ size: 20, usage: GPUBufferUsage.INDIRECT });

      const pipeline = createPipeline(root);

      pipeline.drawIndirect(buffer, 4);
    });

    it('throws when offset is not multiple of 4', ({ root, device }) => {
      const buffer = device.createBuffer({ size: 20, usage: GPUBufferUsage.INDIRECT });

      const pipeline = createPipeline(root);

      expect(() => pipeline.drawIndirect(buffer, 3)).toThrowErrorMatchingInlineSnapshot(
        `[Error: Indirect buffer offset must be a multiple of 4. Got: 3]`,
      );
    });

    it('throws when raw GPUBuffer size is not enough for draw', ({ device, root }) => {
      const buffer = device.createBuffer({
        size: 17,
        usage: GPUBufferUsage.INDIRECT,
      });

      const pipeline = createPipeline(root);

      expect(() => pipeline.drawIndirect(buffer, 4)).toThrowErrorMatchingInlineSnapshot(
        `[Error: Buffer too small for drawIndirect. Required: 16 bytes at offset 4, but buffer is only 17 bytes.]`,
      );
    });

    it('warns when draw would read across padding', ({ root }) => {
      using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const pipeline = createPipeline(root);

      const buffer = root.createBuffer(DeepStruct).$usage('indirect');
      pipeline.drawIndirect(
        buffer,
        d.memoryLayoutOf(DeepStruct, (s) => s.someData[10]),
      );

      expect(warnSpy.mock.calls[0]![0]).toMatchInlineSnapshot(
        `"drawIndirect: Starting at offset 40, only 12 contiguous bytes are available before padding. 'drawIndirect' requires 16 bytes (4 x u32). Reading across padding may result in undefined behavior."`,
      );
    });

    it('does not warn when draw has sufficient contiguous data', ({ root }) => {
      using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const pipeline = createPipeline(root);

      const DrawIndirectArgs = d.struct({
        vertexCount: d.u32,
        instanceCount: d.u32,
        firstVertex: d.u32,
        firstInstance: d.u32,
      });
      const buffer = root.createBuffer(DrawIndirectArgs).$usage('indirect');
      pipeline.drawIndirect(buffer);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('drawIndexedIndirect', () => {
    function createPipelineIndexed(root: TgpuRoot) {
      const indexBuffer = root.createBuffer(d.arrayOf(d.u32, 3)).$usage('index');
      return createPipeline(root).withIndexBuffer(indexBuffer);
    }

    it('accepts raw GPUBuffer with indirect flag', ({ root, device }) => {
      const buffer = device.createBuffer({ size: 24, usage: GPUBufferUsage.INDIRECT });

      const pipeline = createPipelineIndexed(root);

      pipeline.drawIndexedIndirect(buffer, 4);
    });

    it('throws when offset is not multiple of 4', ({ root, device }) => {
      const buffer = device.createBuffer({ size: 24, usage: GPUBufferUsage.INDIRECT });

      const pipeline = createPipelineIndexed(root);

      expect(() => pipeline.drawIndexedIndirect(buffer, 3)).toThrowErrorMatchingInlineSnapshot(
        `[Error: Indirect buffer offset must be a multiple of 4. Got: 3]`,
      );
    });

    it('throws when raw GPUBuffer size is not enough for drawIndexed', ({ device, root }) => {
      const buffer = device.createBuffer({
        size: 21,
        usage: GPUBufferUsage.INDIRECT,
      });

      const pipeline = createPipelineIndexed(root);

      expect(() => pipeline.drawIndexedIndirect(buffer, 4)).toThrowErrorMatchingInlineSnapshot(
        `[Error: Buffer too small for drawIndexedIndirect. Required: 20 bytes at offset 4, but buffer is only 21 bytes.]`,
      );
    });

    it('warns when drawIndexed would read across padding', ({ root }) => {
      using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const pipeline = createPipelineIndexed(root);

      const buffer = root.createBuffer(DeepStruct).$usage('indirect');
      pipeline.drawIndexedIndirect(
        buffer,
        d.memoryLayoutOf(DeepStruct, (s) => s.someData[9]),
      );

      expect(warnSpy.mock.calls[0]![0]).toMatchInlineSnapshot(
        `"drawIndexedIndirect: Starting at offset 36, only 16 contiguous bytes are available before padding. 'drawIndexedIndirect' requires 20 bytes (3 x u32, i32, u32). Reading across padding may result in undefined behavior."`,
      );
    });

    it('does not warn when drawIndexed has sufficient contiguous data', ({ root }) => {
      using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const pipeline = createPipelineIndexed(root);

      const DrawIndexedIndirectArgs = d.struct({
        indexCount: d.u32,
        instanceCount: d.u32,
        firstIndex: d.u32,
        baseVertex: d.i32,
        firstInstance: d.u32,
      });
      const buffer = root.createBuffer(DrawIndexedIndirectArgs).$usage('indirect');
      pipeline.drawIndexedIndirect(buffer);

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
