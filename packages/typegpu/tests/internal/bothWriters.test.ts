import { describe, expect, it } from 'vitest';
import { writeWithBothWriters } from 'typegpu-testing-utility';

/** Runs `run` with a `Function` spy installed by the "calling test", then puts the original back. */
async function withCallerFunctionSpy(run: (spy: FunctionConstructor) => Promise<void>) {
  const original = globalThis.Function;
  const spy = new Proxy(original, {});
  globalThis.Function = spy;
  try {
    await run(spy);
  } finally {
    globalThis.Function = original;
  }
}

const writeU32 = () =>
  writeWithBothWriters(({ d }) => ({
    schema: d.u32,
    value: 7,
  }));

// The write throws while the helper has `Function` intercepted.
const writeThatThrows = () =>
  writeWithBothWriters(({ d }) => ({
    schema: d.struct({ a: d.u32 }),
    value: undefined as never,
  }));

describe('writeWithBothWriters', () => {
  it('leaves a Function spy installed by the caller in place after a successful call', async () => {
    await withCallerFunctionSpy(async (spy) => {
      const { bytes } = await writeU32();

      expect([...new Uint32Array(bytes)]).toStrictEqual([7]);
      expect(globalThis.Function).toBe(spy);
    });
  });

  it('leaves a Function spy installed by the caller in place after a call that throws', async () => {
    await withCallerFunctionSpy(async (spy) => {
      await expect(writeThatThrows()).rejects.toThrow();

      expect(globalThis.Function).toBe(spy);
    });
  });

  it('restores the original Function and keeps working after a call that throws', async () => {
    const original = globalThis.Function;

    // Started together on purpose, the second call has to wait for the first one to fail.
    const [failed, succeeded] = await Promise.allSettled([writeThatThrows(), writeU32()]);

    expect(failed.status).toBe('rejected');
    expect(succeeded.status).toBe('fulfilled');
    expect(globalThis.Function).toBe(original);

    const { bytes } = await writeU32();
    expect([...new Uint32Array(bytes)]).toStrictEqual([7]);
    expect(globalThis.Function).toBe(original);
  });
});
