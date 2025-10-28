import type * as d from 'typegpu/data';
import { useRoot } from './root-context.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ValidateUniformSchema } from 'typegpu';

interface UniformValue<TSchema, TValue extends d.Infer<TSchema>> {
  schema: TSchema;
  value: TValue;
  readonly $: d.InferGPU<TSchema>;
}

function initialValueFromSchema<T extends d.AnyWgslData>(
  schema: ValidateUniformSchema<T>,
): d.Infer<T> {
  if (typeof schema !== 'function') {
    throw new Error('Cannot use a non-callable schema with `useUniformValue`');
  }

  return schema() as d.Infer<T>;
}

export function useUniformValue<
  TSchema extends d.AnyWgslData,
  TValue extends d.Infer<TSchema>,
>(
  schema: ValidateUniformSchema<TSchema>,
  initialValue?: TValue | undefined,
): UniformValue<TSchema, TValue> {
  const root = useRoot();

  const [uniformBuffer] = useState(() => {
    return root.createUniform(
      schema,
      initialValue,
    );
  });

  const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (cleanupRef.current) {
      clearTimeout(cleanupRef.current);
    }

    return () => {
      cleanupRef.current = setTimeout(() => {
        uniformBuffer.buffer.destroy();
      }, 200);
    };
  }, [uniformBuffer]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: This value needs to be stable
  const uniformValue = useMemo(() => {
    let currentValue = initialValue ?? initialValueFromSchema(schema) as TValue;
    return {
      schema,
      get value() {
        return currentValue;
      },
      set value(newValue: TValue) {
        currentValue = newValue;
        uniformBuffer.write(newValue);
      },
      get $() {
        return uniformBuffer.$;
      },
    };
  }, []);

  return uniformValue as UniformValue<TSchema, TValue>;
}
