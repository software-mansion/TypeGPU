import { useEffect, useRef } from 'react';
import { d } from 'typegpu';

import useStableEvent from './use-stable-event.ts';

export function useStableSchema<T>(schema: T): [T, /* schemaChanged */ boolean] {
  const prevSchemaRef = useRef(schema as d.AnyData);

  if (!d.schemasEqualStructurally(prevSchemaRef.current, schema as d.AnyData)) {
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

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => valuesEqual(item, b[i]));
  }
  if (
    typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every(
        (key) =>
          Object.hasOwn(b, key) &&
          valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
      )
    );
  }
  return false;
}

/**
 * Like `useChangeDetection`, but compares plain objects and arrays by value, so that an
 * options object recreated on every render only counts as changed when its contents do.
 */
export function useValueChangeDetection<T>(value: T): boolean {
  const prevValueRef = useRef(value);

  if (!valuesEqual(prevValueRef.current, value)) {
    prevValueRef.current = value;
    return true;
  }

  return false;
}

export function useDeferredCleanup(_cb: () => void) {
  const cleanupRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cb = useStableEvent(_cb);

  useEffect(() => {
    if (cleanupRef.current) {
      clearTimeout(cleanupRef.current);
    }

    return () => {
      cleanupRef.current = setTimeout(cb, 200);
    };
  }, [cb]);
}
