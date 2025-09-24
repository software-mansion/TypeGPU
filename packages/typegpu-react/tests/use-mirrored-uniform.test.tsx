import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as d from 'typegpu/data';
import { useMirroredUniform } from '../src/use-mirrored-uniform.ts';
import * as rootContext from '../src/root-context.tsx';
import type { TgpuRoot } from 'typegpu';

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

vi.spyOn(rootContext, 'useRoot').mockImplementation(() => ({
  createUniform: createUniformMock.mockImplementation(() => mockUniformBuffer),
} as Partial<TgpuRoot> as TgpuRoot));

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
      ({ value }) => useMirroredUniform(schema, value),
      {
        initialProps: { value: 1.0 },
      },
    );

    expect(createUniformMock).toHaveBeenCalledTimes(1);

    rerender({ value: 2.0 });

    expect(createUniformMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledWith(2.0);
  });

  it('should recreate the buffer when the schema changes', () => {
    const { rerender } = renderHook(
      ({ schema, value }) => useMirroredUniform(schema, value),
      {
        initialProps: { schema: d.f32, value: 1.0 } as {
          schema: d.AnyWgslData;
          value: d.Infer<d.AnyWgslData>;
        },
      },
    );

    expect(createUniformMock).toHaveBeenCalledTimes(1);

    // Rerender with a new schema
    rerender({ schema: d.vec2f, value: d.vec2f(1, 2) });

    expect(createUniformMock).toHaveBeenCalledTimes(2);
    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(createUniformMock).toHaveBeenCalledWith(d.vec2f, d.vec2f(1, 2));
  });

  it('should not recreate the buffer for deeply equal schemas', () => {
    const schema1 = d.struct({ a: d.f32 });
    const schema2 = d.struct({ a: d.f32 });

    const { rerender } = renderHook(
      ({ schema, value }) => useMirroredUniform(schema, value),
      {
        initialProps: { schema: schema1, value: { a: 1.0 } },
      },
    );

    expect(createUniformMock).toHaveBeenCalledTimes(1);

    rerender({ schema: schema2, value: { a: 2.0 } });

    expect(createUniformMock).toHaveBeenCalledTimes(1);
  });
});
