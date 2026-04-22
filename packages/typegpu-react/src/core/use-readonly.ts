import { useState } from 'react';
import type { TgpuReadonly, ValidateStorageSchema, d } from 'typegpu';

import { useRoot } from './root-context.tsx';
import { useChangeDetection, useDeferredCleanup, useStableSchema } from './helper-hooks.ts';

export interface UseReadonlyOptions<TSchema extends d.AnyWgslData> {
  // TODO: Allow passing a function once it's possible for vanilla shorthands
  // initial?: ((buffer: TgpuBuffer<TSchema>) => void) | d.InferInput<NoInfer<TSchema>>;
  initial?: d.InferInput<NoInfer<TSchema>>;
  onInit?: (buffer: TgpuReadonly<TSchema>) => void;
}

export function useReadonly<TSchema extends d.AnyWgslData>(
  _schema: ValidateStorageSchema<TSchema>,
  options?: UseReadonlyOptions<TSchema>,
): TgpuReadonly<TSchema> {
  const { initial, onInit } = options ?? {};
  const root = useRoot();
  const [fakeState] = useState(() => {
    const readonly = root.createReadonly(_schema, initial);
    onInit?.(readonly);

    return { readonly };
  });

  const [schema, schemaChanged] = useStableSchema(_schema);
  const rootChanged = useChangeDetection(root);

  if (schemaChanged || rootChanged) {
    fakeState.readonly.buffer.destroy();
    fakeState.readonly = root.createReadonly(schema, initial);
    onInit?.(fakeState.readonly);
  }

  useDeferredCleanup(() => {
    fakeState.readonly.buffer.destroy();
  });

  return fakeState.readonly;
}
