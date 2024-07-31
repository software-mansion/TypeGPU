import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'remeda';
import { ExecutionCancelledError } from '../utils/examples/errors';
import { executeExample } from '../utils/examples/exampleRunner';
import type { ExampleState } from '../utils/examples/exampleState';
import { useLayout } from '../utils/examples/layout';
import type { Example } from '../utils/examples/types';
import useEvent from '../utils/useEvent';
import { CodeEditor } from './CodeEditor';
import { Button } from './design/Button';
import { Canvas } from './design/Canvas';
import { Snackbar } from './design/Snackbar';
import { Table } from './design/Table';
import { Video } from './design/Video';

type Props = {
  example: Example;
  codeEditorShowing: boolean;
};

function useExample(
  exampleCode: string,
  setSnackbarText: (text: string | undefined) => void,
) {
  const exampleRef = useRef<ExampleState | null>(null);
  const { def, createLayout, setRef } = useLayout();

  useEffect(() => {
    let cancelled = false;
    setSnackbarText(undefined);

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
          setSnackbarText(`${err.name}: ${err.message}`);
          console.log(err);
        } else if (err instanceof ExecutionCancelledError) {
          // Ignore, to be expected.
          cancelled = true;
        } else {
          setSnackbarText(`${err.name}: ${err.message}`);
          throw err;
        }
      });

    return () => {
      exampleRef.current?.dispose();
      cancelled = true;
    };
  }, [exampleCode, createLayout, setSnackbarText]);

  return {
    def,
    setRef,
  };
}

export function ExampleView({ example, codeEditorShowing }: Props) {
  const { code: initialCode } = example;
  const [code, setCode] = useState(initialCode);
  const [snackbarText, setSnackbarText] = useState<string | undefined>();

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

  const { def, setRef } = useExample(code, setSnackbarText);

  return (
    <>
      {snackbarText ? <Snackbar text={snackbarText} /> : null}
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

          if (element.type === 'button') {
            return (
              <Button
                key={element.key}
                ref={(button) => setRef(element.key, button)}
                label={element.label}
                onClick={element.onClick}
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
