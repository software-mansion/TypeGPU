'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';

export namespace ClientOnly {
  export interface Props {
    children?: ReactNode | undefined;
    fallback?: ReactNode | undefined;
  }
}

/**
 * Only mounts children when the component is being rendered on the client.
 * Returns `fallback` on the server, as well as wraps the content in <Suspense>
 * with the same fallback.
 */
export function ClientOnly(props: ClientOnly.Props) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return props.fallback ?? null;
  }

  return <Suspense fallback={props.fallback}>{props.children}</Suspense>;
}
