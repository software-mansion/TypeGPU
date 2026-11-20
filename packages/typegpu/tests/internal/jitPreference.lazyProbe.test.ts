import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Each test imports a fresh copy of `typegpu`, so that module-level state (the JIT preference
// and the memoized eval probe result) starts from scratch, and so that the `Function` spy is
// already in place while the module is being evaluated.
describe('lazy eval probe', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not probe eval on import or on writes while disabled, and probes on the first auto write', async () => {
    const FunctionSpy = vi.spyOn(globalThis, 'Function');

    const { d, setGlobalJITPreference, writeToArrayBuffer } = await import('typegpu');
    expect(FunctionSpy).not.toHaveBeenCalled();

    const Schema = d.struct({ a: d.u32, b: d.vec2f });

    setGlobalJITPreference('disabled');
    writeToArrayBuffer(new ArrayBuffer(16), Schema, { a: 1, b: d.vec2f(2, 3) });
    expect(FunctionSpy).not.toHaveBeenCalled();

    setGlobalJITPreference('auto');
    writeToArrayBuffer(new ArrayBuffer(16), Schema, { a: 1, b: d.vec2f(2, 3) });
    expect(FunctionSpy).toHaveBeenCalledWith('return true');
  });

  it('probes eval on the first write in auto mode', async () => {
    const FunctionSpy = vi.spyOn(globalThis, 'Function');

    const { d, writeToArrayBuffer } = await import('typegpu');
    expect(FunctionSpy).not.toHaveBeenCalled();

    writeToArrayBuffer(new ArrayBuffer(4), d.u32, 1);
    expect(FunctionSpy).toHaveBeenNthCalledWith(1, 'return true');
  });

  describe('in an environment that blocks eval', () => {
    beforeEach(() => {
      vi.spyOn(globalThis, 'Function').mockImplementation(() => {
        throw new EvalError('Refused to evaluate a string as JavaScript');
      });
    });

    it('warns about the fallback writer in auto mode', async () => {
      const { d, writeToArrayBuffer } = await import('typegpu');
      // Spying after the import, since re-importing `typegpu` warns about a duplicate version.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const buffer = new ArrayBuffer(4);
      writeToArrayBuffer(buffer, d.u32, 1);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[fallback]'),
        'This environment does not allow eval - using default writer as fallback',
      );
      expect(new Uint32Array(buffer)[0]).toBe(1);
    });

    it('does not log anything when JIT is disabled', async () => {
      const { d, setGlobalJITPreference, writeToArrayBuffer } = await import('typegpu');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      setGlobalJITPreference('disabled');
      const buffer = new ArrayBuffer(4);
      writeToArrayBuffer(buffer, d.u32, 1);

      expect(warnSpy).not.toHaveBeenCalled();
      expect(new Uint32Array(buffer)[0]).toBe(1);
    });
  });
});
