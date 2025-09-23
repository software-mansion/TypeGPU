import type * as d from 'typegpu/data';
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

  const [uniformBuffer] = useState(() => {
    return root.createUniform(schema, value);
  });

  useEffect(() => {
    uniformBuffer.write(value);
  }, [value, uniformBuffer]);

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
  const mirroredValue = useMemo(() => ({
    schema,
    get $() {
      return uniformBuffer.$;
    },
  }), []);

  return mirroredValue as MirroredValue<TSchema>;
}
