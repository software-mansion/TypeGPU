import cs from 'classnames';
import { useSetAtom } from 'jotai';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { ExecutionCancelledError } from '../utils/errors';
import { exampleControlsAtom } from '../utils/exampleControlAtom';
import { executeExample } from '../utils/exampleRunner';
import type { ExampleState } from '../utils/exampleState';
import { isGPUSupported } from '../utils/isGPUSupported';
import { ControlPanel } from './ControlPanel';
import { Snackbar } from './design/Snackbar';

type Props = {
  example: { tsCode: string; htmlCode: string };
  isPlayground?: boolean;
};

function useExample(
  exampleCode: string,
  htmlCode: string,
  setSnackbarText: (text: string | undefined) => void,
  tags?: string[],
) {
  const exampleRef = useRef<ExampleState | null>(null);
  const setExampleControlParams = useSetAtom(exampleControlsAtom);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload example on html change
  useEffect(() => {
    let cancelled = false;
    setSnackbarText(undefined);

    executeExample(exampleCode, tags)
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
  }, [exampleCode, htmlCode, setSnackbarText, setExampleControlParams, tags]);
}

export function ExampleView({ example }: Props) {
  const { tsCode, htmlCode } = example;

  const [snackbarText, setSnackbarText] = useState<string | undefined>();

  const exampleHtmlRef = useRef<HTMLDivElement>(null);

  useExample(tsCode, htmlCode, setSnackbarText);
  useResizableCanvas(exampleHtmlRef, htmlCode);

  return (
    <>
      {snackbarText && isGPUSupported ? <Snackbar text={snackbarText} /> : null}

      <div className="flex flex-col md:grid gap-4 md:grid-cols-[1fr_18.75rem] h-full">
        <div className={cs('flex-1 grid gap-4')}>
          {isGPUSupported ? (
            <div
              style={{
                scrollbarGutter: 'stable',
              }}
              className={cs(
                'flex justify-evenly items-center flex-wrap overflow-auto h-full box-border',
              )}
            >
              <div
                ref={exampleHtmlRef}
                className="contents w-full h-full"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: setting innerHtml from code editor input
                dangerouslySetInnerHTML={{ __html: htmlCode }}
              />
            </div>
          ) : (
            <GPUUnsupportedPanel />
          )}
        </div>
        <ControlPanel />
      </div>
    </>
  );
}

function GPUUnsupportedPanel() {
  return (
    <div className="grid gap-6 text-xl leading-tight text-center place-content-center">
      <div className="text-3xl">
        WebGPU is not enabled/supported in this browser 😔
      </div>
      <div>Maybe it's hidden under an experimental flag? 🤔</div>

      <a
        href="/TypeGPU/blog/troubleshooting"
        className="text-transparent underline bg-gradient-to-r from-gradient-purple-dark to-gradient-blue-dark bg-clip-text"
      >
        Read more about the availability
      </a>
    </div>
  );
}

function useResizableCanvas(
  exampleHtmlRef: RefObject<HTMLDivElement>,
  htmlCode: string,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: should be run on every htmlCode change
  useEffect(() => {
    const canvases = exampleHtmlRef.current?.querySelectorAll('canvas') as
      | HTMLCanvasElement[]
      | undefined;
    const observers: ResizeObserver[] = [];

    for (const canvas of canvases ?? []) {
      if ('width' in canvas.attributes || 'height' in canvas.attributes) {
        continue; // custom canvas, not replacing with resizable
      }

      const newCanvas = document.createElement('canvas');
      const container = document.createElement('div');
      const frame = document.createElement('div');

      frame.appendChild(newCanvas);
      container.appendChild(frame);

      const aspectRatio = canvas.dataset.aspectRatio ?? '1';

      container.style.containerType = 'size';
      container.style.flex = '1';
      container.style.display = 'flex';
      container.style.justifyContent = 'center';
      container.style.alignItems = 'center';
      container.style.height = '100%';

      frame.style.position = 'relative';
      frame.style.aspectRatio = aspectRatio;
      frame.style.height = `min(calc(min(100cqw, 100cqh)/(${aspectRatio})), min(100cqw, 100cqh))`;

      // @ts-ignore
      for (const prop of canvas.style) {
        // @ts-ignore
        newCanvas.style[prop] = canvas.style[prop];
      }

      // @ts-ignore
      for (const attribute of canvas.attributes) {
        // @ts-ignore
        newCanvas[attribute.name] = attribute.value;
      }
      newCanvas.style.position = 'absolute';
      newCanvas.style.width = '100%';
      newCanvas.style.height = '100%';

      canvas.parentElement?.replaceChild(container, canvas);

      const onResize = () => {
        newCanvas.width = frame.clientWidth * window.devicePixelRatio;
        newCanvas.height = frame.clientHeight * window.devicePixelRatio;
      };

      onResize();

      const observer = new ResizeObserver(onResize);
      observer.observe(container);
      observers.push(observer);
    }

    return () => {
      for (const observer of observers) {
        observer.disconnect();
      }
    };
  }, [exampleHtmlRef, htmlCode]);
}
