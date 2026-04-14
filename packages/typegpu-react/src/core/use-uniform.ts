import { useState } from 'react';
import type { TgpuUniform, d, ValidateUniformSchema } from 'typegpu';

import { useRoot } from './root-context.tsx';
import { useChangeDetection, useDeferredCleanup, useStableSchema } from './helper-hooks.ts';

export interface UseUniformOptions<TSchema extends d.AnyWgslData> {
  // TODO: Allow passing a function once it's possible for vanilla shorthands
  // initial?: ((buffer: TgpuBuffer<TSchema>) => void) | d.InferInput<NoInfer<TSchema>>;
  initial?: d.InferInput<NoInfer<TSchema>>;
  onInit?: (buffer: TgpuUniform<TSchema>) => void;
}

export function useUniform<TSchema extends d.AnyWgslData>(
  _schema: ValidateUniformSchema<TSchema>,
  options?: UseUniformOptions<TSchema>,
): TgpuUniform<TSchema> {
  const { initial, onInit } = options ?? {};
  const root = useRoot();
  const [fakeState] = useState(() => {
    const uniform = root.createUniform(_schema, initial);
    onInit?.(uniform);

    return { uniform };
  });

  const [schema, schemaChanged] = useStableSchema(_schema);
  const rootChanged = useChangeDetection(root);

  if (schemaChanged || rootChanged) {
    fakeState.uniform.buffer.destroy();
    fakeState.uniform = root.createUniform(schema, initial);
    onInit?.(fakeState.uniform);
  }

  useDeferredCleanup(() => {
    fakeState.uniform.buffer.destroy();
  });

  return fakeState.uniform;
}
