import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from 'react';
import { useAtom } from 'jotai';
import { activeExampleAtom } from '../utils/examples/activeExampleAtom.ts';
import { executeExample } from '../utils/examples/exampleRunner.ts';
import { isGPUSupported } from '../utils/isGPUSupported.ts';

type Props = {
  exampleKey: string;
  html: string;
};

export default function HoverExampleIsland({ exampleKey, html }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);
  const twoFingerActiveRef = useRef(false);

  const [activeExample, setActiveExample] = useAtom(activeExampleAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const isActive = activeExample === exampleKey;

  const reset = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = undefined;
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
  }, []);

  const activate = () => setActiveExample(exampleKey);
  const deactivate = () =>
    setActiveExample((prev) => (prev === exampleKey ? null : prev));

  // pointer events
  const handlePointerEnter = (e: ReactPointerEvent) =>
    e.pointerType !== 'touch' && activate();
  const handlePointerLeave = (e: ReactPointerEvent) =>
    e.pointerType !== 'touch' && deactivate();
  const handleTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length >= 2) {
      e.preventDefault();
      twoFingerActiveRef.current = true;
    }
  };
  const handleTouchMove = (e: ReactTouchEvent) => {
    if (twoFingerActiveRef.current) e.preventDefault();
  };
  const handleTouchEnd = (e: ReactTouchEvent) => {
    if (e.touches.length === 0 && twoFingerActiveRef.current) {
      twoFingerActiveRef.current = false;
      setActiveExample((prev) => (prev === exampleKey ? null : exampleKey));
    }
  };
  const handleTouchCancel = () => {
    twoFingerActiveRef.current = false;
  };

  // intersection observer
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) {
        twoFingerActiveRef.current = false;
        deactivate();
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  });

  // Sync data-active attribute on overlay
  useEffect(() => {
    const overlay = containerRef.current?.closest('[data-hover-overlay]');
    if (!overlay) return;

    overlay.toggleAttribute('data-active', isActive);
    return () => overlay.removeAttribute('data-active');
  }, [isActive]);

  // examples runner
  useEffect(() => {
    if (!isActive) {
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

        if (!containerRef.current) return;

        containerRef.current.innerHTML = html;
        hideHelpElement(containerRef.current);
        resizeCanvases(containerRef.current);

        const tsPath = `../pages/landing-examples/${exampleKey}/index.ts`;
        const tsImport = () =>
          import(/* @vite-ignore */ `${tsPath}?t=${Date.now()}`);

        const { dispose } = await executeExample(tsImport);

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
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      reset();
    };
  }, [exampleKey, html, isActive, reset]);

  return (
    <div
      ref={rootRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className='h-full w-full overflow-hidden'
    >
      {error
        ? <p className='text-center font-medium text-sm text-white'>{error}</p>
        : (
          <div className='flex h-full w-full items-center justify-center'>
            {isLoading && (
              <span className='animate-pulse text-center font-medium text-white/60 text-xs uppercase tracking-widest'>
                Loading…
              </span>
            )}
            <div ref={containerRef} className='h-full w-full' />
          </div>
        )}
    </div>
  );
}

function hideHelpElement(container: HTMLElement) {
  const help = container.querySelector<HTMLElement>('#help');
  if (help) help.style.display = 'none';
}

function resizeCanvases(container: HTMLElement) {
  const dpr = window.devicePixelRatio || 1;

  for (const canvas of container.querySelectorAll('canvas')) {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr * 2;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
  }
}
