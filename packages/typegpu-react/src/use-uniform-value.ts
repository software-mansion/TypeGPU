import type * as d from 'typegpu/data';
import { useRoot } from './root-context.tsx';
import { useMemo } from 'react';

interface UniformValue<TSchema, TValue extends d.Infer<TSchema>> {
  schema: TSchema;
  value: TValue | undefined;
  readonly $: d.InferGPU<TSchema>;
}

export function useUniformValue<
  TSchema extends d.AnyWgslData,
  TValue extends d.Infer<TSchema>,
>(
  schema: TSchema,
  initialValue?: TValue | undefined,
): UniformValue<TSchema, TValue> {
  const root = useRoot();

  const uniformBuffer = useMemo(() => {
    // biome-ignore lint/suspicious/noExplicitAny: Constraint validation issue with ValidateUniformSchema
    return root.createUniform(schema as any, initialValue);
  }, [root, schema, initialValue]);

  const uniformValue = useMemo(() => {
    let currentValue = initialValue;
    return {
      schema,
      get value() {
        return currentValue;
      },
      set value(newValue: TValue | undefined) {
        currentValue = newValue;
        if (newValue !== undefined) {
          uniformBuffer.write(newValue);
        }
      },
      get $() {
        return uniformBuffer.$;
      },
    };
  }, [schema, uniformBuffer, initialValue]);

  return uniformValue;
}
