import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { useBuffer } from '@typegpu/react';
import { d, TgpuBuffer, TgpuUniform } from 'typegpu';
import { it } from './utils/extended-test.tsx';
import { $buffer } from '../src/symbols.ts';

describe('useBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a buffer on initial render', async ({ root, RootWrapper }) => {
    using createBufferSpy = vi.spyOn(root, 'createBuffer');

    renderHook(() => useBuffer(d.f32, { initial: 1.0 }), { wrapper: RootWrapper });

    expect(createBufferSpy).toHaveBeenCalledTimes(1);
  });

  it('should ignore changes to the initial value', async ({ RootWrapper, root }) => {
    using createBufferSpy = vi.spyOn(root, 'createBuffer');

    const schema = d.f32;
    const { rerender } = await act(() => {
      return renderHook(({ value }: { value: number }) => useBuffer(schema, { initial: value }), {
        initialProps: { value: 1.0 },
        wrapper: RootWrapper,
      });
    });

    expect(createBufferSpy).toHaveBeenCalledTimes(1);

    rerender({ value: 2.0 });

    expect(createBufferSpy).toHaveBeenCalledTimes(1);
    expect(root.device.queue.writeBuffer).toHaveBeenCalledTimes(0);
  });

  it('should recreate the buffer when the schema changes', ({ RootWrapper, root }) => {
    using createBufferSpy = vi.spyOn(root, 'createBuffer');

    const { rerender } = renderHook(({ schema, value }) => useBuffer(schema, { initial: value }), {
      wrapper: RootWrapper,
      initialProps: { schema: d.f32, value: 1.0 } as {
        schema: d.AnyWgslData;
        value: d.InferInput<d.AnyWgslData>;
      },
    });

    expect(createBufferSpy).toHaveBeenCalledTimes(1);
    const createdBuffer = createBufferSpy.mock.results[0]?.value as TgpuBuffer<d.AnyWgslData>;

    using destroyBufferSpy = vi.spyOn(createdBuffer.buffer, 'destroy');

    rerender({ schema: d.vec2f, value: d.vec2f(1, 2) });

    expect(createBufferSpy).toHaveBeenCalledTimes(2);
    expect(destroyBufferSpy).toHaveBeenCalledTimes(1);
    expect(createBufferSpy).toHaveBeenCalledWith(d.vec2f, d.vec2f(1, 2));
  });

  it('should not recreate the buffer for deeply equal schemas', ({ RootWrapper, root }) => {
    using createBufferSpy = vi.spyOn(root, 'createBuffer');

    const schema1 = d.struct({ a: d.f32 });
    const schema2 = d.struct({ a: d.f32 });

    const { rerender, result } = renderHook(
      ({ schema, value }: { schema: d.AnyWgslData; value: d.Infer<d.AnyWgslData> }) =>
        useBuffer(schema, { initial: value }),
      {
        wrapper: RootWrapper,
        initialProps: { schema: schema1, value: { a: 1.0 } },
      },
    );

    expect(createBufferSpy).toHaveBeenCalledTimes(1);

    const firstResult = result.current;
    rerender({ schema: schema2, value: { a: 2.0 } });

    expect(createBufferSpy).toHaveBeenCalledTimes(1);
    // The value should have been memoized and should be stable
    expect(result.current).toBe(firstResult);
  });

  describe('React StrictMode compatibility', () => {
    it('should handle buffer creation in normal mode', async ({ RootWrapper, root }) => {
      using createBufferSpy = vi.spyOn(root, 'createBuffer');

      renderHook(() => useBuffer(d.f32, { initial: 1.0 }), { wrapper: RootWrapper });

      expect(createBufferSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle buffer creation in StrictMode', async ({ RootWrapper, root }) => {
      using createBufferSpy = vi.spyOn(root, 'createBuffer');

      renderHook(() => useBuffer(d.f32, { initial: 1.0 }), {
        wrapper: RootWrapper,
        reactStrictMode: true,
      });

      // Creates uniform twice, and discards one of them
      expect(createBufferSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup timeouts in StrictMode', async ({ RootWrapper, root }) => {
      using createBufferSpy = vi.spyOn(root, 'createBuffer');

      const { unmount, result } = renderHook(() => useBuffer(d.f32, { initial: 1.0 }), {
        wrapper: RootWrapper,
        reactStrictMode: true,
      });

      expect(createBufferSpy).toHaveBeenCalledTimes(2);
      const createdBuffer = result.current;
      using destroyBufferSpy = vi.spyOn(createdBuffer, 'destroy');

      // Wait for a (potential) cleanup timeout
      vi.runAllTimers();

      // The timeout should have been cleaned up
      expect(destroyBufferSpy).not.toHaveBeenCalled();

      unmount();

      // Not destroyed yet
      expect(destroyBufferSpy).not.toHaveBeenCalled();

      vi.runAllTimers();

      expect(destroyBufferSpy).toHaveBeenCalledTimes(1);
    });
  });
});
