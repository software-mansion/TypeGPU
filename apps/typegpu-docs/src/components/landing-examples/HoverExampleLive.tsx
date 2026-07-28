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

  useEffect(() => {
    let cancelled = false;
    let onCleanup: (() => void) | undefined;

    (async () => {
      if (!ctxRef.current) return;

      const example = await setup(root, ctxRef.current);
      onCleanup = example.onCleanup;

      if (cancelled) {
        onCleanup();
        return;
      }

      setIsActive(true);
    })();

    return () => {
      onCleanup?.();
      cancelled = true;
    };
  }, [root, setup]);

  return (
    <canvas
      ref={canvasRef}
      data-active={isActive}
      className="h-full w-full opacity-0 data-[active=true]:opacity-100 transition-opacity ease-out duration-300 backdrop-blur"
    />
  );
}
