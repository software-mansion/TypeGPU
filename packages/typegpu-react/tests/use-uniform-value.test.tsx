import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { useUniformValue } from '@typegpu/react';
import { d, TgpuUniform } from 'typegpu';
import { it } from './utils/extended-test.tsx';
import { $buffer } from '../src/symbols.ts';

describe('useUniformValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a uniform buffer on initial render with default value', async ({
    root,
    RootWrapper,
  }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    const { result } = renderHook(() => useUniformValue(d.arrayOf(d.f32, 2)), {
      wrapper: RootWrapper,
    });

    expect(createUniformSpy).toHaveBeenCalledTimes(1);
    expect(result.current.value).toEqual([0, 0]);
  });

  it('should create a uniform buffer on initial render with provided initial value', async ({
    root,
    RootWrapper,
  }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    const { result } = renderHook(() => useUniformValue(d.f32, 1.0), { wrapper: RootWrapper });

    expect(createUniformSpy).toHaveBeenCalledTimes(1);
    expect(result.current.value).toEqual(1.0);
  });

  it('should not ignore changes to the initial value', async ({ RootWrapper, root }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    const schema = d.f32;
    const { rerender } = await act(() => {
      return renderHook(({ initial }: { initial: number }) => useUniformValue(schema, initial), {
        initialProps: { initial: 1.0 },
        wrapper: RootWrapper,
      });
    });

    rerender({ initial: 2.0 });

    expect(createUniformSpy).toHaveBeenCalledTimes(1);
    expect(root.device.queue.writeBuffer).toHaveBeenCalledTimes(0);
  });

  it('should recreate the buffer when the schema changes', ({ RootWrapper, root }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    const { rerender, result } = renderHook(
      ({ schema, initial }) => useUniformValue(schema, initial),
      {
        wrapper: RootWrapper,
        initialProps: { schema: d.f32, initial: 1.0 } as {
          schema: d.AnyWgslData;
          initial: d.InferInput<d.AnyWgslData>;
        },
      },
    );

    expect(createUniformSpy).toHaveBeenCalledTimes(1);
    expect(result.current.value).toEqual(1.0);

    const createdUniform = createUniformSpy.mock.results[0]?.value as TgpuUniform<d.AnyWgslData>;
    using destroyUniformSpy = vi.spyOn(createdUniform.buffer, 'destroy');

    rerender({ schema: d.vec2f, initial: d.vec2f(1, 2) });

    expect(createUniformSpy).toHaveBeenCalledTimes(2);
    expect(destroyUniformSpy).toHaveBeenCalledTimes(1);
    expect(result.current.value).toEqual(d.vec2f(1, 2));
  });

  it('should not recreate the buffer for deeply equal schemas', ({ RootWrapper, root }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    const schema1 = d.struct({ a: d.f32 });
    const schema2 = d.struct({ a: d.f32 });

    const { rerender, result } = renderHook(
      ({ schema, initial }: { schema: d.AnyWgslData; initial: d.Infer<d.AnyWgslData> }) =>
        useUniformValue(schema, initial),
      {
        wrapper: RootWrapper,
        initialProps: { schema: schema1, initial: { a: 1.0 } },
      },
    );

    expect(createUniformSpy).toHaveBeenCalledTimes(1);

    const firstResult = result.current;
    rerender({ schema: schema2, initial: { a: 2.0 } });

    expect(createUniformSpy).toHaveBeenCalledTimes(1);
    // The value should have been memoized and should be stable
    expect(result.current).toBe(firstResult);
  });

  it('should update memoized value when schema content actually changes', ({
    RootWrapper,
    root,
  }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    const schema1 = d.struct({ a: d.f32 });
    const schema2 = d.struct({ a: d.f32, b: d.f32 });

    const { result, rerender } = renderHook(
      ({ schema, initial }: { schema: d.AnyWgslData; initial: d.Infer<d.AnyWgslData> }) =>
        useUniformValue(schema, initial),
      {
        wrapper: RootWrapper,
        initialProps: { schema: schema1, initial: { a: 1.0 } } as {
          schema: d.AnyWgslData;
          initial: d.Infer<d.AnyWgslData>;
        },
      },
    );

    const firstResult = result.current;
    expect(createUniformSpy).toHaveBeenCalledTimes(1);

    rerender({ schema: schema2, initial: { a: 1.0, b: 2.0 } });

    expect(result.current === firstResult).not.toBe(true);
    expect(createUniformSpy).toHaveBeenCalledTimes(2);
  });

  it('should use stable schema reference', ({ RootWrapper }) => {
    const schema1 = d.struct({ a: d.f32 });
    const schema2 = d.struct({ a: d.f32 });

    const { result, rerender } = renderHook(
      ({ schema, initial }) => useUniformValue(schema, initial),
      {
        wrapper: RootWrapper,
        initialProps: { schema: schema1, initial: { a: 1.0 } },
      },
    );

    const initialSchema = result.current.schema;

    rerender({ schema: schema2, initial: { a: 1.0 } });

    expect(result.current.schema).toBe(initialSchema);
    expect(result.current.schema).toBe(schema1);
    expect(result.current.schema).not.toBe(schema2);
  });

  describe('React StrictMode compatibility', () => {
    it('should handle buffer creation in normal mode', async ({ RootWrapper, root }) => {
      using createUniformSpy = vi.spyOn(root, 'createUniform');

      renderHook(() => useUniformValue(d.f32, 1.0), { wrapper: RootWrapper });

      expect(createUniformSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle buffer creation in StrictMode', async ({ RootWrapper, root }) => {
      using createUniformSpy = vi.spyOn(root, 'createUniform');

      renderHook(() => useUniformValue(d.f32, 1.0), {
        wrapper: RootWrapper,
        reactStrictMode: true,
      });

      // Creates uniform twice, and discards one of them
      expect(createUniformSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup timeouts in StrictMode', async ({ RootWrapper, root }) => {
      using createUniformSpy = vi.spyOn(root, 'createUniform');

      const { unmount, result } = renderHook(() => useUniformValue(d.f32, 1.0), {
        wrapper: RootWrapper,
        reactStrictMode: true,
      });

      expect(createUniformSpy).toHaveBeenCalledTimes(2);
      const createdBuffer = result.current[$buffer];
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
