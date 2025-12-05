import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from 'react';
import { useAtom } from 'jotai';
import { activeExampleAtom } from '../utils/examples/activeExampleAtom.ts';
import { executeExample } from '../utils/examples/exampleRunner.ts';
import { isGPUSupported } from '../utils/isGPUSupported.ts';
import type { Example } from '../utils/examples/types.ts';

type Props = {
  exampleKey: string;
};


export default function HoverExampleIsland({ exampleKey }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<() => void | undefined>(undefined);
  const twoFingerActiveRef = useRef(false);
  const [activeExample, setActiveExample] = useAtom(activeExampleAtom);
  const isHovered = activeExample === exampleKey;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const reset = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = undefined;
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
  }, []);

  const handlePointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') {
      setActiveExample(exampleKey);
    }
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') {
      setActiveExample((prev) => (prev === exampleKey ? null : prev));
    }
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length >= 2) {
      event.preventDefault();
      twoFingerActiveRef.current = true;
    }
  };

  const handleTouchMove = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (twoFingerActiveRef.current) {
      event.preventDefault();
    }
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 0) {
      if (!twoFingerActiveRef.current) {
        return;
      }

      twoFingerActiveRef.current = false;
      setActiveExample((prev) => (prev === exampleKey ? null : exampleKey));
    }
  };

  const handleTouchCancel = () => {
    twoFingerActiveRef.current = false;
  };

  useEffect(() => { // intersection observer
    const element = rootRef.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        twoFingerActiveRef.current = false;
        setActiveExample((prev) => (prev === exampleKey ? null : prev));
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { // data hover overlay
    const overlay = containerRef.current?.closest('[data-hover-overlay]');
    if (!overlay) {
      return;
    }

    if (isHovered) {
      overlay.setAttribute('data-active', 'true');
    } else {
      overlay.removeAttribute('data-active');
    }

    return () => overlay.removeAttribute('data-active');
  }, [isHovered]);

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
        if (cancelled) {
          return;
        }
        if (!containerRef.current) {
          return;
        }

        containerRef.current.innerHTML = example.htmlFile.content;
        resizeCanvases(containerRef.current);

        const { dispose } = await executeExample(example.tsImport);
        if (cancelled) {
          dispose();
          return;
        }

        cleanupRef.current = dispose;
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error ? err.message : 'Failed to load example.',
        );
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
      ref={rootRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className='w-full h-full overflow-hidden order'
    >
      {error
        ? (
          <p className='font-medium text-white text-sm text-center'>
            {error}
          </p>
        )
        : (
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

async function loadExample(exampleKey: string): Promise<Example> {
  const exampleContent = await import('../examples/exampleContent.ts');
  const examples = exampleContent.examples as Record<string, Example>;

  const example = examples[exampleKey] as Example | undefined;
  if (!example) {
    throw new Error(`Example "${exampleKey}" not found.`);
  }

  return example;
}

function resizeCanvases(container: HTMLElement) {
  for (const canvas of container.querySelectorAll('canvas')) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr * 2;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
}
