import * as d from 'typegpu/data';
import { useRoot } from './root-context.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ValidateUniformSchema } from 'typegpu';

export interface MirroredValue<TSchema> {
  schema: TSchema;
  readonly $: d.InferGPU<TSchema>;
}

export function useMirroredUniform<
  TSchema extends d.AnyWgslData,
  TValue extends d.Infer<TSchema>,
>(
  schema: ValidateUniformSchema<TSchema>,
  value: TValue,
): MirroredValue<TSchema> {
  const root = useRoot();
  const [uniformBuffer, setUniformBuffer] = useState(() => {
    return root.createUniform(schema, value);
  });
  const prevSchemaRef = useRef(schema);
  const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let currentBuffer = uniformBuffer;
    if (!d.deepEqual(prevSchemaRef.current as d.AnyData, schema as d.AnyData)) {
      currentBuffer.buffer.destroy();
      currentBuffer = root.createUniform(schema, value);
      setUniformBuffer(currentBuffer);
      prevSchemaRef.current = schema;
    }

    currentBuffer.write(value);
  }, [schema, value, root, uniformBuffer]);

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

  const mirroredValue = useMemo(
    () => ({
      schema,
      get $() {
        return uniformBuffer.$;
      },
    }),
    [schema, uniformBuffer],
  );

  return mirroredValue as MirroredValue<TSchema>;
}
