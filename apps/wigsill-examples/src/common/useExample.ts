import { GUI } from 'dat.gui';
import { useEffect, useRef } from 'react';

import { ExampleState } from './exampleState';

export function useExample<T extends (gui: dat.GUI) => Promise<ExampleState>>(
  initExampleFn: T,
) {
  const exampleRef = useRef<ExampleState | null>(null);

  useEffect(() => {
    let cancelled = false;

    const gui = new GUI({ closeOnTop: true });
    gui.hide();

    initExampleFn(gui).then((example) => {
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
}
