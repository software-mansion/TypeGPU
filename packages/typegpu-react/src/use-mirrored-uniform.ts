import { useRoot } from './root-context.tsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { d, TgpuBuffer, type ValidateUniformSchema } from 'typegpu';
import { $buffer } from './symbols.ts';

interface MirroredValue<TSchema extends d.AnyWgslData> {
  schema: TSchema;
  readonly $: d.InferGPU<TSchema>;
  readonly [$buffer]: TgpuBuffer<TSchema>;
}

export function useMirroredUniform<
  TSchema extends d.AnyWgslData,
  TValue extends d.InferInput<TSchema>,
>(schema: ValidateUniformSchema<TSchema>, value: TValue): MirroredValue<TSchema> {
  const root = useRoot();
  const [fakeState] = useState(() => ({
    uniform: root.createUniform(schema, value),
  }));

  const prevValueRef = useRef(value);
  const prevSchemaRef = useRef(schema as d.AnyData);

  if (!d.deepEqual(prevSchemaRef.current, schema as d.AnyData)) {
    fakeState.uniform.buffer.destroy();
    fakeState.uniform = root.createUniform(schema, value);
    prevSchemaRef.current = schema as d.AnyData;
    prevValueRef.current = value;
  } else if (prevValueRef.current !== value) {
    fakeState.uniform.write(value);
    prevValueRef.current = value;
  }

  const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (cleanupRef.current) {
      clearTimeout(cleanupRef.current);
    }

    return () => {
      cleanupRef.current = setTimeout(() => {
        fakeState.uniform.buffer.destroy();
      }, 200);
    };
  }, [fakeState]);

  // Using prevSchemaRef instead of schema directly
  // to prevent unnecessary re-memoization when schema object
  // reference changes but content is structurally equivalent.
  // biome-ignore lint/correctness/useExhaustiveDependencies: This value needs to be stable
  const mirroredValue = useMemo(
    () => ({
      [$buffer]: fakeState.uniform.buffer,
      schema: prevSchemaRef.current,
      get $() {
        return fakeState.uniform.$;
      },
    }),
    [prevSchemaRef.current, fakeState],
  );

  return mirroredValue as MirroredValue<TSchema>;
}
