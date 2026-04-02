import type * as d from 'typegpu/data';
import { useMemo, useState } from 'react';
import type { TgpuBuffer, ValidateUniformSchema } from 'typegpu';

import { $buffer } from './symbols.ts';
import { useRoot } from './root-context.tsx';
import { useChangeDetection, useDeferredCleanup, useStableSchema } from './helper-hooks.ts';

export interface UniformValue<TSchema extends d.BaseData, TValue extends d.Infer<TSchema>> {
  schema: TSchema;
  value: TValue;
  readonly $: d.InferGPU<TSchema>;
  readonly [$buffer]: TgpuBuffer<TSchema>;
}

function initialValueFromSchema<T extends d.AnyWgslData>(
  schema: ValidateUniformSchema<T>,
): d.Infer<T> {
  if (typeof schema !== 'function') {
    throw new Error('Cannot use a non-callable schema with `useUniformValue`');
  }

  return schema() as d.Infer<T>;
}

export function useUniformValue<TSchema extends d.AnyWgslData, TValue extends d.Infer<TSchema>>(
  _schema: ValidateUniformSchema<TSchema>,
  initialValue?: TValue,
): UniformValue<TSchema, TValue> {
  const root = useRoot();

  const [fakeState] = useState(() => ({
    currentValue: initialValue ?? (initialValueFromSchema(_schema) as TValue),
    uniform: root.createUniform(_schema, initialValue),
  }));

  const [schema, schemaChanged] = useStableSchema(_schema);
  const rootChanged = useChangeDetection(root);

  if (schemaChanged || rootChanged) {
    fakeState.uniform.buffer.destroy();
    fakeState.uniform = root.createUniform(schema, fakeState.currentValue);
  }

  useDeferredCleanup(() => {
    fakeState.uniform.buffer.destroy();
  });

  const uniformValue = useMemo(() => {
    return {
      schema,
      [$buffer]: fakeState.uniform.buffer,
      get value() {
        return fakeState.currentValue;
      },
      set value(newValue: TValue) {
        fakeState.currentValue = newValue;
        fakeState.uniform.write(newValue);
      },
      get $() {
        return fakeState.uniform.$;
      },
    };
  }, [schema, fakeState.uniform]);

  return uniformValue as UniformValue<TSchema, TValue>;
}
