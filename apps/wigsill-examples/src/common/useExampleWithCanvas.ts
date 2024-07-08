import { useEffect, useRef } from 'react';

import type { ExampleState } from './exampleState';

export function useExampleWithCanvas<
  T extends (canvas: HTMLCanvasElement) => Promise<ExampleState>,
>(initExampleFn: T) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exampleRef = useRef<ExampleState | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    let cancelled = false;

    initExampleFn(canvasRef.current).then((example) => {
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

  return {
    canvasRef,
  };
}
