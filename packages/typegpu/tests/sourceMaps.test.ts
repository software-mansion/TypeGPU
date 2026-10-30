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

// Functions are all defined here so that the resulting source maps are
// less likely to be impacted by new tests, formatting changes etc.
const fn0 = () => {
  'use gpu';
  let a = 0;
  let b = a++;
};

const fn1 = tgpu.fn([d.vec3f])((a) => {
  'use gpu';
  let b = d.vec3f();
  b = a;
});

const fn2 = () => {
  'use gpu';
  const a = d.vec3f();
  let b = a;
};

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

const shelledCompute = tgpu.computeFn({ workgroupSize: [1, 1, 1] })(() => {
  fn0();
});

const shelllessCompute = (x: number) => {
  'use gpu';
  fn0();
};

const shelledVertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
  fn0();
  return { pos: d.vec4f() };
});

const shelllessVertex = () => {
  'use gpu';
  fn0();
  return { $position: d.vec4f() };
};

const shelledFragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
  fn0();
  return d.vec4f();
});

const shelllessFragment = () => {
  'use gpu';
  fn0();
  return d.vec4f();
};

function expectError(cb: () => void) {
  try {
    cb();
  } catch (err) {
    return err;
  }
  throw new Error('Expected callback to throw.');
}

const slot = tgpu.slot(1);
const fn = tgpu.fn([])(() => {
  const a = slot.$;
  fn0();
});
const bound = fn.with(slot, 2);

const stripRoot = (path: string | undefined) =>
  path !== undefined ? path.replaceAll(/\/\S*packages/g, '<root-path>') : path;

describe('source mapped errors', () => {
  it('includes the source in the message', () => {
    const err = expectError(() => tgpu.resolve([fn1])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - fn:fn1 (at <root-path>/typegpu/tests/sourceMaps.test.ts:27:3):
      'b = a' is invalid, because references cannot be assigned.
      -----
      Try 'b = vec3f(a)' to copy the value instead.
      -----"
    `);
  });

  it('includes the source as a property', () => {
    const err = expectError(() => tgpu.resolve([fn1])) as ResolutionError;

    expect(stripRoot(err.location?.file)).toMatchInlineSnapshot(
      `"<root-path>/typegpu/tests/sourceMaps.test.ts"`,
    );
    expect(err.location?.location).toMatchInlineSnapshot(`
      [
        27,
        3,
      ]
    `);
  });

  it('correctly formats message with no suggestions', () => {
    const err = expectError(() => tgpu.resolve([fn0])) as ResolutionError;
    const message = err.message.split('):\n').at(-1);

    expect(message).toMatchInlineSnapshot(
      `"'a++' is invalid because update is only allowed as a statement."`,
    );
  });

  it('correctly formats message with one suggestion', () => {
    const err = expectError(() => tgpu.resolve([fn1])) as ResolutionError;
    const message = err.message.split('):\n').at(-1);

    expect(message).toMatchInlineSnapshot(`
      "'b = a' is invalid, because references cannot be assigned.
      -----
      Try 'b = vec3f(a)' to copy the value instead.
      -----"
    `);
  });

  it('correctly formats message with multiple suggestions', () => {
    const err = expectError(() => tgpu.resolve([fn2])) as ResolutionError;
    const message = err.message.split('):\n').at(-1);

    expect(message).toMatchInlineSnapshot(`
      "'let b = a' is invalid, because references cannot be assigned to 'let' variable declarations.
      -----
      Try 'let b = vec3f(a)' if you need to reassign 'b' later.
      Try 'const b = a' if you won't reassign 'b' later.
      -----"
    `);
  });

  it('includes sources for the call history', () => {
    const err = expectError(() => tgpu.resolve([main])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - fn*:main
      - fn*:main() (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:51:19)
      - fn:shelled (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:47:34)
      - fn*:generic() (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:42:30)
      - fn*:shellless() (at <root-path>/typegpu/tests/sourceMaps.test.ts:39:11):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shelled compute', ({ root }) => {
    const pipeline = root.createComputePipeline({ compute: shelledCompute });

    const err = expectError(() => pipeline.dispatchWorkgroups(1)) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - computePipelineCore
      - computeFn:shelledCompute (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:56:74)
      - fn*:fn0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:21:11):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shellless compute', ({ root }) => {
    const pipeline = root.createGuardedComputePipeline(shelllessCompute);

    const err = expectError(() => pipeline.dispatchThreads(1)) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - computePipelineCore
      - computeFn:mainCompute
      - fn:shelllessCompute (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:60:40)
      - fn*:fn0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:21:11):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shelled vertex', ({ root }) => {
    const err = expectError(() => tgpu.resolve([shelledVertex])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - vertexFn:shelledVertex (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:65:80)
      - fn*:fn0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:21:11):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shellless vertex', ({ root }) => {
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
      - autoVertexFn (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:70:30)
      - fn*:fn0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:21:11):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shelled fragment', ({ root }) => {
    const err = expectError(() => tgpu.resolve([shelledFragment])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - fragmentFn:shelledFragment (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:76:64)
      - fn*:fn0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:21:11):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for shellless fragment', ({ root }) => {
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
      - autoFragmentFn (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:81:32)
      - fn*:fn0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:21:11):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });

  it('includes source for bound fn', () => {
    const err = expectError(() => tgpu.resolve([bound])) as ResolutionError;

    expect(stripRoot(err.message)).toMatchInlineSnapshot(`
      "Resolution of the following tree failed:
      - <root>
      - fn:fn (defined at <root-path>/typegpu/tests/sourceMaps.test.ts:97:29)
      - fn*:fn0() (at <root-path>/typegpu/tests/sourceMaps.test.ts:21:11):
      'a++' is invalid because update is only allowed as a statement."
    `);
  });
});
