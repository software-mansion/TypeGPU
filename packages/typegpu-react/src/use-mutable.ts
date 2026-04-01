import { useState } from 'react';
import type { TgpuMutable, ValidateStorageSchema, d } from 'typegpu';

import { useRoot } from './root-context.tsx';
import { useChangeDetection, useDeferredCleanup, useStableSchema } from './helper-hooks.ts';

export function useMutable<TSchema extends d.AnyWgslData>(
  _schema: ValidateStorageSchema<TSchema>,
  initialValue?: d.Infer<TSchema>,
): TgpuMutable<TSchema> {
  const root = useRoot();
  const [fakeState] = useState(() => ({
    // TODO: The cast to d.InferInput<TSchema> should not be necessary
    mutable: root.createMutable(_schema, initialValue as d.InferInput<TSchema>),
  }));

  const [schema, schemaChanged] = useStableSchema(_schema);
  const rootChanged = useChangeDetection(root);

  if (schemaChanged || rootChanged) {
    fakeState.mutable.buffer.destroy();
    // TODO: The cast to d.InferInput<TSchema> should not be necessary
    fakeState.mutable = root.createMutable(schema, initialValue as d.InferInput<TSchema>);
  }

  useDeferredCleanup(() => {
    fakeState.mutable.buffer.destroy();
  });

  return fakeState.mutable;
}
