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
    const withCapture = tgpu.fn(
      [d.u32],
      d.u32,
    )((x) => {
      'use gpu';
      CAPTURE_FOLLOWING();
      return x + 1;
    });
    const withoutCapture = tgpu.fn(
      [d.u32],
      d.u32,
    )((x) => {
      'use gpu';
      return x + 1;
    });

    const normalizeName = (code: string) => code.replace(/fn \w+/, 'fn captured');
    expect(normalizeName(tgpu.resolve([withCapture]))).toBe(
      normalizeName(tgpu.resolve([withoutCapture])),
    );
  });

  it('captures the following resolved statement', () => {
    const fn = tgpu.fn(
      [d.u32],
      d.u32,
    )((x) => {
      'use gpu';
      CAPTURE_FOLLOWING();
      const y = x + 1;
      return y;
    });

    expect(captureStatements(fn)).toEqual([
      {
        code: '  let y = (x + 1u);',
        definesInNearestScope: true,
      },
    ]);
  });

  it('captures an outer statement instead of its nested statements', () => {
    const fn = tgpu.fn(
      [d.u32],
      d.u32,
    )((x) => {
      'use gpu';
      CAPTURE_FOLLOWING();
      if (x > 0) {
        return x;
      }
      return 0;
    });

    const captured = captureStatements(fn);
    expect(captured).toHaveLength(1);
    expect(captured[0]?.code).toContain('if (');
    expect(captured[0]?.code).toContain('return x;');
  });

  it('rejects a marker without a following statement', () => {
    const fn = () => {
      'use gpu';
      CAPTURE_FOLLOWING();
    };

    expect(() => captureStatements(fn)).toThrow(
      'CAPTURE_FOLLOWING must be followed by a statement',
    );
  });

  it('does not carry an unfinished capture into another function', () => {
    const unfinished = () => {
      'use gpu';
      CAPTURE_FOLLOWING();
    };
    const unrelated = () => {
      'use gpu';
      const value = 1;
    };
    const fn = () => {
      'use gpu';
      unfinished();
      unrelated();
    };

    expect(() => captureStatements(fn)).toThrow(
      'CAPTURE_FOLLOWING must be followed by a statement',
    );
  });
});
