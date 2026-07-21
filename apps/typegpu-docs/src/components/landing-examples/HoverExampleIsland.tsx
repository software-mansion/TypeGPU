import type { TgpuRoot } from 'typegpu';
import { useConfigureContext, useRoot } from '@typegpu/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
} from 'react';
import { useAtom } from 'jotai';
import { activeExampleAtom } from '../../utils/examples/activeExampleAtom.ts';
import { isGPUSupported } from '../../utils/isGPUSupported.ts';

interface ExampleState {
  onCleanup(): void;
}

interface HoverExampleIslandProps {
  exampleKey: string;
  setup: (root: TgpuRoot, context: GPUCanvasContext) => Promise<ExampleState>;
}

export default function HoverExampleIsland({
  exampleKey,
  setup,
}: HoverExampleIslandProps) {
  const root = useRoot();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);
  const { ctxRef, ref: canvasRef } = useConfigureContext({
    alphaMode: 'premultiplied',
  });
  const twoFingerActiveRef = useRef(false);

  const [activeExample, setActiveExample] = useAtom(activeExampleAtom);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const isActive = activeExample === exampleKey;

  const reset = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = undefined;
  }, []);

  const activate = () => setActiveExample(exampleKey);
  const deactivate = () =>
    setActiveExample((prev) => (prev === exampleKey ? null : prev));

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

  useEffect(() => {
    const overlay = rootRef.current?.closest('[data-hover-overlay]');
    if (!overlay) return;

    overlay.toggleAttribute('data-active', isActive);
    return () => overlay.removeAttribute('data-active');
  }, [isActive]);

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

        if (!ctxRef.current) return;

        const { onCleanup } = await setup(root, ctxRef.current);

        if (cancelled) {
          onCleanup();
          return;
        }

        cleanupRef.current = onCleanup;
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
  }, [isActive, reset, root, setup]);

  return (
    <div
      ref={rootRef}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="relative h-full w-full overflow-hidden"
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      {error ? (
        <p className="absolute inset-0 flex items-center justify-center text-center text-sm font-medium text-white">
          {error}
        </p>
      ) : null}
      {isLoading ? (
        <div className="absolute inset-0 flex h-full w-full items-center justify-center">
          <span className="animate-pulse text-center text-xs font-medium tracking-widest text-white/60 uppercase">
            Loading...
          </span>
        </div>
      ) : null}
    </div>
  );
}
