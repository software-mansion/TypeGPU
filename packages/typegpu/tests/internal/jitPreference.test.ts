import { afterEach, describe, expect, vi } from 'vitest';
import { d, setGlobalJITPreference, writeToArrayBuffer } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('setGlobalJITPreference', () => {
  afterEach(() => {
    setGlobalJITPreference('auto');
    vi.restoreAllMocks();
  });

  it('compiles writers with eval by default', () => {
    const FunctionSpy = vi.spyOn(globalThis, 'Function');

    const Schema = d.struct({ a: d.u32, b: d.vec2f });
    writeToArrayBuffer(new ArrayBuffer(16), Schema, { a: 1, b: d.vec2f(2, 3) });

    expect(FunctionSpy).toHaveBeenCalled();
  });

  it('does not call eval when disabled', () => {
    setGlobalJITPreference('disabled');
    const FunctionSpy = vi.spyOn(globalThis, 'Function');

    const Schema = d.struct({ a: d.u32, b: d.vec2f });
    const buffer = new ArrayBuffer(16);
    writeToArrayBuffer(buffer, Schema, { a: 1, b: d.vec2f(2, 3) });

    expect(FunctionSpy).not.toHaveBeenCalled();
    expect(new Uint32Array(buffer)[0]).toBe(1);
    expect([...new Float32Array(buffer, 8, 2)]).toStrictEqual([2, 3]);
  });
});
