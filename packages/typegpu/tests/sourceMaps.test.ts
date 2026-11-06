import { describe, expect, vi } from 'vitest';
import { d, ResolutionError, tgpu } from 'typegpu';
import { it } from 'typegpu-testing-utility';

vi.mock('../src/shared/env.ts', () => ({
  INCLUDE_SOURCE: true,
  DEV: false,
  TEST: true,
}));
vi.mock('../dist/shared/env.js', () => ({
  INCLUDE_SOURCE: true,
  DEV: false,
  TEST: true,
}));

function expectError(cb: () => void) {
  try {
    cb();
  } catch (err) {
    return err;
  }
  throw new Error('Expected callback to throw.');
}

const stripRoot = (path: string | undefined) =>
  path !== undefined ? path.replaceAll(/\/\S*packages/g, '<root-path>') : path;

describe('source mapped errors', () => {
  const fail0 = () => {
    'use gpu';
    let a = 0;
    let b = a++;
  };

  it('includes the source in the message', () => {
    const err = expectError(() => tgpu.resolve([fail0])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - fn*:fail0
      - fn*:fail0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:32:13):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes the source as a property', () => {
    const err = expectError(() => tgpu.resolve([fail0])) as ResolutionError;

    expect(stripRoot(err.source?.file)).toMatchInlineSnapshot(
    expect(stripRoot(err.source?.file)).toMatchInlineSnapshot(
      `"<root-path>/typegpu/tests/sourceMaps.test.ts"`,
    );
    expect(err.source?.location).toMatchInlineSnapshot(`
    expect(err.source?.location).toMatchInlineSnapshot(`
      [
        32,
        12,
      ]
    `);
  });

  it('correctly formats message with no suggestions', () => {
    const err = expectError(() => tgpu.resolve([fail0])) as ResolutionError;
    const message = err.message.split('):\n').at(-1);

    expect(message).toMatchInlineSnapshot(
      `"'a++' is invalid because update is only allowed as a statement."`,
    );
  });

  it('correctly formats message with one suggestion', () => {
    const fail1 = tgpu.fn([d.vec3f])((a) => {
      'use gpu';
      let b = d.vec3f();
      b = a;
    });

    const err = expectError(() => tgpu.resolve([fail1])) as ResolutionError;
    const message = err.message.split('):\n').at(-1);

    expect(message).toMatchInlineSnapshot(`
      "'b = a' is invalid, because references cannot be assigned.
      -----
      Try 'b = vec3f(a)' to copy the value instead.
      -----"
    `);
  });

  it('correctly formats message with multiple suggestions', () => {
    const fail2 = () => {
      'use gpu';
      const a = d.vec3f();
      let b = a;
    };

    const err = expectError(() => tgpu.resolve([fail2])) as ResolutionError;
    const message = err.message.split('):\n').at(-1);

    expect(message).toMatchInlineSnapshot(`
      "'let b = a' is invalid, because references cannot be assigned to 'let' variable declarations.
      -----
      - Try 'let b = vec3f(a)' if you need to reassign 'b' later.
      - Try 'const b = a' if you won't reassign 'b' later.
      -----"
    `);
  });

  it('works when item is not provided', () => {
    const fn = (a: string) => {
      'use gpu';
      return a;
    };

    const main = () => {
      'use gpu';
      fn('strings are not supported as arguments');
    };

    const err = expectError(() => tgpu.resolve([main])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main(): Passed illegal value '"strings are not supported as arguments"' (strings are not supported as arguments) as the #0 argument to fn(...)
      Shellless functions can only accept arguments representing WGSL resources: constructible WGSL types, d.refs, samplers or texture views.
      Remember, that arguments such as samplers, texture views, accessors, slots etc. should be dereferenced via '.$' first."
    `);
  });

  it('includes sources for the call history', () => {
    const shellless = () => {
      'use gpu';
      let a = 0;
      let b = a++;
    };

    const generic = tgpu.fn(() => {
      'use gpu';
      shellless();
    });

    const shelled = tgpu.fn([])(() => {
      generic();
    });

    const main = () => {
      'use gpu';
      shelled();
    };

    const err = expectError(() => tgpu.resolve([main])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main() (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:123:24)
      - fn:shelled (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:119:39)
      - fn*:generic() (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:114:35)
      - fn*:shellless() (at <root-path>/typegpu/tests/sourceMaps.test.ts:111:15):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shelled compute', ({ root }) => {
    const shelledCompute = tgpu.computeFn({ workgroupSize: [1, 1, 1] })(() => {
      fail0();
    });

    const pipeline = root.createComputePipeline({ compute: shelledCompute });

    const err = expectError(() => pipeline.dispatchWorkgroups(1)) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - computePipelineCore
      - computeFn:shelledCompute (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:143:79)
      - fn*:fail0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:32:13):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shellless compute', ({ root }) => {
    const shelllessCompute = (x: number) => {
      'use gpu';
      fail0();
    };

    const pipeline = root.createGuardedComputePipeline(shelllessCompute);

    const err = expectError(() => pipeline.dispatchThreads(1)) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - computePipelineCore
      - computeFn:mainCompute
      - fn:shelllessCompute (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:161:45)
      - fn*:fail0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:32:13):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shelled vertex', ({ root }) => {
    const shelledVertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
      fail0();
      return { pos: d.vec4f() };
    });

    const err = expectError(() => tgpu.resolve([shelledVertex])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - vertexFn:shelledVertex (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:181:85)
      - fn*:fail0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:32:13):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shellless vertex', ({ root }) => {
    const shelllessVertex = () => {
      'use gpu';
      fail0();
      return { $position: d.vec4f() };
    };

    const pipeline = root.createRenderPipeline({
      vertex: shelllessVertex,
      fragment: () => d.vec4f(),
    });

    const err = expectError(() => tgpu.resolve([pipeline])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - renderPipeline:pipeline
      - renderPipelineCore
      - autoVertexFn (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:198:35)
      - fn*:fail0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:32:13):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shelled fragment', ({ root }) => {
    const shelledFragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
      fail0();
      return d.vec4f();
    });

    const err = expectError(() => tgpu.resolve([shelledFragment])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - fragmentFn:shelledFragment (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:223:69)
      - fn*:fail0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:32:13):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shellless fragment', ({ root }) => {
    const shelllessFragment = () => {
      'use gpu';
      fail0();
      return d.vec4f();
    };

    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f() };
      },
      fragment: shelllessFragment,
    });

    const err = expectError(() => tgpu.resolve([pipeline])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - renderPipeline:pipeline
      - renderPipelineCore
      - autoFragmentFn (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:240:37)
      - fn*:fail0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:32:13):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for bound fn', () => {
    const slot = tgpu.slot(1);
    const fn = tgpu.fn([])(() => {
      const a = slot.$;
      fail0();
    });
    const bound = fn.with(slot, 2);

    const err = expectError(() => tgpu.resolve([bound])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - fn:fn (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:269:34)
      - fn*:fail0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:32:13):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });
});
