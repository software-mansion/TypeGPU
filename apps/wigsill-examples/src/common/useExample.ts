import { useEffect, useRef } from 'react';

import { ExampleState } from './exampleState';

export function useExample<T extends () => Promise<ExampleState>>(
  initExampleFn: T,
) {
  const exampleRef = useRef<ExampleState | null>(null);

  useEffect(() => {
    let cancelled = false;

    initExampleFn().then((example) => {
      if (cancelled) {
        // Another instance was started in the meantime.
        example.dispose();
        return;
      }

      // Success
      exampleRef.current = example;
    });

    return () => {
      exampleRef.current?.dispose();
      cancelled = true;
    };
  }, [initExampleFn]);
}
