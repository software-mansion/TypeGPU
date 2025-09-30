import * as d from 'typegpu/data';
import { useRoot } from './root-context.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ValidateUniformSchema } from 'typegpu';

interface MirroredValue<TSchema> {
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
  const currentSchemaRef = useRef(schema);
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

  useEffect(() => {
    if (!d.deepEqual(prevSchemaRef.current as d.AnyData, schema as d.AnyData)) {
      uniformBuffer.buffer.destroy();
      setUniformBuffer(root.createUniform(schema, value));
      prevSchemaRef.current = schema;
    } else {
      uniformBuffer.write(value);
    }
  }, [schema, value, root, uniformBuffer]);

  if (
    !d.deepEqual(currentSchemaRef.current as d.AnyData, schema as d.AnyData)
  ) {
    currentSchemaRef.current = schema;
  }

  // Using current schema ref instead of schema directly
  // to prevent unnecessary re-memoization when schema object
  // reference changes but content is structurally equivalent.
  // biome-ignore lint/correctness/useExhaustiveDependencies: This value needs to be stable
  const mirroredValue = useMemo(
    () => ({
      schema,
      get $() {
        return uniformBuffer.$;
      },
    }),
    [currentSchemaRef.current, uniformBuffer],
  );

  return mirroredValue as MirroredValue<TSchema>;
}
