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
    mutable: root.createMutable(_schema, initialValue),
  }));

  const [schema, schemaChanged] = useStableSchema(_schema);
  const rootChanged = useChangeDetection(root);

  if (schemaChanged || rootChanged) {
    fakeState.mutable.buffer.destroy();
    fakeState.mutable = root.createMutable(schema, initialValue);
  }

  useDeferredCleanup(() => {
    fakeState.mutable.buffer.destroy();
  });

  return fakeState.mutable;
}
