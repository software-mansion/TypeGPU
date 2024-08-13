import cs from 'classnames';
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { compressToEncodedURIComponent } from 'lz-string';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'remeda';
import { codeEditorShownAtom } from '../utils/examples/codeEditorShownAtom';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';
import { ExecutionCancelledError } from '../utils/examples/errors';
import { PLAYGROUND_KEY } from '../utils/examples/exampleContent';
import { executeExample } from '../utils/examples/exampleRunner';
import type { ExampleState } from '../utils/examples/exampleState';
import { useLayout } from '../utils/examples/layout';
import type { Example } from '../utils/examples/types';
import useEvent from '../utils/useEvent';
import { CodeEditor } from './CodeEditor';
import { ControlPanel } from './ControlPanel';
import { Button } from './design/Button';
import { Canvas } from './design/Canvas';
import { Snackbar } from './design/Snackbar';
import { Table } from './design/Table';
import { Video } from './design/Video';

type Props = {
  example: Example;
  isPlayground?: boolean;
};

export type ExampleControlParam<TOption extends string | number> = {
  label: string;
  options:
    | {
        initial: number;
        min?: number;
        max?: number;
        step?: number;
      }
    | {
        initial: TOption;
        options: TOption[];
      }
    | {
        initial: boolean;
      };
  onChange: (newValue: TOption | boolean) => void;
};
export const exampleControlsAtom = atom<ExampleControlParam<string | number>[]>(
  [],
);

function useExample(
  exampleCode: string,
  setSnackbarText: (text: string | undefined) => void,
) {
  const exampleRef = useRef<ExampleState | null>(null);
  const setExampleControlParams = useSetAtom(exampleControlsAtom);
  const { def, createLayout, setRef } = useLayout();

  useEffect(() => {
    let cancelled = false;
    setSnackbarText(undefined);

    executeExample(exampleCode, createLayout, setExampleControlParams)
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
  }, [exampleCode, createLayout, setSnackbarText, setExampleControlParams]);

  return {
    def,
    setRef,
  };
}

export function ExampleView({ example, isPlayground = false }: Props) {
  const { code: initialCode } = example;
  const [code, setCode] = useState(initialCode);
  const [snackbarText, setSnackbarText] = useState<string | undefined>();
  const setCurrentExample = useSetAtom(currentExampleAtom);
  const codeEditorShowing = useAtomValue(codeEditorShownAtom);

  const setCodeWrapper = isPlayground
    ? useCallback(
        (code: string) => {
          const encoded = compressToEncodedURIComponent(code);
          setCurrentExample(`${PLAYGROUND_KEY}${encoded}`);
          localStorage.setItem(PLAYGROUND_KEY, encoded);
          setCode(code);
        },
        [setCurrentExample],
      )
    : setCode;

  useEffect(() => {
    setCodeWrapper(initialCode);
  }, [initialCode, setCodeWrapper]);

  const setCodeDebouncer = useMemo(
    () => debounce(setCodeWrapper, { waitMs: 500 }),
    [setCodeWrapper],
  );

  const handleCodeChange = useEvent((newCode: string) => {
    setCodeDebouncer.call(newCode);
  });

  const { def, setRef } = useExample(code, setSnackbarText);

  return (
    <>
      {snackbarText ? <Snackbar text={snackbarText} /> : null}

      <div className="grid gap-4 grid-cols-[1fr_18.75rem] h-full">
        <div className={cs('grid', codeEditorShowing ? 'grid-rows-2' : '')}>
          <div className="flex justify-evenly items-center flex-wrap min-h-[50vh]">
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
            <div className="relative rounded-xl overflow-hidden bg-grayscale-0">
              <div className="absolute inset-0">
                <CodeEditor code={code} onCodeChange={handleCodeChange} />
              </div>
            </div>
          ) : null}
        </div>

        <ControlPanel />
      </div>
    </>
  );
}
