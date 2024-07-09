import { GUI } from 'dat.gui';
import { useEffect, useRef } from 'react';

import type { ExampleState } from './exampleState';

export function useExampleWithCanvas<
  T extends (gui: dat.GUI, canvas: HTMLCanvasElement) => Promise<ExampleState>,
>(initExampleFn: T) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const exampleRef = useRef<ExampleState | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    let cancelled = false;

    const gui = new GUI({ closeOnTop: true });
    gui.hide();

    initExampleFn(gui, canvasRef.current).then((example) => {
      if (cancelled) {
        // Another instance was started in the meantime.
        example.dispose();
        return;
      }

      // Success
      exampleRef.current = example;
      gui.show();
    });

    return () => {
      exampleRef.current?.dispose();
      gui.destroy();
      cancelled = true;
    };
  }, [initExampleFn]);

  return canvasRef;
}
