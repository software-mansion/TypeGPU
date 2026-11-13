import { describe, expect } from 'vitest';
import { tgpu, d } from 'typegpu';
import {
  CAPTURE,
  CAPTURE_FOLLOWING,
  captureSnippets,
  captureStatements,
  it,
  simplifyType,
} from 'typegpu-testing-utility';

describe('CAPTURE', () => {
  it('is a no-op in regular resolves', () => {
    const fn = tgpu.fn([d.u32])((x) => {
      'use gpu';
      const a = CAPTURE(1 + 2);
      const b = CAPTURE(a + 1);
      const c = CAPTURE(x);
      const d = CAPTURE(CAPTURE(1));
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1(x: u32) {
        const a = 3;
        let b = (a + 1i);
        let c = x;
        const d = 1;
      }"
    `);
  });

  it('allows snippet extraction', () => {
    const fn = tgpu.fn([d.u32])((x) => {
      'use gpu';
      const a = CAPTURE(1 + 2);
      const b = CAPTURE(a + 1);
      const c = CAPTURE(x);
      const d = CAPTURE(CAPTURE(1) + (c + x));
    });

    expect(captureSnippets(fn).map(simplifyType)).toMatchInlineSnapshot(`
      [
        {
          "dataType": "abstractInt",
          "origin": "constant",
          "possibleSideEffects": false,
          "value": 3,
        },
        {
          "dataType": "i32",
          "origin": "runtime",
          "possibleSideEffects": false,
          "value": "(a + 1i)",
        },
        {
          "dataType": "u32",
          "origin": "argument",
          "possibleSideEffects": false,
          "value": "x",
        },
        {
          "dataType": "abstractInt",
          "origin": "constant",
          "possibleSideEffects": false,
          "value": 1,
        },
        {
          "dataType": "u32",
          "origin": "runtime",
          "possibleSideEffects": false,
          "value": "(1u + (c + x))",
        },
      ]
    `);
  });

  it('recaptures when called a second time', () => {
    let count = 0;
    const lazy = tgpu.lazy(() => count++);
    const fn = () => {
      'use gpu';
      return CAPTURE(lazy.$);
    };

    expect(captureSnippets(fn)[0]?.value).toBe(0);
    expect(captureSnippets(fn)[0]?.value).toBe(1);
    expect(captureSnippets(fn)[0]?.value).toBe(2);
  });

  it('captures inner to outer', () => {
    const fn = () => {
      'use gpu';
      return CAPTURE(CAPTURE(1) + 2);
    };

    const captured = captureSnippets(fn);
    expect(captured[0]?.value).toBe(1);
    expect(captured[1]?.value).toBe(3);
  });

  it('captures structs after casting', () => {
    const Boid = d.struct({
      pos: d.vec3f,
    });

    const fn = tgpu.fn(
      [],
      Boid,
    )(() => {
      'use gpu';
      return CAPTURE({ pos: d.vec3f() });
    });

    const captured = captureSnippets(fn);
    expect(captured[0]?.dataType).toBe(Boid);
  });

  it('captures before type casting', () => {
    const fn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      'use gpu';
      return CAPTURE(1.5);
    });

    expect(captureSnippets(fn)[0]?.value).toBe(1.5);
  });
});

describe('CAPTURE_FOLLOWING', () => {
  it('is a no-op in regular resolves', () => {
    const fn = () => {
      'use gpu';
      CAPTURE_FOLLOWING();
      return 5;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        return 5;
      }"
    `);
  });

  it('allows capturing following statement', () => {
    const fn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      'use gpu';
      CAPTURE_FOLLOWING();
      const a = 5;

      const b = 6;
      return a + b;
    });

    expect(captureStatements(fn)).toMatchInlineSnapshot(`
      [
        {
          "code": "  const a = 5;",
          "definesInNearestScope": true,
        },
      ]
    `);
  });

  it('captures multiple following statements', () => {
    const fn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      'use gpu';

      CAPTURE_FOLLOWING();
      const a = 5;

      CAPTURE_FOLLOWING();
      return 5 + 6 + 7;
    });

    expect(captureStatements(fn)).toMatchInlineSnapshot(`
      [
        {
          "code": "  const a = 5;",
          "definesInNearestScope": true,
        },
        {
          "code": "  return 18u;",
          "definesInNearestScope": false,
          "endsWithControlFlow": "return",
        },
      ]
    `);
  });

  it('captures statements in scope of its block', () => {
    const fn = tgpu.fn([])(() => {
      'use gpu';
      const x: number = 2;

      CAPTURE_FOLLOWING();
      for (let i = 0; i < 10; i++) {
        CAPTURE_FOLLOWING();
        const x = i + 5;
      }
    });

    expect(captureStatements(fn)).toMatchInlineSnapshot(`
      [
        {
          "code": "    let x_1 = (i + 5i);",
          "definesInNearestScope": true,
        },
        {
          "code": "  for (var i = 0; (i < 10i); i++) {
          let x_1 = (i + 5i);
        }",
          "definesInNearestScope": false,
        },
      ]
    `);
  });

  it('captures statements in a loop of unrolled iterations', () => {
    const fn = tgpu.fn([])(() => {
      'use gpu';
      for (const i of tgpu.unroll([0, 1])) {
        CAPTURE_FOLLOWING();
        const y = i + 1;
      }
    });

    expect(captureStatements(fn)).toMatchInlineSnapshot(`
      [
        {
          "code": "    const y = 1;",
          "definesInNearestScope": true,
        },
        {
          "code": "    const y = 2;",
          "definesInNearestScope": true,
        },
      ]
    `);
  });

  it('captures statements in a function call', () => {
    const fn = tgpu.fn(
      [d.u32],
      d.u32,
    )((x) => {
      'use gpu';
      CAPTURE_FOLLOWING();
      return x + 1;
    });

    const main = () => {
      'use gpu';
      CAPTURE_FOLLOWING();
      const a = 5;
      const b = fn(a);
      return b;
    };

    expect(captureStatements(main)).toMatchInlineSnapshot(`
      [
        {
          "code": "  const a = 5;",
          "definesInNearestScope": true,
        },
        {
          "code": "  return (x + 1u);",
          "definesInNearestScope": false,
          "endsWithControlFlow": "return",
        },
      ]
    `);
  });

  it('captures statement in a function scope', () => {
    const helper = tgpu.fn(
      [d.u32],
      d.u32,
    )((x) => {
      'use gpu';
      let y = x;
      y = y + 1;
      return y;
    });

    const main = tgpu.fn([])(() => {
      'use gpu';
      CAPTURE_FOLLOWING();
      let a = 5;
      const b = helper(1);

      CAPTURE_FOLLOWING();
      let y = 3;
    });

    expect(captureStatements(main)).toMatchInlineSnapshot(`
      [
        {
          "code": "  let a = 5;",
          "definesInNearestScope": true,
        },
        {
          "code": "  let y = 3;",
          "definesInNearestScope": true,
        },
      ]
    `);
  });

  it('transforms captured statements only after finished function resolution', () => {
    const helper = tgpu.fn(
      [d.u32],
      d.u32,
    )((x) => {
      'use gpu';
      return x;
    });

    const main = tgpu.fn([])(() => {
      'use gpu';
      CAPTURE_FOLLOWING();
      let a = 5;
      const b = helper(1);
      a = a + b;
    });

    expect(captureStatements(main)).toMatchInlineSnapshot(`
      [
        {
          "code": "  var a = 5;",
          "definesInNearestScope": true,
        },
      ]
    `);
  });
});
