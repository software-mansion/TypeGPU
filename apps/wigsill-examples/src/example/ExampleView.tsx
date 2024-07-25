import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'remeda';
import { CodeEditor } from '../CodeEditor';
import { Canvas } from '../common/Canvas';
import { Table } from '../common/Table';
import { Video } from '../common/Video';
import useEvent from '../common/useEvent';
import type { Example } from '../example/types';
import { ExecutionCancelledError } from './errors';
import { executeExample } from './exampleRunner';
import type { ExampleState } from './exampleState';
import { useLayout } from './layout';

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

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  const setCodeDebouncer = useMemo(
    () => debounce(setCode, { waitMs: 500 }),
    [],
  );

  const handleCodeChange = useEvent((newCode: string) => {
    setCodeDebouncer.call(newCode);
  });

  // Handling example HMR
  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  const { def, setRef } = useExample(code);

  return (
    <>
      <div className="flex-1 self-stretch flex justify-evenly items-center flex-wrap min-h-[50vh]">
        {def.elements.map((element) => {
          if (element.type === 'canvas') {
            return (
              <Canvas
                key={element.key}
                ref={(canvas) => setRef(element.key, canvas)}
                width={element.width}
                height={element.height}
                aspectRatio={element.aspectRatio}
              />
            );
          }

          if (element.type === 'video') {
            return (
              <Video
                key={element.key}
                ref={(video) => setRef(element.key, video)}
                width={element.width}
                height={element.height}
              />
            );
          }

          if (element.type === 'table') {
            return (
              <Table
                key={element.key}
                ref={(table) => setRef(element.key, table)}
                label={element.label}
              />
            );
          }

          return <p key={element}>Unrecognized element</p>;
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
