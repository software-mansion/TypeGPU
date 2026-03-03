import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as d from 'typegpu/data';
import { useMirroredUniform } from '../src/use-mirrored-uniform.ts';
import * as rootContext from '../src/root-context.tsx';
import type { TgpuRoot } from 'typegpu';
import React from 'react';

const createUniformMock = vi.fn();
const writeMock = vi.fn();
const destroyMock = vi.fn();

const mockUniformBuffer = {
  write: writeMock,
  buffer: {
    destroy: destroyMock,
  },
  $: {},
};

vi.spyOn(rootContext, 'useRoot').mockImplementation(
  () =>
    ({
      createUniform: createUniformMock.mockImplementation(
        () => mockUniformBuffer,
      ),
    }) as Partial<TgpuRoot> as TgpuRoot,
);

describe('useMirroredUniform', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    createUniformMock.mockClear();
    writeMock.mockClear();
    destroyMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic functionality', () => {
    it('should create a uniform buffer on initial render', () => {
      const schema = d.f32;
      const value = 1.0;
      renderHook(() => useMirroredUniform(schema, value));
      expect(createUniformMock).toHaveBeenCalledTimes(1);
      expect(createUniformMock).toHaveBeenCalledWith(schema, value);
    });

    it('should not recreate the buffer when the value changes but the schema is the same', () => {
      const schema = d.f32;
      const { rerender } = renderHook(
        ({ value }: { value: number }) => useMirroredUniform(schema, value),
        {
          initialProps: { value: 1.0 },
        },
      );

      expect(createUniformMock).toHaveBeenCalledTimes(1);

      rerender({ value: 2.0 });

      expect(createUniformMock).toHaveBeenCalledTimes(1);
      expect(writeMock).toHaveBeenCalledWith(2.0);
    });
  });

  describe('Schema change handling', () => {
    it('should recreate the buffer when the schema changes', () => {
      const { rerender } = renderHook(
        ({
          schema,
          value,
        }: {
          schema: d.AnyWgslData;
          value: d.Infer<d.AnyWgslData>;
        }) => useMirroredUniform(schema, value),
        {
          initialProps: { schema: d.f32, value: 1.0 } as {
            schema: d.AnyWgslData;
            value: d.Infer<d.AnyWgslData>;
          },
        },
      );

      expect(createUniformMock).toHaveBeenCalledTimes(1);

      rerender({ schema: d.vec2f, value: d.vec2f(1, 2) });

      expect(createUniformMock).toHaveBeenCalledTimes(2);
      expect(destroyMock).toHaveBeenCalledTimes(1);
      expect(createUniformMock).toHaveBeenCalledWith(d.vec2f, d.vec2f(1, 2));
    });

    it('should not recreate the buffer for deeply equal schemas', () => {
      const schema1 = d.struct({ a: d.f32 });
      const schema2 = d.struct({ a: d.f32 });

      const { rerender } = renderHook(
        ({
          schema,
          value,
        }: {
          schema: d.AnyWgslData;
          value: d.Infer<d.AnyWgslData>;
        }) => useMirroredUniform(schema, value),
        {
          initialProps: { schema: schema1, value: { a: 1.0 } },
        },
      );

      expect(createUniformMock).toHaveBeenCalledTimes(1);

      rerender({ schema: schema2, value: { a: 2.0 } });

      expect(createUniformMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Memoization stability', () => {
    it('should maintain stable memoized value when schema reference changes but content is identical', () => {
      const schema1 = d.struct({ a: d.f32 });
      const schema2 = d.struct({ a: d.f32 });

      const { result, rerender } = renderHook(
        ({ schema, value }) => useMirroredUniform(schema, value),
        {
          initialProps: { schema: schema1, value: { a: 1.0 } },
        },
      );

      const firstResult = result.current;

      rerender({ schema: schema2, value: { a: 1.0 } });

      expect(result.current).toBe(firstResult);
      expect(createUniformMock).toHaveBeenCalledTimes(1);
    });

    it('should update memoized value when schema content actually changes', () => {
      const schema1 = d.struct({ a: d.f32 });
      const schema2 = d.struct({ a: d.f32, b: d.f32 });

      const { result, rerender } = renderHook(
        ({
          schema,
          value,
        }: {
          schema: d.AnyWgslData;
          value: d.Infer<d.AnyWgslData>;
        }) => useMirroredUniform(schema, value),
        {
          initialProps: { schema: schema1, value: { a: 1.0 } } as {
            schema: d.AnyWgslData;
            value: d.Infer<d.AnyWgslData>;
          },
        },
      );

      const firstResult = result.current;

      rerender({ schema: schema2, value: { a: 1.0, b: 2.0 } });

      expect(result.current).not.toBe(firstResult);
      expect(createUniformMock).toHaveBeenCalledTimes(2);
    });

    it('should use currentSchemaRef in returned schema property', () => {
      const schema1 = d.struct({ a: d.f32 });
      const schema2 = d.struct({ a: d.f32 });

      const { result, rerender } = renderHook(
        ({ schema, value }) => useMirroredUniform(schema, value),
        {
          initialProps: { schema: schema1, value: { a: 1.0 } },
        },
      );

      const initialSchema = result.current.schema;

      rerender({ schema: schema2, value: { a: 1.0 } });

      expect(result.current.schema).toBe(initialSchema);
      expect(result.current.schema).toBe(schema1);
      expect(result.current.schema).not.toBe(schema2);
    });
  });

  describe('React StrictMode compatibility', () => {
    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    );
    const StrictModeWrapper = ({ children }: { children: React.ReactNode }) => (
      <React.StrictMode>{children}</React.StrictMode>
    );

    it('should handle buffer creation in normal mode', () => {
      const { result } = renderHook(
        () => useMirroredUniform(d.f32, 1.0),
        {
          wrapper: TestWrapper,
        },
      );

      expect({
        createUniformCallCount: createUniformMock.mock.calls.length,
        writeCallCount: writeMock.mock.calls.length,
        result: result.current,
      }).toMatchInlineSnapshot(`
        {
          "createUniformCallCount": 1,
          "result": {
            "$": {},
            "schema": [Function],
          },
          "writeCallCount": 1,
        }
      `);
    });

    it('should handle buffer creation in StrictMode', () => {
      const { result } = renderHook(
        () => useMirroredUniform(d.f32, 1.0),
        {
          wrapper: StrictModeWrapper,
        },
      );

      expect({
        createUniformCallCount: createUniformMock.mock.calls.length,
        writeCallCount: writeMock.mock.calls.length,
        destroyCallCount: destroyMock.mock.calls.length,
        result: result.current,
      }).toMatchInlineSnapshot(`
        {
          "createUniformCallCount": 2,
          "destroyCallCount": 0,
          "result": {
            "$": {},
            "schema": [Function],
          },
          "writeCallCount": 1,
        }
      `);
    });

    it('should handle value updates in StrictMode', () => {
      let value = 1.0;
      const { rerender } = renderHook(
        () => useMirroredUniform(d.f32, value),
        {
          wrapper: StrictModeWrapper,
        },
      );

      const initialState = {
        createUniformCallCount: createUniformMock.mock.calls.length,
        writeCallCount: writeMock.mock.calls.length,
      };

      value = 2.0;
      rerender();

      expect({
        initial: initialState,
        afterUpdate: {
          createUniformCallCount: createUniformMock.mock.calls.length,
          writeCallCount: writeMock.mock.calls.length,
        },
        bufferNotRecreated: initialState.createUniformCallCount ===
          createUniformMock.mock.calls.length,
      }).toMatchInlineSnapshot(`
        {
          "afterUpdate": {
            "createUniformCallCount": 2,
            "writeCallCount": 2,
          },
          "bufferNotRecreated": true,
          "initial": {
            "createUniformCallCount": 2,
            "writeCallCount": 1,
          },
        }
      `);
    });

    it('should handle cleanup timeouts in StrictMode', async () => {
      const { unmount } = renderHook(
        () => useMirroredUniform(d.f32, 1.0),
        {
          wrapper: StrictModeWrapper,
        },
      );

      const preUnmountState = {
        destroyCallCount: destroyMock.mock.calls.length,
      };

      unmount();

      const postUnmountPreTimeout = {
        destroyCallCount: destroyMock.mock.calls.length,
      };

      vi.runAllTimers();

      expect({
        preUnmount: preUnmountState,
        postUnmountPreTimeout,
        afterTimeout: {
          destroyCallCount: destroyMock.mock.calls.length,
        },
      }).toMatchInlineSnapshot(`
        {
          "afterTimeout": {
            "destroyCallCount": 1,
          },
          "postUnmountPreTimeout": {
            "destroyCallCount": 0,
          },
          "preUnmount": {
            "destroyCallCount": 0,
          },
        }
      `);
    });
  });
});
