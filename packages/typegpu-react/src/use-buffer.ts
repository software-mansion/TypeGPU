import type * as d from 'typegpu/data';
import { useRoot } from './root-context.tsx';
import { useEffect, useRef, useState } from 'react';
import type { TgpuBuffer, ValidateBufferSchema } from 'typegpu';

export interface UseBufferOptions<TSchema extends d.AnyData> {
  initial?: (() => d.Infer<NoInfer<TSchema>>) | d.Infer<NoInfer<TSchema>>;
  onInit?: (buffer: TgpuBuffer<TSchema>) => void;
}

// TODO: Recreate the buffer when the schema changes
export function useBuffer<TSchema extends d.AnyData>(
  schema: ValidateBufferSchema<TSchema>,
  options?: UseBufferOptions<TSchema>,
): TgpuBuffer<TSchema> {
  const { initial, onInit } = options ?? {};
  const root = useRoot();

  const [buffer] = useState(() => {
    const buffer = root.createBuffer(
      schema,
      typeof initial === 'function' ? (initial as () => d.Infer<NoInfer<TSchema>>)() : initial,
    );
    onInit?.(buffer);
    return buffer;
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
