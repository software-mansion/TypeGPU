import { useState } from 'react';
import type { d, TgpuBuffer, ValidateBufferSchema } from 'typegpu';

import { useChangeDetection, useDeferredCleanup, useStableSchema } from './helper-hooks.ts';
import { useRoot } from './root-context.tsx';

export interface UseBufferOptions<TSchema extends d.AnyData> {
  initial?: ((buffer: TgpuBuffer<TSchema>) => void) | d.InferInput<NoInfer<TSchema>>;
  onInit?: (buffer: TgpuBuffer<TSchema>) => void;
}

export function useBuffer<TSchema extends d.AnyData>(
  _schema: ValidateBufferSchema<TSchema>,
  options?: UseBufferOptions<TSchema>,
): TgpuBuffer<TSchema> {
  const { initial, onInit } = options ?? {};
  const root = useRoot();

  const [fakeState] = useState(() => {
    const buffer = root.createBuffer(_schema, initial);
    onInit?.(buffer);

    return {
      buffer,
    };
  });

  const [schema, schemaChanged] = useStableSchema(_schema);
  const rootChanged = useChangeDetection(root);

  if (schemaChanged || rootChanged) {
    fakeState.buffer.destroy();
    fakeState.buffer = root.createBuffer(schema, initial);
    onInit?.(fakeState.buffer);
  }

  useDeferredCleanup(() => {
    fakeState.buffer.destroy();
  });

  return fakeState.buffer;
}
