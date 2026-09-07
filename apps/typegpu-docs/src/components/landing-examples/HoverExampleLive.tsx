import type { TgpuRoot } from 'typegpu';
import { useConfigureContext, useRoot } from '@typegpu/react';
import { useEffect, useState } from 'react';

interface ExampleState {
  onCleanup(): void;
}

interface HoverExampleLiveProps {
  setup: (root: TgpuRoot, context: GPUCanvasContext) => Promise<ExampleState>;
}

export default function HoverExampleLive({ setup }: HoverExampleLiveProps) {
  const root = useRoot();
  const { ctxRef, ref: canvasRef } = useConfigureContext({
    alphaMode: 'premultiplied',
  });
  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    let onCleanup: (() => void) | undefined;

    void (async () => {
      // Ref callbacks run during the commit phase, before passive effects, so
      // the context is normally already configured here. Guard against the rare
      // case where it isn't yet, retrying until it is (or we're cancelled).
      let tries = 0;
      while (!ctxRef.current) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        tries++;
        if (tries > 100) {
          setError(new Error('Too many retries, context is not available'));
          return;
        }
        if (cancelled) return;
      }
      if (cancelled) return;

      try {
        const example = await setup(root, ctxRef.current);
        onCleanup = () => example.onCleanup();

        if (cancelled) {
          onCleanup();
          return;
        }

        setIsActive(true);
      } catch (err) {
        // Error boundaries can't catch throws from async effect callbacks, so
        // surface the failure into render state to trip the boundary's fallback.
        if (!cancelled) {
          setError(err);
        }
      }
    })();

    return () => {
      onCleanup?.();
      cancelled = true;
    };
  }, [root, setup]);

  if (error) {
    throw error;
  }

  return (
    <canvas
      ref={canvasRef}
      data-active={isActive}
      className="h-full w-full opacity-0 data-[active=true]:opacity-100 transition-opacity ease-out duration-300 backdrop-blur"
    />
  );
}
