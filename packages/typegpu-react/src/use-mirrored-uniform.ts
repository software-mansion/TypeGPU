import { useMemo, useRef, useState } from 'react';
import { d, TgpuBuffer, type ValidateUniformSchema } from 'typegpu';

import { $buffer } from './symbols.ts';
import { useRoot } from './root-context.tsx';
import { useChangeDetection, useDeferredCleanup, useStableSchema } from './helper-hooks.ts';

interface MirroredValue<TSchema extends d.AnyWgslData> {
  schema: TSchema;
  readonly $: d.InferGPU<TSchema>;
  readonly [$buffer]: TgpuBuffer<TSchema>;
}

export function useMirroredUniform<
  TSchema extends d.AnyWgslData,
  TValue extends d.InferInput<TSchema>,
>(_schema: ValidateUniformSchema<TSchema>, value: TValue): MirroredValue<TSchema> {
  const root = useRoot();
  const [fakeState] = useState(() => ({
    uniform: root.createUniform(_schema, value),
  }));

  const [schema, schemaChanged] = useStableSchema(_schema);
  const rootChanged = useChangeDetection(root);
  const prevValueRef = useRef(value);

  if (schemaChanged || rootChanged) {
    fakeState.uniform.buffer.destroy();
    fakeState.uniform = root.createUniform(schema, value);
    prevValueRef.current = value;
  } else if (prevValueRef.current !== value) {
    fakeState.uniform.write(value);
    prevValueRef.current = value;
  }

  useDeferredCleanup(() => {
    fakeState.uniform.buffer.destroy();
  });

  const mirroredValue = useMemo(
    () => ({
      [$buffer]: fakeState.uniform.buffer,
      schema,
      get $() {
        return fakeState.uniform.$;
      },
    }),
    [schema, fakeState.uniform],
  );

  return mirroredValue as MirroredValue<TSchema>;
}
