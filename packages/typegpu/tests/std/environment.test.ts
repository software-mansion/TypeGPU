import { it } from 'typegpu-testing-utility';
import { expect, describe, expectTypeOf } from 'vitest';

import { tgpu, d, std, type ShaderStage } from 'typegpu';

describe('isBeingTranspiled', () => {
  it('returns false top level', () => {
    expect(std.isBeingTranspiled()).toBe(false);
  });

  it('returns true during function resolution', () => {
    const f = () => {
      'use gpu';
      if (std.isBeingTranspiled()) {
        return 7;
      } else {
        return -7;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return 7;
      }"
    `);
  });

  it('returns false inside comptime', () => {
    const checkTranspilation = tgpu.comptime(std.isBeingTranspiled);
    expect(checkTranspilation()).toBe(false);

    const f = () => {
      'use gpu';
      const _transpilation = checkTranspilation();
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _transpilation = false;
      }"
    `);

    expect(checkTranspilation()).toBe(false);
  });

  it('returns false inside lazy', () => {
    const checkTranspilation = tgpu.lazy(std.isBeingTranspiled);

    const f = () => {
      'use gpu';
      const _transpilation = checkTranspilation.$;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _transpilation = false;
      }"
    `);
  });

  it('returns false inside simulate', () => {
    const counter = tgpu.privateVar(d.u32, 0);

    const result = tgpu['~unstable'].simulate(() => {
      if (!std.isBeingTranspiled()) {
        counter.$ += 1;
      }
      return counter.$;
    });

    expect(result.value).toBe(1);
  });

  it('correctly branches during js execution', () => {
    const f = () => {
      'use gpu';
      if (std.isBeingTranspiled()) {
        return 7;
      } else {
        return -7;
      }
    };

    expect(f()).toBe(-7);
  });
});

describe('getTargetShaderLanguage', () => {
  it('returns undefined top level', () => {
    expect(std.getTargetShaderLanguage()).toBe(undefined);
  });

  it('returns `wgsl` during function resolution', () => {
    const f = () => {
      'use gpu';
      if (std.getTargetShaderLanguage() === 'wgsl') {
        return 7;
      } else {
        return -7;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return 7;
      }"
    `);
  });

  it('returns undefined inside comptime outside of resolution and `wgsl` during function resolution', () => {
    const checkTranspilation = tgpu.comptime(std.getTargetShaderLanguage);
    expect(checkTranspilation()).toBe(undefined);

    const f = () => {
      'use gpu';
      const _transpilation = checkTranspilation() === 'wgsl';
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _transpilation = true;
      }"
    `);

    expect(checkTranspilation()).toBe(undefined);
  });

  it('returns `wgsl` inside lazy', () => {
    const checkTranspilation = tgpu.lazy(std.getTargetShaderLanguage);

    const f = () => {
      'use gpu';
      const _transpilation = checkTranspilation.$ === 'wgsl';
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _transpilation = true;
      }"
    `);
  });

  it('returns undefined inside simulate', () => {
    const counter = tgpu.privateVar(d.u32, 0);

    const result = tgpu['~unstable'].simulate(() => {
      if (std.getTargetShaderLanguage() !== 'wgsl') {
        counter.$ += 1;
      }
      return counter.$;
    });

    expect(result.value).toBe(1);
  });

  it('correctly branches during js execution', () => {
    const f = () => {
      'use gpu';
      if (std.getTargetShaderLanguage() === 'wgsl') {
        return 7;
      } else {
        return -7;
      }
    };

    expect(f()).toBe(-7);
  });
});

describe('getShaderStage', () => {
  it('returns undefined top level', () => {
    expect(std.getShaderStage()).toBe(undefined);
    expectTypeOf(std.getShaderStage()).toEqualTypeOf<ShaderStage | undefined>();
  });

  it('returns undefined during normal function resolution', () => {
    const f = () => {
      'use gpu';
      return std.getShaderStage() === undefined ? 1 : -1;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return 1;
      }"
    `);
  });

  it('returns the entry point stage transitively and duplicates shared functions per stage', () => {
    const stageValue = () => {
      'use gpu';
      if (std.getShaderStage() === 'vertex') {
        return 1;
      }
      if (std.getShaderStage() === 'fragment') {
        return 2;
      }
      if (std.getShaderStage() === 'compute') {
        return 3;
      }
      return 0;
    };

    const vertex = tgpu.vertexFn({
      out: { position: d.builtin.position },
    })(() => ({ position: d.vec4f(stageValue()) }));

    const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f(stageValue()));

    const compute = tgpu.computeFn({ workgroupSize: [1] })(() => {
      const value = stageValue();
    });

    expect(tgpu.resolve([vertex, fragment, compute])).toMatchInlineSnapshot(`
      "fn stageValue() -> i32 {
        return 1;
      }

      struct vertex_Output {
        @builtin(position) position: vec4f,
      }

      @vertex fn vertex() -> vertex_Output {
        return vertex_Output(vec4f(f32(stageValue())));
      }

      fn stageValue_1() -> i32 {
        return 2;
      }

      @fragment fn fragment() -> @location(0) vec4f {
        return vec4f(f32(stageValue_1()));
      }

      fn stageValue_2() -> i32 {
        return 3;
      }

      @compute @workgroup_size(1) fn compute() {
        let value = stageValue_2();
      }"
    `);
  });

  it('returns undefined during JS execution', () => {
    const f = () => {
      'use gpu';
      return std.getShaderStage();
    };

    expect(f()).toBe(undefined);
  });

  it('returns undefined inside simulate', () => {
    const result = tgpu['~unstable'].simulate(() => std.getShaderStage());

    expect(result.value).toBe(undefined);
  });
});
