import { debounce } from 'remeda';
import { useMemo, useState, useEffect, useRef } from 'react';

import useEvent from '../common/useEvent';
import { CodeEditor } from '../CodeEditor';
import type { Example } from '../example/types';
import { ExampleState } from './exampleState';
import { executeExample } from './exampleRunner';
import { useLayout } from './layout';
import { Canvas } from '../common/Canvas';
import { Video } from '../common/Video';
import { ExecutionCancelledError } from './errors';

type Props = {
  example: Example;
  codeEditorShowing: boolean;
};

function useExample(exampleCode: string) {
  const exampleRef = useRef<ExampleState | null>(null);
  const { def, createLayout, setRef } = useLayout();

  useEffect(() => {
    let cancelled = false;

    executeExample(exampleCode, createLayout)
      .then((example) => {
        if (cancelled) {
          // Another instance was started in the meantime.
          example.dispose();
          return;
        }

        // Success
        exampleRef.current = example;
      })
      .catch((err) => {
        if (err instanceof SyntaxError) {
          // TODO: Surface the error back to the user
          console.log(err);
        } else if (err instanceof ExecutionCancelledError) {
          // Ignore, to be expected.
          cancelled = true;
        } else {
          throw err;
        }
      });

    return () => {
      exampleRef.current?.dispose();
      cancelled = true;
    };
  }, [exampleCode, createLayout]);

  return {
    def,
    setRef,
  };
}

export function ExampleView({ example, codeEditorShowing }: Props) {
  const { code: initialCode } = example;
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
      <div className="flex-1 self-stretch flex justify-evenly items-center min-h-[50vh]">
        {def.elements.map((element) => {
          if (element.type === 'canvas') {
            return (
              <Canvas
                key={element.key}
                ref={(canvas) => setRef(element.key, canvas)}
                width={element.width}
                height={element.height}
              />
            );
          } else if (element.type === 'video') {
            return (
              <Video
                key={element.key}
                ref={(video) => setRef(element.key, video)}
                width={element.width}
                height={element.height}
              />
            );
          }

          return <p>Unrecognized element</p>;
        })}
      </div>

      {codeEditorShowing ? (
        <div className="relative w-full flex flex-1">
          <div className="absolute inset-0">
            <CodeEditor code={code} onCodeChange={handleCodeChange} />
          </div>
        </div>
      ) : null}
    </>
  );
}
