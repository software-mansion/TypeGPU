import cs from 'classnames';
import { useAtomValue, useSetAtom } from 'jotai';
import { compressToEncodedURIComponent } from 'lz-string';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'remeda';
import {
  codeEditorShownAtom,
  codeEditorShownMobileAtom,
} from '../utils/examples/codeEditorShownAtom';
import { currentExampleAtom } from '../utils/examples/currentExampleAtom';
import { ExecutionCancelledError } from '../utils/examples/errors';
import { PLAYGROUND_KEY } from '../utils/examples/exampleContent';
import { exampleControlsAtom } from '../utils/examples/exampleControlAtom';
import { executeExample } from '../utils/examples/exampleRunner';
import type { ExampleState } from '../utils/examples/exampleState';
import { useLayout } from '../utils/examples/layout';
import type { Example } from '../utils/examples/types';
import { isGPUSupported } from '../utils/isGPUSupported';
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

function useExample(
  exampleCode: string,
  setSnackbarText: (text: string | undefined) => void,
  tags?: string[],
) {
  const exampleRef = useRef<ExampleState | null>(null);
  const setExampleControlParams = useSetAtom(exampleControlsAtom);
  const { def, createLayout, setRef } = useLayout();

  useEffect(() => {
    let cancelled = false;
    setSnackbarText(undefined);

    executeExample(exampleCode, createLayout, tags)
      .then((example) => {
        if (cancelled) {
          // Another instance was started in the meantime.
          example.dispose();
          return;
        }

        // Success
        setExampleControlParams(example.controlParams);
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
  }, [
    exampleCode,
    createLayout,
    setSnackbarText,
    setExampleControlParams,
    tags,
  ]);

  return {
    def,
    setRef,
  };
}

export function ExampleView({ example, isPlayground = false }: Props) {
  const { code: initialCode, metadata } = example;
  const [code, setCode] = useState(initialCode);
  const [snackbarText, setSnackbarText] = useState<string | undefined>();
  const setCurrentExample = useSetAtom(currentExampleAtom);
  const codeEditorShowing = useAtomValue(codeEditorShownAtom);
  const codeEditorMobileShowing = useAtomValue(codeEditorShownMobileAtom);

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

  const { def, setRef } = useExample(code, setSnackbarText, metadata.tags);

  return (
    <>
      {snackbarText && isGPUSupported ? <Snackbar text={snackbarText} /> : null}

      <div className="flex flex-col md:grid gap-4 md:grid-cols-[1fr_18.75rem] h-full">
        <div
          className={cs(
            'flex-1 grid gap-4',
            codeEditorShowing ? 'md:grid-rows-2' : '',
          )}
        >
          {isGPUSupported ? (
            <div
              style={{
                scrollbarGutter: 'stable both-edges',
              }}
              className={cs(
                'flex justify-evenly items-center flex-wrap overflow-auto h-full',
                codeEditorShowing ? 'md:max-h-[calc(50vh-3rem)]' : '',
              )}
            >
              {/* Note: This is a temporary measure to allow for simple examples that do not require the @typegpu/example-toolkit package. */}
              {def.elements.length === 0 ? <Canvas aspectRatio={1} /> : null}

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
                      accent
                    />
                  );
                }

                return <p key={element}>Unrecognized element</p>;
              })}
            </div>
          ) : (
            <GPUUnsupportedPanel />
          )}

          {codeEditorShowing || codeEditorMobileShowing ? (
            <div
              className={cs(
                codeEditorShowing && !codeEditorMobileShowing
                  ? 'hidden md:block'
                  : '',
                !codeEditorShowing && codeEditorMobileShowing
                  ? 'md:hidden'
                  : '',
                'absolute bg-tameplum-50 z-20 md:relative h-[calc(100%-2rem)] w-[calc(100%-2rem)] md:w-full md:h-full',
              )}
            >
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

function GPUUnsupportedPanel() {
  return (
    <div className="grid place-content-center text-xl leading-8 text-center">
      <div className="text-3xl">
        WebGPU is not enabled/supported in this browser 😔
      </div>
      <div>(Maybe it's hidden under an experimental flag? 🤔)</div>
      <div className="underline bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark bg-clip-text text-transparent">
        <a href="/TypeGPU/faq">Read more about the availability</a>
      </div>
    </div>
  );
}
