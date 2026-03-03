import type * as d from 'typegpu/data';
import { useRoot } from './root-context.tsx';
import { useEffect, useRef, useState } from 'react';
import type { TgpuBuffer, ValidateBufferSchema } from 'typegpu';

// TODO: Recreate the buffer when the schema changes
export function useBuffer<TSchema extends d.AnyWgslData>(
  schema: ValidateBufferSchema<TSchema>,
  initialValue?: (() => d.Infer<NoInfer<TSchema>>) | d.Infer<NoInfer<TSchema>>,
): TgpuBuffer<TSchema> {
  const root = useRoot();

  const [buffer] = useState(() => {
    return root.createBuffer(
      schema,
      typeof initialValue === 'function'
        ? (initialValue as () => d.Infer<NoInfer<TSchema>>)()
        : initialValue,
    );
  });

  const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (cleanupRef.current) {
      clearTimeout(cleanupRef.current);
    }

    return () => {
      cleanupRef.current = setTimeout(() => {
        buffer.buffer.destroy();
      }, 200);
    };
  }, [buffer]);

  return buffer;
}
