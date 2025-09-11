import type * as d from 'typegpu/data';

interface UniformValue<TSchema, TValue extends d.Infer<TSchema>> {
  schema: TSchema;
  value: TValue;
}

export function useUniformValue<TSchema, TValue extends d.Infer<TSchema>>(
  schema: d.AnyWgslData,
  initialValue?: TValue | undefined,
): UniformValue<TSchema, TValue> {
  // TODO: Implement
}
