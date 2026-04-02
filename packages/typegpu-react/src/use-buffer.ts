import type * as d from 'typegpu/data';
import { useRoot } from './root-context.tsx';
import { useState } from 'react';
import type { TgpuBuffer, ValidateBufferSchema } from 'typegpu';
import { useDeferredCleanup } from './helper-hooks.ts';

export interface UseBufferOptions<TSchema extends d.AnyData> {
  initial?:
    | ((buffer: TgpuBuffer<TSchema>) => d.InferInput<NoInfer<TSchema>>)
    | d.InferInput<NoInfer<TSchema>>;
  onInit?: (buffer: TgpuBuffer<TSchema>) => void;
}

// TODO: Recreate the buffer when the schema changes
export function useBuffer<TSchema extends d.AnyData>(
  schema: ValidateBufferSchema<TSchema>,
  options?: UseBufferOptions<TSchema>,
): TgpuBuffer<TSchema> {
  const { initial, onInit } = options ?? {};
  const root = useRoot();

  const [fakeState] = useState(() => {
    // TODO: The cast to any should not be necessary
    const buffer = root.createBuffer(schema, initial);
    onInit?.(buffer);

    return {
      buffer,
    };
  });

  useDeferredCleanup(() => {
    fakeState.buffer.destroy();
  });

  return fakeState.buffer;
}
