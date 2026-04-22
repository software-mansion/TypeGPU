import { useState } from 'react';
import type { TgpuMutable, ValidateStorageSchema, d } from 'typegpu';

import { useRoot } from './root-context.tsx';
import { useChangeDetection, useDeferredCleanup, useStableSchema } from './helper-hooks.ts';

export interface UseMutableOptions<TSchema extends d.AnyWgslData> {
  // TODO: Allow passing a function once it's possible for vanilla shorthands
  // initial?: ((buffer: TgpuBuffer<TSchema>) => void) | d.InferInput<NoInfer<TSchema>>;
  initial?: d.InferInput<NoInfer<TSchema>>;
  onInit?: (buffer: TgpuMutable<TSchema>) => void;
}

export function useMutable<TSchema extends d.AnyWgslData>(
  _schema: ValidateStorageSchema<TSchema>,
  options?: UseMutableOptions<TSchema>,
): TgpuMutable<TSchema> {
  const { initial, onInit } = options ?? {};
  const root = useRoot();
  const [fakeState] = useState(() => {
    const mutable = root.createMutable(_schema, initial);
    onInit?.(mutable);

    return { mutable };
  });

  const [schema, schemaChanged] = useStableSchema(_schema);
  const rootChanged = useChangeDetection(root);

  if (schemaChanged || rootChanged) {
    fakeState.mutable.buffer.destroy();
    fakeState.mutable = root.createMutable(schema, initial);
    onInit?.(fakeState.mutable);
  }

  useDeferredCleanup(() => {
    fakeState.mutable.buffer.destroy();
  });

  return fakeState.mutable;
}
