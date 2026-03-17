import { useRoot } from './root-context.tsx';
import { useEffect, useRef, useState } from 'react';
import type { TgpuMutable, ValidateStorageSchema, d } from 'typegpu';

export function useMutable<TSchema extends d.AnyWgslData>(
  schema: ValidateStorageSchema<TSchema>,
  initialValue?: d.Infer<TSchema>,
): TgpuMutable<TSchema> {
  const root = useRoot();

  const [mutable] = useState(() => {
    return root.createMutable(schema, initialValue);
  });

  const cleanupRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (cleanupRef.current) {
      clearTimeout(cleanupRef.current);
    }

    return () => {
      cleanupRef.current = setTimeout(() => {
        mutable.buffer.destroy();
      }, 200);
    };
  }, [mutable]);

  return mutable;
}
