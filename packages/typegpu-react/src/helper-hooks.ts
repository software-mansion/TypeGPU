import { useEffect, useRef } from 'react';
import { d } from 'typegpu';
import useEffectEvent from './use-effect-event';

export function useStableSchema<T>(schema: T): [T, /* schemaChanged */ boolean] {
  const prevSchemaRef = useRef(schema as d.AnyData);

  if (!d.deepEqual(prevSchemaRef.current, schema as d.AnyData)) {
    prevSchemaRef.current = schema as d.AnyData;
    return [schema, true];
  }

  return [prevSchemaRef.current as T, false];
}

export function useChangeDetection<T>(value: T): boolean {
  const prevValueRef = useRef(value);

  if (prevValueRef.current !== value) {
    prevValueRef.current = value;
    return true;
  }

  return false;
}

export function useDeferredCleanup(_cb: () => void) {
  const cleanupRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cb = useEffectEvent(_cb);

  useEffect(() => {
    if (cleanupRef.current) {
      clearTimeout(cleanupRef.current);
    }

    return () => {
      cleanupRef.current = setTimeout(cb, 200);
    };
  }, [cb]);
}
