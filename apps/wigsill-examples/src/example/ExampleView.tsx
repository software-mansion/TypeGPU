import { GUI } from 'dat.gui';
import { debounce } from 'remeda';
import { useMemo, useState, useEffect, useRef } from 'react';

import useEvent from '../common/useEvent';
import { CodeEditor } from '../CodeEditor';
import type { Example } from '../example/types';
import { ExampleState } from './exampleState';
import { executeExample } from './exampleRunner';
import { useLayout } from './layout';
import { Canvas } from '../common/Canvas';

type Props = {
  example: Example;
};

function useExample(exampleCode: string) {
  const exampleRef = useRef<ExampleState | null>(null);
  const { def, addElement, setRef } = useLayout();

  useEffect(() => {
    let cancelled = false;

    const gui = new GUI({ closeOnTop: true });
    gui.hide();

    executeExample(exampleCode, addElement).then((example) => {
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
      cancelled = true;
      gui.destroy();
    };
  }, [exampleCode, addElement]);

  return {
    def,
    setRef,
  };
}

export function ExampleView({ example }: Props) {
  const { code: initialCode, metadata } = example;
  const [code, setCode] = useState(initialCode);

  const setCodeDebouncer = useMemo(
    () => debounce(setCode, { waitMs: 500 }),
    [setCode],
  );

  const handleCodeChange = useEvent((newCode: string) => {
    setCodeDebouncer.call(newCode);
  });

  const { def, setRef } = useExample(code);

  return (
    <>
      <p>Hello {metadata.title}</p>
      <div className="p-6 flex-1 self-stretch flex items-stretch min-h-[50vh]">
        {def.elements.map((_element, index) => {
          return <Canvas key={index} ref={(canvas) => setRef(index, canvas)} />;
        })}
      </div>
      <div className="relative w-full flex flex-1">
        <div className="absolute inset-0">
          <CodeEditor code={code} onCodeChange={handleCodeChange} />
        </div>
      </div>
    </>
  );
}
