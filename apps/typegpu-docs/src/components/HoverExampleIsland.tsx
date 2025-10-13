import { useCallback, useEffect, useRef, useState } from 'react';
import { executeExample } from '../utils/examples/exampleRunner.ts';
import { isGPUSupported } from '../utils/isGPUSupported.ts';
import type { Example } from '../utils/examples/types.ts';

type Props = {
  exampleKey: string;
};

type CleanupFn = () => void;

async function loadExample(exampleKey: string): Promise<Example> {
  const exampleContent = await import('../examples/exampleContent.ts');
  const examples = exampleContent.examples as Record<string, Example>;

  const example = examples[exampleKey] as Example | undefined;
  if (!example) {
    throw new Error(`Example "${exampleKey}" not found.`);
  }

  return example;
}


function stretchCanvases(container: HTMLElement) {
  container.querySelectorAll('canvas').forEach((canvas) => {
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  });
}

export default function HoverExampleIsland({ exampleKey }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<CleanupFn | undefined>(undefined);
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const reset = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = undefined;
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
  }, []);


  useEffect(() => {
    if (!isHovered) {
      reset();
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        setError(undefined);

        if (!isGPUSupported) {
          throw new Error('WebGPU is not enabled/supported in this browser.');
        }

        const example = await loadExample(exampleKey);
        if (!containerRef.current) {
          return;
        }

        containerRef.current.innerHTML = example.htmlFile.content;
        stretchCanvases(containerRef.current);

        const { dispose } = await executeExample(example.tsImport);
        if (cancelled) {
          dispose();
          return;
        }

        cleanupRef.current = dispose;
      } catch (err) {
        console.error(err);
        reset();
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      reset();
    };
  }, [exampleKey, isHovered, reset]);

  return (
    <div
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      className='border-white/10 w-full h-full overflow-hidden order'
    >
      {error ? (
        <p className='font-medium text-white text-sm text-center'>
          {error}
        </p>
      ) : (
        <div className='flex justify-center items-center w-full h-full'>
          {isLoading && (
            <span className='font-medium text-white/60 text-xs text-center uppercase tracking-widest animate-pulse'>
              Loading…
            </span>
          )}
          <div ref={containerRef} className='w-full h-full' />
        </div>
      )}
    </div>
  );
}
