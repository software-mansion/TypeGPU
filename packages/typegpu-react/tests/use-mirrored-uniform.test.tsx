import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { useMirroredUniform } from '@typegpu/react';
import { d, TgpuUniform } from 'typegpu';
import { it } from './utils/extended-test.tsx';
import { $buffer } from '../src/symbols.ts';

describe('useMirroredUniform', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a uniform buffer on initial render', async ({ root, RootWrapper }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    renderHook(() => useMirroredUniform(d.f32, 1.0), { wrapper: RootWrapper });

    expect(createUniformSpy).toHaveBeenCalledTimes(1);
  });

  it('should not recreate the buffer when the value changes but the schema is the same', async ({
    RootWrapper,
    root,
  }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    const schema = d.f32;
    const { rerender } = await act(() => {
      return renderHook(({ value }: { value: number }) => useMirroredUniform(schema, value), {
        initialProps: { value: 1.0 },
        wrapper: RootWrapper,
      });
    });

    expect(createUniformSpy).toHaveBeenCalledTimes(1);
    expect(root.device.queue.writeBuffer).toHaveBeenCalledTimes(0);

    rerender({ value: 2.0 });

    expect(createUniformSpy).toHaveBeenCalledTimes(1);
    expect(root.device.queue.writeBuffer).toHaveBeenCalledTimes(1);
  });

  it('should recreate the buffer when the schema changes', ({ RootWrapper, root }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    const { rerender } = renderHook(({ schema, value }) => useMirroredUniform(schema, value), {
      wrapper: RootWrapper,
      initialProps: { schema: d.f32, value: 1.0 } as {
        schema: d.AnyWgslData;
        value: d.InferInput<d.AnyWgslData>;
      },
    });

    expect(createUniformSpy).toHaveBeenCalledTimes(1);
    const createdUniform = createUniformSpy.mock.results[0]?.value as TgpuUniform<d.AnyWgslData>;

    using destroyUniformSpy = vi.spyOn(createdUniform.buffer, 'destroy');

    rerender({ schema: d.vec2f, value: d.vec2f(1, 2) });

    expect(createUniformSpy).toHaveBeenCalledTimes(2);
    expect(destroyUniformSpy).toHaveBeenCalledTimes(1);
    expect(createUniformSpy).toHaveBeenCalledWith(d.vec2f, d.vec2f(1, 2));
  });

  it('should not recreate the buffer for deeply equal schemas', ({ RootWrapper, root }) => {
    using createUniformSpy = vi.spyOn(root, 'createUniform');

    const schema1 = d.struct({ a: d.f32 });
    const schema2 = d.struct({ a: d.f32 });

    const { rerender, result } = renderHook(
      ({ schema, value }: { schema: d.AnyWgslData; value: d.Infer<d.AnyWgslData> }) =>
        useMirroredUniform(schema, value),
      {
        wrapper: RootWrapper,
        initialProps: { schema: schema1, value: { a: 1.0 } },
      },
    );

    expect(createUniformSpy).toHaveBeenCalledTimes(1);

    const firstResult = result.current;
    rerender({ schema: schema2, value: { a: 2.0 } });

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
      ({ schema, value }: { schema: d.AnyWgslData; value: d.Infer<d.AnyWgslData> }) =>
        useMirroredUniform(schema, value),
      {
        wrapper: RootWrapper,
        initialProps: { schema: schema1, value: { a: 1.0 } } as {
          schema: d.AnyWgslData;
          value: d.Infer<d.AnyWgslData>;
        },
      },
    );

    const firstResult = result.current;
    expect(createUniformSpy).toHaveBeenCalledTimes(1);

    rerender({ schema: schema2, value: { a: 1.0, b: 2.0 } });

    expect(result.current === firstResult).not.toBe(true);
    expect(createUniformSpy).toHaveBeenCalledTimes(2);
  });

  it('should use stable schema reference', ({ RootWrapper }) => {
    const schema1 = d.struct({ a: d.f32 });
    const schema2 = d.struct({ a: d.f32 });

    const { result, rerender } = renderHook(
      ({ schema, value }) => useMirroredUniform(schema, value),
      {
        wrapper: RootWrapper,
        initialProps: { schema: schema1, value: { a: 1.0 } },
      },
    );

    const initialSchema = result.current.schema;

    rerender({ schema: schema2, value: { a: 1.0 } });

    expect(result.current.schema).toBe(initialSchema);
    expect(result.current.schema).toBe(schema1);
    expect(result.current.schema).not.toBe(schema2);
  });

  describe('React StrictMode compatibility', () => {
    it('should handle buffer creation in normal mode', async ({ RootWrapper, root }) => {
      using createUniformSpy = vi.spyOn(root, 'createUniform');

      renderHook(() => useMirroredUniform(d.f32, 1.0), { wrapper: RootWrapper });

      expect(createUniformSpy).toHaveBeenCalledTimes(1);
    });

    it('should handle buffer creation in StrictMode', async ({ RootWrapper, root }) => {
      using createUniformSpy = vi.spyOn(root, 'createUniform');

      renderHook(() => useMirroredUniform(d.f32, 1.0), {
        wrapper: RootWrapper,
        reactStrictMode: true,
      });

      // Creates uniform twice, and discards one of them
      expect(createUniformSpy).toHaveBeenCalledTimes(2);
    });

    it('should handle value updates in StrictMode', async ({ RootWrapper, root }) => {
      using createUniformSpy = vi.spyOn(root, 'createUniform');

      const { rerender } = renderHook(({ value }) => useMirroredUniform(d.f32, value), {
        wrapper: RootWrapper,
        reactStrictMode: true,
        initialProps: { value: 1 },
      });

      // Creates uniform twice, and discards one of them
      expect(createUniformSpy).toHaveBeenCalledTimes(2);
      expect(root.device.queue.writeBuffer).toHaveBeenCalledTimes(0);

      rerender({ value: 2 });

      // Doesn't recreate buffer on value update
      expect(createUniformSpy).toHaveBeenCalledTimes(2);
      expect(root.device.queue.writeBuffer).toHaveBeenCalledTimes(1);
    });

    it('should handle cleanup timeouts in StrictMode', async ({ RootWrapper, root }) => {
      using createUniformSpy = vi.spyOn(root, 'createUniform');

      const { unmount, result } = renderHook(() => useMirroredUniform(d.f32, 1.0), {
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
